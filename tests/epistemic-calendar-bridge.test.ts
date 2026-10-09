import { describe, it, expect, beforeEach } from 'vitest';
import {
  EpistemicCalendarBridge,
  DEFAULT_IMPERIAL_CALENDAR,
  DEFAULT_SATELLITES,
} from '../src/core/causality/EpistemicCalendarBridge.js';

describe('EpistemicCalendarBridge (Worldcraft Core 暦法・認知フォグ実結合)', () => {
  let bridge: EpistemicCalendarBridge;

  beforeEach(() => {
    bridge = new EpistemicCalendarBridge();

    // 拠点登録
    bridge.registerLocation({ id: 'loc_capital', name: '王都ルディオン', x: 0, y: 0 });
    bridge.registerLocation({ id: 'loc_north_fort', name: '北方要塞', x: 0, y: 200 }); // 200km
    bridge.registerLocation({ id: 'loc_outpost', name: '最果ての哨所', x: 150, y: 200 }); // 北方要塞から150km
    bridge.registerLocation({ id: 'loc_astral_tower', name: '星見の巨塔', x: 300, y: 400 }); // 500km

    // 通信経路登録 (有向非巡回グラフ DAG)
    // 飛脚 (50km/日) -> 200km = 4日
    bridge.addPropagationChannel({
      id: 'ch_cap_to_fort',
      sourceLocationId: 'loc_capital',
      targetLocationId: 'loc_north_fort',
      method: { type: 'courier', speedKmPerDay: 50 },
    });

    // 飛脚 (50km/日) -> 150km = 3日 (王都からは累計 4 + 3 = 7日)
    bridge.addPropagationChannel({
      id: 'ch_fort_to_outpost',
      sourceLocationId: 'loc_north_fort',
      targetLocationId: 'loc_outpost',
      method: { type: 'courier', speedKmPerDay: 50 },
    });

    // 伝書鳩 (300km/日) -> 500km = 2日 (Math.ceil(500/300) = 2日)
    bridge.addPropagationChannel({
      id: 'ch_cap_to_tower',
      sourceLocationId: 'loc_capital',
      targetLocationId: 'loc_astral_tower',
      method: { type: 'pigeon', speedKmPerDay: 300 },
    });

    // 登場人物登録
    bridge.registerCharacter({
      id: 'char_valerius',
      name: 'ヴァレリウス将軍',
      locationId: 'loc_north_fort',
      birthYear: 700,
      deathYear: 780,
    });

    bridge.registerCharacter({
      id: 'char_arthur',
      name: 'アーサー',
      locationId: 'loc_outpost',
      birthYear: 724,
      deathYear: 790,
    });

    bridge.registerCharacter({
      id: 'char_elena',
      name: '皇女エレナ',
      locationId: 'loc_astral_tower',
      birthYear: 720,
    });

    // 事件登録: 王都クーデター (発生日: 100日目)
    bridge.registerEvent({
      id: 'evt_coup',
      name: '王都クーデター事変',
      locationId: 'loc_capital',
      occurrenceDay: 100,
    });
  });

  describe('1. 架空暦法・絶対日双方向変換', () => {
    it('架空暦日付から絶対日（スカラー日）への変換が正確であること', () => {
      // 1年12ヶ月、各月30日（1年=360日）
      const d1 = { year: 1, month: 1, day: 1 };
      expect(bridge.toAbsoluteDays(d1)).toBe(0);

      const d2 = { year: 1, month: 2, day: 1 };
      expect(bridge.toAbsoluteDays(d2)).toBe(30);

      const d3 = { year: 2, month: 1, day: 1 };
      expect(bridge.toAbsoluteDays(d3)).toBe(360);
    });

    it('絶対日から架空暦日付への逆変換が可逆・正確であること', () => {
      const d = bridge.fromAbsoluteDays(395);
      expect(d.year).toBe(2);
      expect(d.month).toBe(2);
      expect(d.day).toBe(6); // 360 + 30 + 5 (0-indexed day offset 5 -> day 6)
    });
  });

  describe('2. 多重衛星月相 ＆ 合（Conjunction）シミュレーション', () => {
    it('第一衛星ルナ（28日周期）と第二衛星セレーネ（42日周期）の月相が算出されること', () => {
      const status = bridge.getCalendarStatus(28);
      expect(status.moonPhases.length).toBe(2);
      expect(status.moonPhases[0].id).toBe('sat_luna');
      expect(status.moonPhases[0].phase).toBe(0); // 28 % 28 = 0 (新月)
      expect(status.moonPhases[0].phaseName).toBe('新月');
    });

    it('原稿内の月相指定（満月・新月・上弦）との一致判定が正確に行われること', () => {
      // ルナ 14日目: 満月 (14/28 = 0.5)
      const resFull = bridge.verifyMoonPhaseMention('sat_luna', 14, '満月');
      expect(resFull.isValid).toBe(true);
      expect(resFull.actualPhaseName).toBe('満月');

      // ルナ 14日目に「新月」と書くと不一致警告
      const resMismatch = bridge.verifyMoonPhaseMention('sat_luna', 14, '新月');
      expect(resMismatch.isValid).toBe(false);
      expect(resMismatch.reason).toContain('天体暦矛盾');
    });

    it('多重満月合（二重満月合）の検出が正確に判定されること', () => {
      // ルナ 14日目 (0.5=満月)、セレーネ (t + 14) % 42 -> t=7のとき 21/42=0.5
      // t=70: ルナ (70%28 = 14 -> 0.5満月), セレーネ ((70+14)%42 = 84%42 = 0 -> 新月)
      // 両者が満月になる日: ルナ t = 14 + 28k, セレーネ t + 14 = 21 + 42m -> t = 7 + 42m
      // t = 70 (ルナ14, セレ0), t = 350, etc.
      const statusAt14 = bridge.getCalendarStatus(14);
      expect(statusAt14.moonPhases[0].isFullMoon).toBe(true);
    });
  });

  describe('3. 多段階中継拠点情報伝達遅延 ＆ 認知フォグ検証', () => {
    it('北方要塞への情報到達日（4日後 = Day 104）が計算されること', () => {
      const arrival = bridge.calculateArrivalInfoForCharacter('evt_coup', 'char_valerius');
      expect(arrival).not.toBeNull();
      expect(arrival?.arrivalDay).toBe(104);
      expect(arrival?.delayDays).toBe(4);
      expect(arrival?.method).toBe('courier');
      expect(arrival?.path).toEqual(['loc_capital', 'loc_north_fort']);
    });

    it('最果ての哨所への多段中継情報到達日（4+3=7日後 = Day 107）が計算されること', () => {
      const arrival = bridge.calculateArrivalInfoForCharacter('evt_coup', 'char_arthur');
      expect(arrival).not.toBeNull();
      expect(arrival?.arrivalDay).toBe(107);
      expect(arrival?.delayDays).toBe(7);
      expect(arrival?.path).toEqual(['loc_capital', 'loc_north_fort', 'loc_outpost']);
    });

    it('星見の巨塔への伝書鳩情報到達日（2日後 = Day 102）が計算されること', () => {
      const arrival = bridge.calculateArrivalInfoForCharacter('evt_coup', 'char_elena');
      expect(arrival).not.toBeNull();
      expect(arrival?.arrivalDay).toBe(102);
      expect(arrival?.delayDays).toBe(2);
      expect(arrival?.method).toBe('pigeon');
    });

    it('情報未到達日（Day 103）にヴァレリウス（到達日104）が言及すると認知フォグ違反が発報されること', () => {
      const check = bridge.verifyEpistemicMention('char_valerius', 'evt_coup', 103);
      expect(check.status).toBe('VIOLATION');
      expect(check.calculatedArrivalDay).toBe(104);
      expect(check.mentionDay).toBe(103);
      expect(check.reason).toContain('認知フォグ違反');
    });

    it('情報到達日以降（Day 104）に言及した場合は正常（VALID）と判定されること', () => {
      const check = bridge.verifyEpistemicMention('char_valerius', 'evt_coup', 104);
      expect(check.status).toBe('VALID');
      expect(check.calculatedArrivalDay).toBe(104);
    });
  });

  describe('4. 登場人物生没年境界検証', () => {
    it('誕生年以前のアクションで生没年境界違反を発報すること', () => {
      const check = bridge.verifyCharacterLifespan('char_arthur', 720); // 誕生 724年
      expect(check.isValid).toBe(false);
      expect(check.reason).toContain('生没年境界違反');
      expect(check.reason).toContain('誕生年（第724年）以前');
    });

    it('死亡年以降のアクションで生没年境界違反を発報すること', () => {
      const check = bridge.verifyCharacterLifespan('char_valerius', 785); // 死亡 780年
      expect(check.isValid).toBe(false);
      expect(check.reason).toContain('生没年境界違反');
      expect(check.reason).toContain('死亡年（第780年）以降');
    });

    it('生存期間内のアクションは正常と判定されること', () => {
      const check = bridge.verifyCharacterLifespan('char_valerius', 742);
      expect(check.isValid).toBe(true);
    });
  });
});
