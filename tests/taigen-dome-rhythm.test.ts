import { describe, it, expect } from 'vitest';
import { TaigenRhythmEngine, ThreePaneWorkspace, PlotailorIDE } from '../src/index.js';

describe('TaigenRhythmEngine - Syntactic Rhythm & Duplicate Subject Analyzer', () => {
  const engine = new TaigenRhythmEngine();

  describe('Aozora Markup Stripping', () => {
    it('strips Aozora ruby markup and emphasis tags correctly', () => {
      const raw = '｜夜空《よぞら》には二つの｜月《つき》が輝く。《《予言》》の通り［＃改ページ］。';
      const clean = TaigenRhythmEngine.stripAozoraMarkup(raw);
      expect(clean).toBe('夜空には二つの月が輝く。予言の通り。');
    });
  });

  describe('Taigen-Dome (Noun-Ending) Detection', () => {
    it('identifies 3 or more consecutive noun-ending sentences', () => {
      const text = `
夜空に浮かぶ一輪の満月。
静まり返る漆黒の街並み。
遠くで響くかすかな足音。
      `.trim();

      const result = engine.analyze(text);
      expect(result.sentences.length).toBe(3);
      expect(result.sentences.every(s => s.isTaigenDome)).toBe(true);

      expect(result.taigenDomeMatches.length).toBe(1);
      const match = result.taigenDomeMatches[0];
      expect(match.count).toBe(3);
      expect(match.sentenceIndices).toEqual([0, 1, 2]);
      expect(match.message).toContain('3文連続で体言止め');
    });

    it('does NOT trigger consecutive taigen-dome match when only 2 sentences end in a noun', () => {
      const text = `
夜空に浮かぶ一輪の満月。
静まり返る漆黒の街並み。
彼らは静かに息を潜めた。
      `.trim();

      const result = engine.analyze(text);
      expect(result.sentences.length).toBe(3);
      expect(result.sentences[0].isTaigenDome).toBe(true);
      expect(result.sentences[1].isTaigenDome).toBe(true);
      expect(result.sentences[2].isTaigenDome).toBe(false);

      expect(result.taigenDomeMatches.length).toBe(0);
      expect(result.summary.taigenDomeCount).toBe(2);
      expect(result.summary.consecutiveTaigenDomeMatches).toBe(0);
    });

    it('handles 4 or 5 consecutive taigen-dome sentences accurately', () => {
      const text = `
暗闇に光る眼差し。
漆黒の刀。
沈黙の誓い。
不気味な静寂。
      `.trim();

      const result = engine.analyze(text);
      expect(result.taigenDomeMatches.length).toBe(1);
      expect(result.taigenDomeMatches[0].count).toBe(4);
    });

    it('handles sentences ending with Aozora ruby markup correctly', () => {
      const text = `
夜空に沈む｜満月《まんげつ》。
静寂に包まれた｜街並み《まちなみ》。
遠くに聞こえる｜足音《あしおと》。
      `.trim();

      const result = engine.analyze(text);
      expect(result.taigenDomeMatches.length).toBe(1);
      expect(result.taigenDomeMatches[0].count).toBe(3);
    });
  });

  describe('Duplicate Subject Detection & Fix Suggestions', () => {
    it('detects redundant repeated pronoun subjects ("彼は", "彼は")', () => {
      const text = `
彼は静かに剣を抜いた。
彼は敵の城門へと向かった。
      `.trim();

      const result = engine.analyze(text);
      expect(result.duplicateSubjectMatches.length).toBe(1);

      const match = result.duplicateSubjectMatches[0];
      expect(match.subject).toBe('彼は');
      expect(match.sentenceIndex).toBe(1);
      expect(match.message).toContain('直前の文（第1文）と同じ主語「彼は」が連続して使用されています');

      expect(match.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(match.suggestions[0].type).toBe('omit');
      expect(match.suggestions[0].replacement).toBe('');
    });

    it('detects redundant proper noun subjects ("太郎は", "太郎は") and offers pronoun replacement', () => {
      const text = `
太郎は静かに歩き出した。
太郎は深く溜息をついた。
      `.trim();

      const result = engine.analyze(text);
      expect(result.duplicateSubjectMatches.length).toBe(1);

      const match = result.duplicateSubjectMatches[0];
      expect(match.subject).toBe('太郎は');

      const pronounSugg = match.suggestions.find(s => s.type === 'pronoun');
      expect(pronounSugg).toBeDefined();
      expect(pronounSugg?.replacement).toBe('彼は');
    });

    it('handles non-duplicate subject sequences without false positives', () => {
      const text = `
ヴァレリウスは馬を走らせた。
アーサーは後ろから追いかけた。
      `.trim();

      const result = engine.analyze(text);
      expect(result.duplicateSubjectMatches.length).toBe(0);
    });
  });

  describe('Edge Cases & Workspace Integration', () => {
    it('returns empty results for empty or whitespace text', () => {
      const result = engine.analyze('   \n  ');
      expect(result.sentences.length).toBe(0);
      expect(result.taigenDomeMatches.length).toBe(0);
      expect(result.duplicateSubjectMatches.length).toBe(0);
    });

    it('integrates seamlessly with ThreePaneWorkspace state updates', () => {
      const initialText = `
夜空に浮かぶ一輪の満月。
静まり返る漆黒の街並み。
遠くで響くかすかな足音。
彼は静かに剣を抜いた。
彼は敵の城門へと向かった。
      `.trim();

      const workspace = new ThreePaneWorkspace({ initialText });
      const state = workspace.getState();

      expect(state.rhythmResult).not.toBeNull();
      expect(state.rhythmResult?.summary.consecutiveTaigenDomeMatches).toBe(1);
      expect(state.rhythmResult?.summary.duplicateSubjectMatches).toBe(1);

      const model = workspace.renderWorkspaceModel();
      expect(model.rightPane.contentHtml).toContain('体言止め連続警告: 1件');
      expect(model.rightPane.contentHtml).toContain('主語重複警告: 1件');
    });

    it('bypasses rhythm analysis during IME composition in ThreePaneWorkspace', () => {
      const workspace = new ThreePaneWorkspace();
      const text = '彼は静かに剣を抜いた。彼は';

      workspace.onTextChange(text, true); // IME composition active
      expect(workspace.getState().isComposing).toBe(true);
      expect(workspace.getState().rhythmResult).toBeNull();

      workspace.onTextChange(text, false); // IME composition finished
      expect(workspace.getState().isComposing).toBe(false);
      expect(workspace.getState().rhythmResult).not.toBeNull();
    });

    it('instantiates PlotailorIDE without errors', () => {
      const ide = new PlotailorIDE();
      expect(ide.getEngine()).toBeDefined();
      expect(ide.getPoPEngine()).toBeDefined();
    });
  });
});
