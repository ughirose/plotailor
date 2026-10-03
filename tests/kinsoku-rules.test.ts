import { describe, it, expect } from 'vitest';
import {
  KinsokuEngine,
  DEFAULT_LINE_HEAD_PROHIBITED,
  DEFAULT_LINE_TAIL_PROHIBITED,
  DEFAULT_HANGING_CHARS,
} from '../src/core/editor/KinsokuEngine.js';

describe('KinsokuEngine - Japanese Prohibition Rules & Hanging Punctuation', () => {
  it('correctly identifies default line-head prohibited characters', () => {
    const engine = new KinsokuEngine();
    expect(engine.isLineHeadProhibited('、')).toBe(true);
    expect(engine.isLineHeadProhibited('。')).toBe(true);
    expect(engine.isLineHeadProhibited('！')).toBe(true);
    expect(engine.isLineHeadProhibited('？')).toBe(true);
    expect(engine.isLineHeadProhibited('」')).toBe(true);
    expect(engine.isLineHeadProhibited('』')).toBe(true);
    expect(engine.isLineHeadProhibited('ー')).toBe(true);
    expect(engine.isLineHeadProhibited('っ')).toBe(true);
    expect(engine.isLineHeadProhibited('あ')).toBe(false);
    expect(engine.isLineHeadProhibited('漢')).toBe(false);
  });

  it('correctly identifies default line-tail prohibited characters', () => {
    const engine = new KinsokuEngine();
    expect(engine.isLineTailProhibited('「')).toBe(true);
    expect(engine.isLineTailProhibited('『')).toBe(true);
    expect(engine.isLineTailProhibited('（')).toBe(true);
    expect(engine.isLineTailProhibited('【')).toBe(true);
    expect(engine.isLineTailProhibited('」')).toBe(false);
    expect(engine.isLineTailProhibited('字')).toBe(false);
  });

  it('correctly identifies hanging punctuation characters', () => {
    const engine = new KinsokuEngine();
    expect(engine.isHangingChar('、')).toBe(true);
    expect(engine.isHangingChar('。')).toBe(true);
    expect(engine.isHangingChar('！')).toBe(false);
  });

  it('calculates monospace character widths (1 for halfwidth, 2 for fullwidth)', () => {
    const engine = new KinsokuEngine();
    expect(engine.calculateCharWidth('a')).toBe(1);
    expect(engine.calculateCharWidth('1')).toBe(1);
    expect(engine.calculateCharWidth(' ')).toBe(1);
    expect(engine.calculateCharWidth('あ')).toBe(2);
    expect(engine.calculateCharWidth('漢')).toBe(2);
    expect(engine.calculateCharWidth('！')).toBe(2);
  });

  it('detects line-tail violation when opening bracket falls on column boundary', () => {
    // 20 columns width = 10 fullwidth characters
    const engine = new KinsokuEngine({ columnsPerLine: 20 });
    // 9 fullwidth chars + '「' = exactly 20 width, so '「' is at the line tail
    const text = '吾輩は猫である名前「はまだ無い。';
    const violations = engine.detectViolations(text, 20);

    const tailViolation = violations.find((v) => v.type === 'line-tail');
    expect(tailViolation).toBeDefined();
    expect(tailViolation?.char).toBe('「');
    expect(tailViolation?.suggestedAction).toBe('push-down');
  });

  it('detects line-head violation when prohibited character falls at the start of next line without hanging', () => {
    const engine = new KinsokuEngine({ columnsPerLine: 20, allowHanging: false });
    // 10 fullwidth characters: '吾輩は猫である名前は' (width 20) -> next is '。' (width 2 at line head)
    const text = '吾輩は猫である名前は。どこで生れたかとんと見当がつかぬ。';
    const violations = engine.detectViolations(text, 20);

    const headViolation = violations.find((v) => v.type === 'line-head');
    expect(headViolation).toBeDefined();
    expect(headViolation?.char).toBe('。');
    expect(headViolation?.suggestedAction).toBe('push-down');
  });

  it('simulates hanging punctuation at line end when hanging is allowed', () => {
    const engine = new KinsokuEngine({ columnsPerLine: 20, allowHanging: true });
    // 10 fullwidth characters followed immediately by '。'
    const text = '吾輩は猫である名前は。どこで生れたかとんと見当がつかぬ。';
    const result = engine.simulateTypesetting(text, 20, true);

    expect(result.hangingCount).toBeGreaterThanOrEqual(1);
    const firstLine = result.lines[0];
    expect(firstLine.text).toBe('吾輩は猫である名前は。');
    expect(firstLine.isHanging).toBe(true);
    expect(firstLine.hangingChar).toBe('。');
  });

  it('handles multi-paragraph text with empty lines cleanly', () => {
    const engine = new KinsokuEngine({ columnsPerLine: 40 });
    const text = '第一段落の文章です。\n\n第二段落の文章です。';
    const result = engine.simulateTypesetting(text);

    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    expect(result.lines[1].text).toBe('');
    expect(result.totalViolations).toBe(0);
  });

  it('supports updating configuration dynamically', () => {
    const engine = new KinsokuEngine({ columnsPerLine: 40 });
    expect(engine.getConfig().columnsPerLine).toBe(40);

    engine.updateConfig({ columnsPerLine: 20, allowHanging: false });
    expect(engine.getConfig().columnsPerLine).toBe(20);
    expect(engine.getConfig().allowHanging).toBe(false);
  });
});
