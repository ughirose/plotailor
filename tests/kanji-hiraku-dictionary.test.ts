import { describe, it, expect } from 'vitest';
import {
  KanjiHirakuDictionaryEngine,
  DEFAULT_HIRAKU_ENTRIES,
  AozoraParser,
  ThreePaneWorkspace,
  type HirakuDictionaryEntry,
} from '../src/index.js';

describe('KanjiHirakuDictionaryEngine', () => {
  it('detects terms that should be opened to hiragana (有難う, 事, 時, 為, の様に)', () => {
    const engine = new KanjiHirakuDictionaryEngine();
    const sampleText = '有難う御座います。あの時の事は忘れません。彼のように為になる話を併し話した。';

    const diagnostics = engine.lint(sampleText);

    expect(diagnostics.length).toBeGreaterThan(0);

    const kanjiFound = diagnostics.map((d) => d.kanji);
    expect(kanjiFound).toContain('有難う御座います');
    expect(kanjiFound).toContain('時');
    expect(kanjiFound).toContain('事');
    expect(kanjiFound).toContain('為');
    expect(kanjiFound).toContain('併し');

    const arigatouDiag = diagnostics.find((d) => d.kanji === '有難う御座います');
    expect(arigatouDiag?.hiragana).toBe('ありがとうございます');
    expect(arigatouDiag?.severity).toBe('warning');
    expect(arigatouDiag?.message).toContain('「有難う御座います」はひらがな「ありがとうございます」でひらくことが推奨されます。');
  });

  it('allows author to toggle rules by ruleId (e.g., formal-noun, greeting, adverb)', () => {
    const engine = new KanjiHirakuDictionaryEngine();
    const sampleText = '有難う。あの時の事は重要です。';

    // Default: both 'greeting' ("有難う") and 'formal-noun' ("時", "事") detected
    let diagnostics = engine.lint(sampleText);
    expect(diagnostics.some((d) => d.ruleId === 'greeting')).toBe(true);
    expect(diagnostics.some((d) => d.ruleId === 'formal-noun')).toBe(true);

    // Disable 'formal-noun' rules
    engine.setRuleEnabled('formal-noun', false);
    expect(engine.isRuleEnabled('formal-noun')).toBe(false);

    diagnostics = engine.lint(sampleText);
    expect(diagnostics.some((d) => d.ruleId === 'formal-noun')).toBe(false);
    expect(diagnostics.some((d) => d.ruleId === 'greeting')).toBe(true);

    // Re-enable 'formal-noun'
    engine.setRuleEnabled('formal-noun', true);
    expect(engine.isRuleEnabled('formal-noun')).toBe(true);
    diagnostics = engine.lint(sampleText);
    expect(diagnostics.some((d) => d.ruleId === 'formal-noun')).toBe(true);
  });

  it('allows author to toggle categories (e.g. 接続詞, 挨拶・慣用表現)', () => {
    const engine = new KanjiHirakuDictionaryEngine();
    const sampleText = '併し、有難う御座います。';

    engine.setCategoryEnabled('接続詞', false);
    expect(engine.isCategoryEnabled('接続詞')).toBe(false);

    const diagnostics = engine.lint(sampleText);
    expect(diagnostics.some((d) => d.kanji === '併し')).toBe(false);
    expect(diagnostics.some((d) => d.kanji === '有難う御座います')).toBe(true);

    engine.setCategoryEnabled('接続詞', true);
    expect(engine.isCategoryEnabled('接続詞')).toBe(true);
    const updated = engine.lint(sampleText);
    expect(updated.some((d) => d.kanji === '併し')).toBe(true);
  });

  it('supports custom rule additions and removals', () => {
    const engine = new KanjiHirakuDictionaryEngine();
    const customEntry: HirakuDictionaryEntry = {
      id: 'custom-oyake',
      kanji: '公',
      hiragana: 'おおやけ',
      category: '形式名詞',
      ruleId: 'custom-formal-noun',
      description: '公はひらがなでおおやけとひらきます。',
    };

    engine.addEntry(customEntry);
    let diagnostics = engine.lint('公の場で発表する。');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].kanji).toBe('公');
    expect(diagnostics[0].hiragana).toBe('おおやけ');

    engine.removeEntry('custom-oyake');
    diagnostics = engine.lint('公の場で発表する。');
    expect(diagnostics.length).toBe(0);
  });

  it('supports author term exclusions', () => {
    const engine = new KanjiHirakuDictionaryEngine();
    const text = '有難う。流石ですね。';

    engine.addExclusion('流石');
    expect(engine.isExcluded('流石')).toBe(true);

    let diagnostics = engine.lint(text);
    expect(diagnostics.some((d) => d.kanji === '流石')).toBe(false);
    expect(diagnostics.some((d) => d.kanji === '有難う')).toBe(true);

    engine.removeExclusion('流石');
    expect(engine.isExcluded('流石')).toBe(false);
    diagnostics = engine.lint(text);
    expect(diagnostics.some((d) => d.kanji === '流石')).toBe(true);
  });

  it('supports setting full filter configuration via setFilterConfig & getFilterConfig', () => {
    const engine = new KanjiHirakuDictionaryEngine();
    engine.setFilterConfig({
      disabledRuleIds: ['conjunction'],
      disabledCategories: ['副詞・連体詞'],
      disabledKanji: ['事'],
      exclusions: ['時'],
    });

    const config = engine.getFilterConfig();
    expect(config.disabledRuleIds).toContain('conjunction');
    expect(config.disabledCategories).toContain('副詞・連体詞');
    expect(config.disabledKanji).toContain('事');
    expect(config.exclusions).toContain('時');

    const text = '併し、流石にあの時の事は有難う。';
    const diagnostics = engine.lint(text);
    // 併し (disabled rule), 流石 (disabled category), 時 (excluded), 事 (disabled kanji)
    // Only 有難う remains active
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].kanji).toBe('有難う');
  });

  it('bypasses linting when IME composition is active (isComposing: true)', () => {
    const engine = new KanjiHirakuDictionaryEngine();
    const text = '有難う御座います';

    const diagnostics = engine.lint(text, { isComposing: true });
    expect(diagnostics.length).toBe(0);
  });

  it('correctly remaps offsets when Aozora markup is present', () => {
    const engine = new KanjiHirakuDictionaryEngine();
    const raw = '彼の｜親文字《るび》は有難うと述べた。';
    const { map } = AozoraParser.parse(raw);

    const diagnostics = engine.lint(raw, { displayMap: map });
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].kanji).toBe('有難う');
    expect(diagnostics[0].from).toBeLessThan(diagnostics[0].to);
  });

  it('handles edge cases: empty string, null options, non-matching text', () => {
    const engine = new KanjiHirakuDictionaryEngine();

    expect(engine.lint('')).toEqual([]);
    expect(engine.lint('吾輩は猫である。名前はまだ無い。')).toEqual([]);

    engine.setEntries([]);
    expect(engine.getEntries().length).toBe(0);
    expect(engine.getEnabledEntries().length).toBe(0);
    expect(engine.lint('有難う')).toEqual([]);
  });

  it('integrates seamlessly into ThreePaneWorkspace', () => {
    const workspace = new ThreePaneWorkspace({
      initialText: '有難う御座います。あの時の事です。',
    });

    workspace.onTextChange('有難う御座います。あの時の事です。');
    const state = workspace.getState();

    expect(state.hirakuDiagnostics.length).toBeGreaterThan(0);
    const kanjis = state.hirakuDiagnostics.map((d) => d.kanji);
    expect(kanjis).toContain('有難う御座います');

    const model = workspace.renderWorkspaceModel();
    expect(model.rightPane.contentHtml).toContain('ひらくべき漢字');
  });
});
