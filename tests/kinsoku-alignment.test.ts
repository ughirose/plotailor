import { describe, it, expect } from 'vitest';
import {
  KinsokuAlignmentEngine,
  DEFAULT_LINE_HEAD_PROHIBITED,
  DEFAULT_LINE_TAIL_PROHIBITED,
  DEFAULT_HANGING_CHARS,
} from '../src/core/editor/KinsokuAlignmentEngine.js';

describe('KinsokuAlignmentEngine - Prohibition Offset & Guideline Alignment Engine', () => {
  it('correctly calculates character column widths for fullwidth and halfwidth characters', () => {
    const engine = new KinsokuAlignmentEngine();
    expect(engine.calculateCharWidth('a')).toBe(1);
    expect(engine.calculateCharWidth('1')).toBe(1);
    expect(engine.calculateCharWidth(' ')).toBe(1);
    expect(engine.calculateCharWidth('あ')).toBe(2);
    expect(engine.calculateCharWidth('漢')).toBe(2);
    expect(engine.calculateCharWidth('！')).toBe(2);
    expect(engine.calculateCharWidth('「')).toBe(2);
    expect(engine.calculateCharWidth('')).toBe(0);
  });

  it('correctly identifies default prohibited and hanging character sets', () => {
    const engine = new KinsokuAlignmentEngine();
    expect(engine.isLineHeadProhibited('、')).toBe(true);
    expect(engine.isLineHeadProhibited('。')).toBe(true);
    expect(engine.isLineHeadProhibited('っ')).toBe(true);
    expect(engine.isLineHeadProhibited('」')).toBe(true);
    expect(engine.isLineHeadProhibited('漢')).toBe(false);

    expect(engine.isLineTailProhibited('「')).toBe(true);
    expect(engine.isLineTailProhibited('『')).toBe(true);
    expect(engine.isLineTailProhibited('（')).toBe(true);
    expect(engine.isLineTailProhibited('」')).toBe(false);

    expect(engine.isHangingChar('、')).toBe(true);
    expect(engine.isHangingChar('。')).toBe(true);
    expect(engine.isHangingChar('っ')).toBe(false);
  });

  it('aligns plain text cleanly to 40-character guideline boundary', () => {
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 40 });
    // 20 fullwidth characters = 40 columns
    const text = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。';
    const result = engine.alignText(text);

    expect(result.lines.length).toBeGreaterThanOrEqual(1);
    expect(result.lines[0].columnWidth).toBeLessThanOrEqual(42); // may hang 1 char
    expect(result.totalRawChars).toBe(text.length);
    expect(result.totalDisplayChars).toBe(text.length);
    expect(result.computationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('excludes ruby markup from visual line width calculation when excludeRuby is true', () => {
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 20, excludeRuby: true });
    // Raw text with explicit ruby markup: ｜漢字《かんじ》
    // Parent "漢字" is 4 cols. Pipe "｜" and "《かんじ》" are excluded (0 cols)
    const rawText = '吾輩は｜猫《ねこ》である。';
    const result = engine.alignText(rawText);

    expect(result.totalRawChars).toBe(rawText.length);
    expect(result.totalDisplayChars).toBe('吾輩は猫である。'.length);

    // Map entries for pipe and ruby brackets should be marked as isRubyMarkup
    const pipeEntry = result.mapEntries[3]; // '｜'
    expect(pipeEntry.isRubyMarkup).toBe(true);
    expect(pipeEntry.charWidth).toBe(0);

    const parentEntry = result.mapEntries[4]; // '猫'
    expect(parentEntry.isRubyMarkup).toBe(false);
    expect(parentEntry.charWidth).toBe(2);
  });

  it('includes ruby markup in visual line width calculation when excludeRuby is false', () => {
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 20, excludeRuby: false });
    const rawText = '吾輩は｜猫《ねこ》である。';
    const result = engine.alignText(rawText);

    expect(result.totalRawChars).toBe(rawText.length);
    expect(result.totalDisplayChars).toBe(rawText.length);

    // Every char is included in display text
    const pipeEntry = result.mapEntries[3]; // '｜'
    expect(pipeEntry.isRubyMarkup).toBe(false);
    expect(pipeEntry.charWidth).toBe(2);
  });

  it('detects line-tail prohibition and pushes opening bracket down (追い出し)', () => {
    // 20 columns width = 10 fullwidth characters
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 20 });
    // 9 fullwidth chars (18 cols) + '「' (2 cols) = 20 cols
    const rawText = '吾輩は猫である名前「はまだ無い。';
    const result = engine.alignText(rawText);

    const tailViolation = result.violations.find((v) => v.type === 'line-tail');
    expect(tailViolation).toBeDefined();
    expect(tailViolation?.char).toBe('「');
    expect(tailViolation?.action).toBe('push-down');

    // Line 0 should push '「' down, so Line 0 ends before '「'
    expect(result.lines[0].displayText).not.toContain('「');
    expect(result.lines[1].displayText.startsWith('「')).toBe(true);
  });

  it('detects line-head prohibition and pushes character down (追い出し)', () => {
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 20, allowHanging: false });
    // 10 fullwidth chars (20 cols) + 'っ' (line head prohibited)
    const rawText = '吾輩は猫である名前はっどこで生れたかとんと見当がつかぬ。';
    const result = engine.alignText(rawText);

    const headViolation = result.violations.find((v) => v.type === 'line-head');
    expect(headViolation).toBeDefined();
    expect(headViolation?.char).toBe('っ');
    expect(headViolation?.action).toBe('push-down');

    // 'は' should be pushed down so 'っ' does not start line 1 alone
    expect(result.lines[1].displayText.startsWith('はっ')).toBe(true);
  });

  it('handles hanging punctuation (ぶら下げ) at line boundary when allowed', () => {
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 20, allowHanging: true });
    // 10 fullwidth characters followed immediately by '。'
    const rawText = '吾輩は猫である名前は。どこで生れたかとんと見当がつかぬ。';
    const result = engine.alignText(rawText);

    expect(result.lines[0].isHanging).toBe(true);
    expect(result.lines[0].hangingChar).toBe('。');
    expect(result.lines[0].displayText).toBe('吾輩は猫である名前は。');

    const hangViolation = result.violations.find((v) => v.action === 'hang');
    expect(hangViolation).toBeDefined();
    expect(hangViolation?.char).toBe('。');
  });

  it('accurately performs rawToVisualOffset and visualToRawOffset bi-directional mapping', () => {
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 20 });
    const rawText = '吾輩は猫である。\n名前はまだ無い。';
    const result = engine.alignText(rawText);

    // Map offset of '吾' (raw index 0)
    const posStart = engine.rawToVisualOffset(0, result);
    expect(posStart.lineIndex).toBe(0);
    expect(posStart.colIndex).toBe(0);

    // Visual to raw
    const rawStart = engine.visualToRawOffset(0, 0, result);
    expect(rawStart).toBe(0);

    // Map offset of '名' (after '\n', raw index 9)
    const posSecondLine = engine.rawToVisualOffset(9, result);
    expect(posSecondLine.lineIndex).toBe(1);
    expect(posSecondLine.colIndex).toBe(0);

    const rawSecondLine = engine.visualToRawOffset(1, 0, result);
    expect(rawSecondLine).toBe(9);
  });

  it('handles empty text gracefully', () => {
    const engine = new KinsokuAlignmentEngine();
    const result = engine.alignText('');

    expect(result.lines.length).toBe(1);
    expect(result.totalRawChars).toBe(0);
    expect(result.totalDisplayChars).toBe(0);
    expect(result.violations.length).toBe(0);

    const pos = engine.rawToVisualOffset(0, result);
    expect(pos.lineIndex).toBe(0);
    expect(pos.colIndex).toBe(0);
  });

  it('supports updating configuration dynamically', () => {
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 40 });
    expect(engine.getConfig().columnsPerLine).toBe(40);

    engine.updateConfig({ columnsPerLine: 20, allowHanging: false });
    expect(engine.getConfig().columnsPerLine).toBe(20);
    expect(engine.getConfig().allowHanging).toBe(false);
  });

  it('detects violations using detectKinsokuBoundaries helper method', () => {
    const engine = new KinsokuAlignmentEngine({ columnsPerLine: 20 });
    const rawText = '吾輩は猫である名前「はまだ無い。';
    const violations = engine.detectKinsokuBoundaries(rawText);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].type).toBe('line-tail');
    expect(violations[0].char).toBe('「');
  });
});
