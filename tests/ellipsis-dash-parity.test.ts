import { describe, it, expect } from 'vitest';
import {
  EllipsisDashLinterEngine,
  AozoraParser,
  ThreePaneWorkspace,
} from '../src/index.js';

describe('EllipsisDashLinterEngine - Ellipsis (……) and Dash (――) Parity Linter', () => {
  const linter = new EllipsisDashLinterEngine();

  it('detects odd-length ellipsis sequences (1 or 3) and ignores even-length (2 or 4)', () => {
    const textSingle = '彼は静かにうなずいた…';
    const diagSingle = linter.lint(textSingle);
    expect(diagSingle.length).toBe(1);
    expect(diagSingle[0].type).toBe('ellipsis');
    expect(diagSingle[0].count).toBe(1);
    expect(diagSingle[0].found).toBe('…');
    expect(diagSingle[0].replacement).toBe('……');
    expect(diagSingle[0].message).toContain('三点リーダー（…）は2個単位（偶数対）で使用してください');

    const textTriple = '彼は言葉を詰まらせた………';
    const diagTriple = linter.lint(textTriple);
    expect(diagTriple.length).toBe(1);
    expect(diagTriple[0].count).toBe(3);
    expect(diagTriple[0].found).toBe('………');
    expect(diagTriple[0].replacement).toBe('…………');

    const textEven = '彼は微笑んだ……そして静かに歩き出した…………';
    const diagEven = linter.lint(textEven);
    expect(diagEven.length).toBe(0);
  });

  it('detects odd-length dash sequences (1 or 3) and ignores even-length (2 or 4)', () => {
    const textSingle = 'その時―風が止んだ。';
    const diagSingle = linter.lint(textSingle);
    expect(diagSingle.length).toBe(1);
    expect(diagSingle[0].type).toBe('dash');
    expect(diagSingle[0].count).toBe(1);
    expect(diagSingle[0].found).toBe('―');
    expect(diagSingle[0].replacement).toBe('――');
    expect(diagSingle[0].message).toContain('ダッシュ（―）は2個単位（偶数対）で使用してください');

    const textTriple = '沈黙―――それが彼の答言だった。';
    const diagTriple = linter.lint(textTriple);
    expect(diagTriple.length).toBe(1);
    expect(diagTriple[0].count).toBe(3);
    expect(diagTriple[0].replacement).toBe('――――');

    const textEven = '沈黙――それが彼の答えだった――――';
    const diagEven = linter.lint(textEven);
    expect(diagEven.length).toBe(0);
  });

  it('handles alternative ellipsis (‥) and em dash (—)', () => {
    const text = 'あれ‥それ—';
    const diagnostics = linter.lint(text);
    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].found).toBe('‥');
    expect(diagnostics[0].replacement).toBe('‥‥');
    expect(diagnostics[1].found).toBe('—');
    expect(diagnostics[1].replacement).toBe('——');
  });

  it('applies QuickFix for a single diagnostic accurately via applyQuickFix', () => {
    const raw = '沈黙―それが…彼女の答えだ。';
    const diagnostics = linter.lint(raw);
    expect(diagnostics.length).toBe(2);

    // Fix first issue (dash)
    const fixedDash = linter.applyQuickFix(raw, diagnostics[0]);
    expect(fixedDash).toBe('沈黙――それが…彼女の答えだ。');

    // Re-lint and fix second issue (ellipsis)
    const diagnostics2 = linter.lint(fixedDash);
    expect(diagnostics2.length).toBe(1);
    const fixedAll = linter.applyQuickFix(fixedDash, diagnostics2[0]);
    expect(fixedAll).toBe('沈黙――それが……彼女の答えだ。');
  });

  it('automatically corrects all parity violations in text via fixAll', () => {
    const raw = '「まさか…」―彼女は呟いた………そして―――去った。';
    const corrected = linter.fixAll(raw);
    expect(corrected).toBe('「まさか……」――彼女は呟いた…………そして――――去った。');

    // Re-linting corrected text yields 0 diagnostics
    expect(linter.lint(corrected).length).toBe(0);
  });

  it('bypasses linting during IME composition to protect typing flow', () => {
    const text = '彼は静かにうなずいた…';
    const diagnosticsComposing = linter.lint(text, { isComposing: true });
    expect(diagnosticsComposing.length).toBe(0);

    const diagnosticsNormal = linter.lint(text, { isComposing: false });
    expect(diagnosticsNormal.length).toBe(1);
  });

  it('re-maps diagnostic offsets accurately when Aozora markup is present', () => {
    const raw = '彼の｜親文字《るび》は…叫んだ。';
    const { map } = AozoraParser.parse(raw);

    const diagnostics = linter.lint(raw, { displayMap: map });
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].count).toBe(1);
    expect(diagnostics[0].replacement).toBe('……');
  });

  it('integrates seamlessly with ThreePaneWorkspace state and events', () => {
    const workspace = new ThreePaneWorkspace();
    workspace.onTextChange('「待って…」―彼女は叫んだ。', false);

    const state = workspace.getState();
    expect(state.ellipsisDashDiagnostics.length).toBe(2);
    expect(state.ellipsisDashDiagnostics[0].found).toBe('…');
    expect(state.ellipsisDashDiagnostics[1].found).toBe('―');

    const model = workspace.renderWorkspaceModel();
    expect(model.rightPane.contentHtml).toContain('偶数対警告: 2件');
  });
});
