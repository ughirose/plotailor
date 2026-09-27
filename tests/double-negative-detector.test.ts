// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import {
  StyleDiscomfortDetector,
  BUILTIN_DISCOMFORT_RULES,
  type DiscomfortRule,
} from '../src/index.js';
import { EditorView } from '../src/web/EditorView.js';

describe('StyleDiscomfortDetector', () => {
  it('detects double negative constructions correctly with offsets', () => {
    const detector = new StyleDiscomfortDetector();
    const text = 'その提案に賛成しないわけではないが、準備が不十分だ。';
    const diagnostics = detector.detect(text);

    expect(diagnostics.length).toBeGreaterThan(0);
    const match = diagnostics.find((d) => d.category === 'double_negative');
    expect(match).toBeDefined();
    expect(match?.text).toBe('ないわけではないが');
    expect(match?.from).toBe(text.indexOf('ないわけではないが'));
    expect(match?.to).toBe(match!.from + 'ないわけではないが'.length);
    expect(match?.severity).toBe('warning');
    expect(match?.message).toContain('二重否定');
  });

  it('detects various forms of double negatives', () => {
    const detector = new StyleDiscomfortDetector();

    // 1. なくもない
    const res1 = detector.detect('彼の気持ちも分からなくもない。');
    expect(res1.some((d) => d.text.includes('なくもない'))).toBe(true);

    // 2. ないこともない
    const res2 = detector.detect('行けないこともない。');
    expect(res2.some((d) => d.text.includes('ないこともない'))).toBe(true);

    // 3. ないでもない
    const res3 = detector.detect('見えないでもない。');
    expect(res3.some((d) => d.text.includes('ないでもない'))).toBe(true);

    // 4. なくはない
    const res4 = detector.detect('可能性は低くはない。');
    expect(res4.some((d) => d.text.includes('くはない'))).toBe(true);
  });

  it('detects double keigo and excessive keigo with improvement candidates', () => {
    const detector = new StyleDiscomfortDetector();
    const text = '本日、社長様がお見えになられる予定です。資料を拝見させていただく。';
    const diagnostics = detector.detect(text);

    expect(diagnostics.length).toBe(3);

    // 1. 社長様
    const titleMatch = diagnostics.find((d) => d.text === '社長様');
    expect(titleMatch).toBeDefined();
    expect(titleMatch?.category).toEqual('excessive_keigo');
    expect(titleMatch?.suggestions).toEqual(['社長', '〇〇社長']);

    // 2. お見えになられる
    const keigoMatch = diagnostics.find((d) => d.text === 'お見えになられる');
    expect(keigoMatch).toBeDefined();
    expect(keigoMatch?.category).toBe('excessive_keigo');
    expect(keigoMatch?.suggestions).toContain('お見えになる');
    expect(keigoMatch?.suggestions).toContain('来られる');

    // 3. 拝見させていただく
    const haikenMatch = diagnostics.find((d) => d.text === '拝見させていただく');
    expect(haikenMatch).toBeDefined();
    expect(haikenMatch?.suggestions).toContain('拝見する');
    expect(haikenMatch?.suggestions).toContain('拝見いたします');
  });

  it('detects other excessive keigo patterns', () => {
    const detector = new StyleDiscomfortDetector();

    expect(detector.detect('お越しになられる').some((d) => d.suggestions.includes('お越しになる'))).toBe(true);
    expect(detector.detect('ご覧になられる').some((d) => d.suggestions.includes('ご覧になる'))).toBe(true);
    expect(detector.detect('お召し上がりになられる').some((d) => d.suggestions.includes('召し上がる'))).toBe(true);
    expect(detector.detect('おっしゃられる').some((d) => d.suggestions.includes('おっしゃる'))).toBe(true);
    expect(detector.detect('仰られる').some((d) => d.suggestions.includes('おっしゃる'))).toBe(true);
    expect(detector.detect('お帰りになられる').some((d) => d.suggestions.includes('お帰りになる'))).toBe(true);
    expect(detector.detect('お読みになられる').some((d) => d.suggestions.includes('お読みになる'))).toBe(true);
    expect(detector.detect('お聞きになられる').some((d) => d.suggestions.includes('お聞きになる'))).toBe(true);
    expect(detector.detect('おいでになられる').some((d) => d.suggestions.includes('おいでになる'))).toBe(true);
    expect(detector.detect('ご提示される').some((d) => d.suggestions.includes('提示される'))).toBe(true);
    expect(detector.detect('ご出席される').some((d) => d.suggestions.includes('出席される'))).toBe(true);
    expect(detector.detect('ご案内される').some((d) => d.suggestions.includes('案内される'))).toBe(true);
    expect(detector.detect('ご検討される').some((d) => d.suggestions.includes('検討される'))).toBe(true);
  });

  it('bypasses detection when IME composition is active', () => {
    const detector = new StyleDiscomfortDetector();
    const text = '本日、お見えになられる';
    const diagnostics = detector.detect(text, { isComposing: true });

    expect(diagnostics.length).toBe(0);
  });

  it('returns empty array when text is empty or clean', () => {
    const detector = new StyleDiscomfortDetector();
    expect(detector.detect('')).toEqual([]);
    expect(detector.detect('本日は晴天なり。')).toEqual([]);
  });

  it('supports custom rule management (addRule, setRules, getRules)', () => {
    const detector = new StyleDiscomfortDetector();
    const initialRuleCount = detector.getRules().length;

    const customRule: DiscomfortRule = {
      pattern: /とてもすごい/g,
      category: 'double_negative',
      message: '不自然な強調表現です。',
      suggestions: ['非常に優れた'],
      severity: 'info',
    };

    detector.addRule(customRule);
    expect(detector.getRules().length).toBe(initialRuleCount + 1);

    const diagnostics = detector.detect('この作品はとてもすごい。');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].text).toBe('とてもすごい');
    expect(diagnostics[0].severity).toBe('info');

    detector.setRules([customRule]);
    expect(detector.getRules().length).toBe(1);
  });

  it('integrates seamlessly with 3-pane EditorView', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const view = new EditorView(container);
    view.render();

    const resultsContainer = container.querySelector('#style-results-container');
    expect(resultsContainer).not.toBeNull();
    expect(resultsContainer?.textContent).toContain('二重否定検知');
    expect(resultsContainer?.textContent).toContain('過剰・二重敬語検知');

    document.body.removeChild(container);
  });
});
