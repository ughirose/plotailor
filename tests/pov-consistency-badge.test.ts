import { describe, it, expect } from 'vitest';
import {
  PovConsistencyAnalyzer,
  ThreePaneWorkspace,
  type CharacterPovProfile,
} from '../src/index.js';

describe('PovConsistencyAnalyzer', () => {
  it('detects single third-person limited POV (三人称一元視点) without drift', () => {
    const analyzer = new PovConsistencyAnalyzer({
      knownCharacters: ['ヴァレリウス', 'アーサー'],
    });

    const text = `　王都の夜空には二つの月が冷たく輝いていた。
　北の砦から帰還したヴァレリウスは、腰の紫電の剣にそっと触れた。
「近衛軍の動きが妙だ。停戦の誓いを破る気か」
　ヴァレリウスは……と心の中で危機感を深めた。`;

    const result = analyzer.analyze(text);

    expect(result.focalCharacter).toBe('ヴァレリウス');
    expect(result.hasDrift).toBe(false);
    expect(result.driftCharacters).toEqual([]);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.badge.status).toBe('normal');
    expect(result.badge.label).toBe('視点: ヴァレリウス');
    expect(result.badge.badgeHtml).toContain('data-status="normal"');
    expect(result.badge.badgeHtml).toContain('視点: ヴァレリウス');
  });

  it('detects POV drift (神の視点ブレ) when multiple characters\' inner thoughts coexist', () => {
    const analyzer = new PovConsistencyAnalyzer({
      knownCharacters: ['ヴァレリウス', 'アーサー'],
    });

    const text = `　ヴァレリウスは……と心の中で焦っていた。
　ヴァレリウスは……と深呼吸し、確信した。
　一方、若き従卒のアーサーは恐怖に震え上がっていた。`;

    const result = analyzer.analyze(text);

    expect(result.focalCharacter).toBeDefined();
    expect(result.hasDrift).toBe(true);
    expect(result.driftCharacters).toContain('アーサー');
    expect(result.diagnostics.length).toBeGreaterThan(0);

    const diag = result.diagnostics[0];
    expect(diag.severity).toBe('warning');
    expect(diag.message).toContain('視点ブレ警報');
    expect(diag.message).toContain('神の視点ポロリ');
    expect(diag.driftingCharacter).toBe('アーサー');

    expect(result.badge.status).toBe('warning');
    expect(result.badge.badgeHtml).toContain('data-status="warning"');
    expect(result.badge.badgeHtml).toContain('視点ブレ');
  });

  it('honors explicitly configured target focal character', () => {
    const analyzer = new PovConsistencyAnalyzer();
    analyzer.setKnownCharacters(['ヴァレリウス', 'アーサー']);
    analyzer.setTargetFocalCharacter('アーサー');

    expect(analyzer.getTargetFocalCharacter()).toBe('アーサー');

    const text = `ヴァレリウスは……と痛感した。`;
    const result = analyzer.analyze(text);

    expect(result.focalCharacter).toBe('アーサー');
    expect(result.hasDrift).toBe(true);
    expect(result.driftCharacters).toContain('ヴァレリウス');
  });

  it('resolves character aliases correctly', () => {
    const knownChars: CharacterPovProfile[] = [
      { name: 'ヴァレリウス', aliases: ['将軍', '司令官'] },
    ];
    const analyzer = new PovConsistencyAnalyzer({ knownCharacters: knownChars });

    const text = `将軍は……と直感した。`;
    const result = analyzer.analyze(text);

    expect(result.focalCharacter).toBe('ヴァレリウス');
    expect(result.psychologicalDepictions[0].characterName).toBe('ヴァレリウス');
  });

  it('heuristically extracts unknown character names', () => {
    const analyzer = new PovConsistencyAnalyzer();
    const text = `エレナは……と胸を痛めた。`;

    const result = analyzer.analyze(text);

    expect(result.focalCharacter).toBe('エレナ');
    expect(result.psychologicalDepictions[0].characterName).toBe('エレナ');
  });

  it('handles Aozora ruby formatting correctly', () => {
    const analyzer = new PovConsistencyAnalyzer({
      knownCharacters: ['ヴァレリウス'],
    });

    const text = `｜ヴァレリウス《ばれりうす》は……と確信した。`;
    const result = analyzer.analyze(text);

    expect(result.focalCharacter).toBe('ヴァレリウス');
    expect(result.hasDrift).toBe(false);
  });

  it('bypasses analysis when Japanese IME is active', () => {
    const analyzer = new PovConsistencyAnalyzer({
      knownCharacters: ['ヴァレリウス'],
    });

    const text = `ヴァレリウスは……と思った`;
    const result = analyzer.analyze(text, { isComposing: true });

    expect(result.psychologicalDepictions).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.hasDrift).toBe(false);
  });

  it('returns neutral badge state for objective narration without psychological depictions', () => {
    const analyzer = new PovConsistencyAnalyzer();
    const text = `王都の馬車が東の街道を駆け抜けていった。風が冷たく吹き抜ける。`;

    const result = analyzer.analyze(text);

    expect(result.focalCharacter).toBeNull();
    expect(result.hasDrift).toBe(false);
    expect(result.badge.status).toBe('neutral');
    expect(result.badge.label).toBe('視点: 客観／未特定');
    expect(result.badge.badgeHtml).toContain('pov-neutral');
  });

  it('configures options using configure() and allows clearing target focal character', () => {
    const analyzer = new PovConsistencyAnalyzer();
    analyzer.configure({
      knownCharacters: ['ヴァレリウス'],
      targetFocalCharacter: 'ヴァレリウス',
    });

    expect(analyzer.getTargetFocalCharacter()).toBe('ヴァレリウス');

    analyzer.setTargetFocalCharacter(null);
    expect(analyzer.getTargetFocalCharacter()).toBeNull();
  });
});

describe('ThreePaneWorkspace Integration with PovConsistencyAnalyzer', () => {
  it('initializes with POV analyzer and updates POV badge on text changes', () => {
    const workspace = new ThreePaneWorkspace({
      knownCharacters: ['ヴァレリウス', 'アーサー'],
      initialText: `ヴァレリウスは……と心の中で誓った。`,
    });

    const initialState = workspace.getState();
    expect(initialState.povResult!.focalCharacter).toBe('ヴァレリウス');
    expect(initialState.povResult!.hasDrift).toBe(false);

    // Change text to introduce POV drift
    workspace.onTextChange(
      `ヴァレリウスは……と心の中で誓った。ヴァレリウスは確信した。一方、アーサーは……と危惧した。`
    );

    const updatedState = workspace.getState();
    expect(updatedState.povResult!.hasDrift).toBe(true);
    expect(updatedState.povResult!.driftCharacters).toContain('アーサー');

    const model = workspace.renderWorkspaceModel();
    expect(model.rightPane.contentHtml).toContain('pov-badge');
    expect(model.rightPane.contentHtml).toContain('視点ブレ');
  });

  it('provides access to PovConsistencyAnalyzer via getPovAnalyzer()', () => {
    const workspace = new ThreePaneWorkspace();
    const analyzer = workspace.getPovAnalyzer();

    expect(analyzer).toBeInstanceOf(PovConsistencyAnalyzer);
  });
});
