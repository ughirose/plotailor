import { describe, it, expect } from 'vitest';
import {
  PassiveVoiceChecker,
  ThreePaneWorkspace,
  AozoraParser,
} from '../src/index.js';

describe('PassiveVoiceChecker Unit Tests', () => {
  describe('Paragraph Detection & Threshold Configuration', () => {
    it('detects passive voice overuse in a single paragraph exceeding threshold', () => {
      const checker = new PassiveVoiceChecker({ threshold: 2 });
      const text = '王城の扉が開けられた。宝箱が強盗によって壊された。秘密の書類が奪われた。';

      const diagnostics = checker.check(text);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].paragraphIndex).toBe(0);
      expect(diagnostics[0].passiveCount).toBe(3);
      expect(diagnostics[0].message).toContain('受動態過多・主体曖昧化');
      expect(diagnostics[0].matches.length).toBe(3);
      expect(diagnostics[0].suggestedRewrites.length).toBe(3);
    });

    it('does not trigger diagnostic when passive occurrences are below threshold', () => {
      const checker = new PassiveVoiceChecker({ threshold: 3 });
      const text = '手紙が送られた。しかし彼は能動的に返事を書いた。';

      const diagnostics = checker.check(text);
      expect(diagnostics.length).toBe(0);
    });

    it('handles multiple paragraphs independently', () => {
      const checker = new PassiveVoiceChecker({ threshold: 2 });
      const text = `第一段落：平和な街で事件が起こされた。書類が破棄された。
第二段落：刑事は現場に駆けつけた。彼は自ら調査を開始した。
第三段落：容疑者が逮捕された。不当に拘束された。全容が解明された。`;

      const diagnostics = checker.check(text);
      expect(diagnostics.length).toBe(2);

      // Paragraph 0
      expect(diagnostics[0].paragraphIndex).toBe(0);
      expect(diagnostics[0].passiveCount).toBe(2);

      // Paragraph 2
      expect(diagnostics[1].paragraphIndex).toBe(2);
      expect(diagnostics[1].passiveCount).toBe(3);
    });

    it('allows updating threshold dynamically', () => {
      const checker = new PassiveVoiceChecker({ threshold: 2 });
      expect(checker.getThreshold()).toBe(2);

      checker.setThreshold(1);
      expect(checker.getThreshold()).toBe(1);

      const text = '提案が受け入れられた。';
      const diagnostics = checker.check(text);
      expect(diagnostics.length).toBe(1);
    });

    it('ignores empty or whitespace-only paragraphs', () => {
      const checker = new PassiveVoiceChecker({ threshold: 1 });
      const text = '\n   \n\r\n';
      const diagnostics = checker.check(text);
      expect(diagnostics.length).toBe(0);
    });
  });

  describe('Rule-Based Passive to Active Voice Converter', () => {
    const checker = new PassiveVoiceChecker();

    it('converts サ変 passive verbs (〜される / 〜せられる / past / progressive)', () => {
      expect(checker.convertPassiveToActive('破壊される')).toBe('破壊する');
      expect(checker.convertPassiveToActive('推敲される')).toBe('推敲する');
      expect(checker.convertPassiveToActive('実行された')).toBe('実行した');
      expect(checker.convertPassiveToActive('選択せられる')).toBe('選択する');
      expect(checker.convertPassiveToActive('選択せられた')).toBe('選択した');
      expect(checker.convertPassiveToActive('管理されている')).toBe('管理している');
      expect(checker.convertPassiveToActive('処罰されていた')).toBe('処罰していた'); // されていた -> していた
    });

    it('converts カ変 passive verbs (〜来られる / 〜こられる)', () => {
      expect(checker.convertPassiveToActive('来られる')).toBe('来る');
      expect(checker.convertPassiveToActive('来られた')).toBe('来た');
      expect(checker.convertPassiveToActive('こられる')).toBe('くる');
      expect(checker.convertPassiveToActive('こられた')).toBe('きた');
    });

    it('converts 五段 passive verbs across various columns (語尾行)', () => {
      // ワ行 (言われる -> 言う / 言われた -> 言った)
      expect(checker.convertPassiveToActive('言われる')).toBe('言う');
      expect(checker.convertPassiveToActive('奪われる')).toBe('奪う');
      expect(checker.convertPassiveToActive('言われた')).toBe('言った');

      // カ行 (書かれる -> 書く / 書かれた -> 書いた)
      expect(checker.convertPassiveToActive('書かれる')).toBe('書く');
      expect(checker.convertPassiveToActive('置かれる')).toBe('置く');
      expect(checker.convertPassiveToActive('書かれた')).toBe('書いた');

      // ガ行 (泳がれる -> 泳ぐ / 泳がれた -> 泳いだ)
      expect(checker.convertPassiveToActive('泳がれる')).toBe('泳ぐ');
      expect(checker.convertPassiveToActive('泳がれた')).toBe('泳いだ');

      // サ行 (殺される -> 殺す / 殺された -> 殺した)
      expect(checker.convertPassiveToActive('殺される')).toBe('殺す');
      expect(checker.convertPassiveToActive('壊される')).toBe('壊す');
      expect(checker.convertPassiveToActive('殺された')).toBe('殺した');

      // タ行 (打たれる -> 打つ / 打たれた -> 打った)
      expect(checker.convertPassiveToActive('打たれる')).toBe('打つ');
      expect(checker.convertPassiveToActive('打たれた')).toBe('打った');

      // ナ行 (死なれる -> 死ぬ / 死なれた -> 死んだ)
      expect(checker.convertPassiveToActive('死なれる')).toBe('死ぬ');
      expect(checker.convertPassiveToActive('死なれた')).toBe('死んだ');

      // バ行 (選ばれる -> 選ぶ / 選ばれた -> 選んだ)
      expect(checker.convertPassiveToActive('選ばれる')).toBe('選ぶ');
      expect(checker.convertPassiveToActive('呼ばれる')).toBe('呼ぶ');
      expect(checker.convertPassiveToActive('選ばれた')).toBe('選んだ');

      // マ行 (読まれる -> 読む / 盗まれる -> 盗む / 読まれた -> 読んだ)
      expect(checker.convertPassiveToActive('読まれる')).toBe('読む');
      expect(checker.convertPassiveToActive('盗まれる')).toBe('盗む');
      expect(checker.convertPassiveToActive('読まれた')).toBe('読んだ');

      // ラ行 (取られる -> 取る / 叱られる -> 叱る / 作られた -> 作った)
      expect(checker.convertPassiveToActive('取られる')).toBe('取る');
      expect(checker.convertPassiveToActive('叱られる')).toBe('叱る');
      expect(checker.convertPassiveToActive('作られた')).toBe('作った');
      expect(checker.convertPassiveToActive('送られた')).toBe('送った');
    });

    it('converts 一段 passive verbs (褒められる / 助けられる / 教えられる)', () => {
      expect(checker.convertPassiveToActive('褒められる')).toBe('褒める');
      expect(checker.convertPassiveToActive('助けられる')).toBe('助ける');
      expect(checker.convertPassiveToActive('教えられる')).toBe('教える');
      expect(checker.convertPassiveToActive('見られる')).toBe('見る');
      expect(checker.convertPassiveToActive('信じられる')).toBe('信じる');

      expect(checker.convertPassiveToActive('褒められた')).toBe('褒めた');
      expect(checker.convertPassiveToActive('助けられた')).toBe('助けた');
      expect(checker.convertPassiveToActive('教えられた')).toBe('教えた');
      expect(checker.convertPassiveToActive('見られた')).toBe('見た');
      expect(checker.convertPassiveToActive('信じられた')).toBe('信じた');
    });

    it('converts progressive forms (〜れている / 〜られている)', () => {
      expect(checker.convertPassiveToActive('見られている')).toBe('見ている');
      expect(checker.convertPassiveToActive('追われている')).toBe('追っている');
    });

    it('returns original input when non-passive or empty phrase is provided', () => {
      expect(checker.convertPassiveToActive('')).toBe('');
      expect(checker.convertPassiveToActive('走る')).toBe('走る');
    });
  });

  describe('IME Composition & Display Map Offset Remapping', () => {
    it('bypasses checks completely when IME composition is active (isComposing: true)', () => {
      const checker = new PassiveVoiceChecker({ threshold: 1 });
      const text = '扉が開けられた。';

      const diagnostics = checker.check(text, { isComposing: true });
      expect(diagnostics.length).toBe(0);
    });

    it('remaps diagnostic offsets correctly when Aozora display map is provided', () => {
      const checker = new PassiveVoiceChecker({ threshold: 1 });
      const rawText = '｜王城《おうじょう》の扉が開けられた。';
      const { map } = AozoraParser.parse(rawText);

      const diagnostics = checker.check(rawText, { displayMap: map });
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].from).toBeLessThan(diagnostics[0].to);
    });
  });

  describe('3-Pane Integrated IDE Workspace Integration', () => {
    it('updates workspace passiveDiagnostics on text change and renders inline docked view without modals', () => {
      const workspace = new ThreePaneWorkspace({
        initialText: '計画が発表された。資金が提供された。',
        passiveVoiceThreshold: 2,
      });

      const initialState = workspace.getState();
      expect(initialState.passiveDiagnostics.length).toBe(1);

      // Simulate editor change with non-passive text
      workspace.onTextChange('著者は能動的に執筆を続けた。');
      const updatedState = workspace.getState();
      expect(updatedState.passiveDiagnostics.length).toBe(0);

      // Render workspace model
      const model = workspace.renderWorkspaceModel();
      expect(model.rightPane.activeTab).toBe('consistency-inspector');
      expect(model.rightPane.contentHtml).toContain('受動態過多');
    });
  });
});
