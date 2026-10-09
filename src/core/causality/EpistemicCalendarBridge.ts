/**
 * EpistemicCalendarBridge - Worldcraft Core 暦法シミュレータ ＆ 認知フォグ伝達遅延 統合ブリッジ
 *
 * @worldcraft/core の CelestialCalendarEngine および EpistemicPropagationSimulator を統合し、
 * エディタ・タイムライン・インスペクターに対して架空暦、多重衛星月相、情報伝達遅延DAG、
 * 登場人物認知フォグ（情報未到達言及違反・生没年境界違反）のリアルタイム数理検証を提供する。
 */

import {
  CelestialCalendarEngine,
  type CustomDate,
  type CalendarDefinition,
  type SatelliteDefinition,
  EpistemicPropagationSimulator,
  type LocationNode,
  type CharacterNode,
  type EventNode,
  type PropagationChannel,
  type PropagationVerificationResult,
  type CharacterArrivalInfo,
} from '@core';

export interface MoonPhaseStatus {
  id: string;
  name: string;
  phase: number; // 0.0 - 1.0 (軌道進行度)
  fullness: number; // 0.0 - 1.0 (満月度: 満月時 1.0, 新月時 0.0)
  phaseName: string;
  isFullMoon: boolean;
  isNewMoon: boolean;
}

export interface CalendarStatusReport {
  currentDate: CustomDate;
  absoluteDay: number;
  formattedDate: string;
  moonPhases: MoonPhaseStatus[];
  isConjunction: boolean; // 多重衛星の合（二重満月・新月合等）
  conjunctionDescription?: string;
}

export interface MoonPhaseVerificationResult {
  isValid: boolean;
  satelliteId: string;
  satelliteName: string;
  actualPhase: number;
  actualPhaseName: string;
  expectedPhaseCategory: string;
  reason?: string;
}

export const DEFAULT_IMPERIAL_CALENDAR: CalendarDefinition = {
  id: 'imperial_cal',
  name: '帝国標準星辰暦',
  monthsPerYear: 12,
  daysPerMonth: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  leapYearInterval: 4,
};

export const DEFAULT_SATELLITES: SatelliteDefinition[] = [
  {
    id: 'sat_luna',
    name: '第一衛星ルナ（蒼月）',
    synodicPeriodDays: 28,
    phaseOffsetDays: 0,
  },
  {
    id: 'sat_selene',
    name: '第二衛星セレーネ（紅月）',
    synodicPeriodDays: 42,
    phaseOffsetDays: 14,
  },
];

export class EpistemicCalendarBridge {
  private calendarEngine: CelestialCalendarEngine;
  private propagationSimulator: EpistemicPropagationSimulator;
  private satellites: SatelliteDefinition[];
  private calendarDef: CalendarDefinition;
  private characterLifespans: Map<string, { birthYear?: number; deathYear?: number }> = new Map();

  constructor(
    calendarDef: CalendarDefinition = DEFAULT_IMPERIAL_CALENDAR,
    satellites: SatelliteDefinition[] = DEFAULT_SATELLITES,
    locations: LocationNode[] = [],
    channels: PropagationChannel[] = []
  ) {
    this.calendarDef = { ...calendarDef };
    this.satellites = [...satellites];
    this.calendarEngine = new CelestialCalendarEngine(this.calendarDef, this.satellites);
    this.propagationSimulator = new EpistemicPropagationSimulator();

    for (const loc of locations) {
      this.propagationSimulator.registerLocation(loc);
    }
    for (const ch of channels) {
      this.propagationSimulator.addPropagationChannel(ch);
    }
  }

  public getCalendarDefinition(): CalendarDefinition {
    return this.calendarDef;
  }

  public getSatellites(): SatelliteDefinition[] {
    return this.satellites;
  }

  public updateCalendarConfig(calendarDef: CalendarDefinition, satellites?: SatelliteDefinition[]): void {
    this.calendarDef = { ...calendarDef };
    if (satellites) {
      this.satellites = [...satellites];
    }
    this.calendarEngine = new CelestialCalendarEngine(this.calendarDef, this.satellites);
  }

  public registerLocation(location: LocationNode): void {
    this.propagationSimulator.registerLocation(location);
  }

  public registerCharacter(character: CharacterNode): void {
    this.propagationSimulator.registerCharacter(character);
    if (character.birthYear !== undefined || character.deathYear !== undefined) {
      this.characterLifespans.set(character.id, {
        birthYear: character.birthYear,
        deathYear: character.deathYear,
      });
    }
  }

  public updateCharacterLocation(characterId: string, locationId: string): void {
    this.propagationSimulator.updateCharacterLocation(characterId, locationId);
  }

  public registerEvent(event: EventNode): void {
    this.propagationSimulator.registerEvent(event);
  }

  public addPropagationChannel(channel: PropagationChannel): void {
    this.propagationSimulator.addPropagationChannel(channel);
  }

  public toAbsoluteDays(date: CustomDate): number {
    return this.calendarEngine.toAbsoluteDays(date);
  }

  public fromAbsoluteDays(absoluteDays: number): CustomDate {
    return this.calendarEngine.fromAbsoluteDays(absoluteDays);
  }

  public getMoonPhase(satelliteId: string, absoluteDays: number): number {
    return this.calendarEngine.getMoonPhase(satelliteId, absoluteDays);
  }

  public getMoonPhaseName(phaseValue: number): string {
    const semantic = this.calendarEngine.getMoonPhaseName(phaseValue);
    switch (semantic) {
      case 'NEW':
        return '新月';
      case 'WAXING_CRESCENT':
        return '三日月';
      case 'FIRST_QUARTER':
        return '上弦の月';
      case 'WAXING_GIBBOUS':
        return '十三夜（十日夜）';
      case 'FULL':
        return '満月';
      case 'WANING_GIBBOUS':
        return '十六夜・居待月';
      case 'LAST_QUARTER':
        return '下弦の月';
      case 'WANING_CRESCENT':
        return '有明月';
      default:
        return '月相不明';
    }
  }

  public getCalendarStatus(dateOrAbsoluteDay: CustomDate | number): CalendarStatusReport {
    let date: CustomDate;
    let absoluteDay: number;

    if (typeof dateOrAbsoluteDay === 'number') {
      absoluteDay = dateOrAbsoluteDay;
      date = this.calendarEngine.fromAbsoluteDays(absoluteDay);
    } else {
      date = dateOrAbsoluteDay;
      absoluteDay = this.calendarEngine.toAbsoluteDays(date);
    }

    const moonPhases: MoonPhaseStatus[] = this.satellites.map((sat) => {
      const phase = this.calendarEngine.getMoonPhase(sat.id, absoluteDay);
      const phaseName = this.getMoonPhaseName(phase);
      const isFull = phase >= 0.4375 && phase <= 0.5625;
      const isNew = phase < 0.0625 || phase >= 0.9375;
      // 満月度 (fullness): 満月(0.5)で1.0、新月(0.0/1.0)で0.0
      const fullness = Number((1.0 - Math.abs(phase - 0.5) * 2).toFixed(3));
      return {
        id: sat.id,
        name: sat.name,
        phase: Number(phase.toFixed(3)),
        fullness: Math.max(0, Math.min(1, fullness)),
        phaseName,
        isFullMoon: isFull,
        isNewMoon: isNew,
      };
    });

    const allFull = moonPhases.length > 1 && moonPhases.every((m) => m.isFullMoon);
    const allNew = moonPhases.length > 1 && moonPhases.every((m) => m.isNewMoon);
    const isConjunction = allFull || allNew;

    let conjunctionDescription: string | undefined;
    if (allFull) {
      conjunctionDescription = `✦ 二重満月合（Double Full Moon Conjunction）: 全衛星が満月配列に同期`;
    } else if (allNew) {
      conjunctionDescription = `✦ 二重新月合（Double New Moon Conjunction）: 朔月重合・皆既暗夜`;
    }

    const formattedDate = `第${date.year}年 第${date.month}月 ${date.day}日`;

    return {
      currentDate: date,
      absoluteDay,
      formattedDate,
      moonPhases,
      isConjunction,
      conjunctionDescription,
    };
  }

  /**
   * 原稿内の月相指定（「満月」「新月」「上弦」等）と天体暦の数理的一致を検証
   */
  public verifyMoonPhaseMention(
    satelliteId: string,
    dateOrAbsoluteDay: CustomDate | number,
    expectedPhaseCategory: string
  ): MoonPhaseVerificationResult {
    const sat = this.satellites.find((s) => s.id === satelliteId);
    const satName = sat?.name || satelliteId;

    const absDay = typeof dateOrAbsoluteDay === 'number'
      ? dateOrAbsoluteDay
      : this.calendarEngine.toAbsoluteDays(dateOrAbsoluteDay);

    const phase = this.calendarEngine.getMoonPhase(satelliteId, absDay);
    const phaseName = this.getMoonPhaseName(phase);

    const normalizedExpect = expectedPhaseCategory.trim();
    let isValid = false;

    if (normalizedExpect.includes('満月') || normalizedExpect.toUpperCase() === 'FULL') {
      isValid = phase >= 0.4375 && phase <= 0.5625;
    } else if (normalizedExpect.includes('新月') || normalizedExpect.toUpperCase() === 'NEW') {
      isValid = phase < 0.0625 || phase >= 0.9375;
    } else if (normalizedExpect.includes('上弦') || normalizedExpect.toUpperCase() === 'FIRST_QUARTER') {
      isValid = phase >= 0.1875 && phase <= 0.3125;
    } else if (normalizedExpect.includes('下弦') || normalizedExpect.toUpperCase() === 'LAST_QUARTER') {
      isValid = phase >= 0.6875 && phase <= 0.8125;
    } else {
      isValid = phaseName.includes(normalizedExpect);
    }

    let reason: string | undefined;
    if (!isValid) {
      reason = `天体暦矛盾: 指定日（絶対日 ${absDay}日）の【${satName}】は ${phaseName}（位相 ${(phase * 100).toFixed(1)}%）であり、描写「${expectedPhaseCategory}」と不一致です`;
    }

    return {
      isValid,
      satelliteId,
      satelliteName: satName,
      actualPhase: Number(phase.toFixed(3)),
      actualPhaseName: phaseName,
      expectedPhaseCategory,
      reason,
    };
  }

  /**
   * 登場人物の発話・行動が、情報到達日（通信手段・距離）を満たしているか認知フォグを検証
   */
  public verifyEpistemicMention(
    speakerId: string,
    eventId: string,
    mentionDay: number
  ): PropagationVerificationResult {
    return this.propagationSimulator.verifyMention(speakerId, eventId, mentionDay);
  }

  /**
   * 登場人物の生没年（誕生前・死亡後）の境界違反を検証
   */
  public verifyCharacterLifespan(
    characterId: string,
    currentYear: number
  ): { isValid: boolean; reason?: string } {
    const lifespan = this.characterLifespans.get(characterId);
    if (!lifespan) return { isValid: true };

    if (lifespan.birthYear !== undefined && currentYear < lifespan.birthYear) {
      return {
        isValid: false,
        reason: `生没年境界違反: 登場人物（ID: ${characterId}）の誕生年（第${lifespan.birthYear}年）以前の行動・発話（第${currentYear}年）が記録されています`,
      };
    }

    if (lifespan.deathYear !== undefined && currentYear > lifespan.deathYear) {
      return {
        isValid: false,
        reason: `生没年境界違反: 登場人物（ID: ${characterId}）の死亡年（第${lifespan.deathYear}年）以降の行動・発話（第${currentYear}年）が記録されています`,
      };
    }

    return { isValid: true };
  }

  public calculateArrivalInfoForCharacter(
    eventId: string,
    characterId: string
  ): CharacterArrivalInfo | null {
    return this.propagationSimulator.calculateArrivalInfoForCharacter(eventId, characterId);
  }

  public computeAllCharacterArrivals(eventId: string): Map<string, CharacterArrivalInfo> {
    return this.propagationSimulator.computeAllCharacterArrivals(eventId);
  }
}
