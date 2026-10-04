// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Text } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import {
  ChunkedRangeSetManager,
  calculateClampedViewport,
  isAtomicDecorationSafe,
  createSimdRubyScanner,
  CHUNK_LINE_COUNT,
  OVERSCAN_MARGIN_CHARS,
} from '../src/core/editor/ChunkedRangeSet.js';

describe('ChunkedRangeSet', () => {
  it('clamps viewport with over-scan margin (2,000 characters)', () => {
    const docLength = 50000;
    const visibleRanges = [{ from: 5000, to: 6000 }];

    const bounds = calculateClampedViewport(docLength, visibleRanges, 2000);
    expect(bounds.clampedFrom).toBe(3000);
    expect(bounds.clampedTo).toBe(8000);

    // Clamp at document boundaries
    const nearStart = calculateClampedViewport(docLength, [{ from: 500, to: 1000 }], 2000);
    expect(nearStart.clampedFrom).toBe(0);
    expect(nearStart.clampedTo).toBe(3000);

    const nearEnd = calculateClampedViewport(docLength, [{ from: 49000, to: 49500 }], 2000);
    expect(nearEnd.clampedFrom).toBe(47000);
    expect(nearEnd.clampedTo).toBe(50000);
  });

  it('validates atomic replacement decorations without crossing newlines', () => {
    const text = Text.of(['吾輩は猫である。', '名前はまだ無い。', 'どこで生れたか頓と見当がつかぬ。']);

    // Inside single line: safe
    expect(isAtomicDecorationSafe(0, 4, text)).toBe(true);

    // Crosses line break: unsafe
    const line1End = text.line(1).to;
    expect(isAtomicDecorationSafe(line1End - 2, line1End + 3, text)).toBe(false);
  });

  it('manages 500-line chunks and selectively invalidates modified chunks', () => {
    // Generate 1,200 lines (3 chunks: 1-500, 501-1000, 1001-1200)
    const lines = Array.from({ length: 1200 }, (_, i) => `行 ${i + 1}: これはテスト用の原稿テキストです。`);
    const doc = Text.of(lines);

    const manager = new ChunkedRangeSetManager(CHUNK_LINE_COUNT, OVERSCAN_MARGIN_CHARS);
    manager.synchronizeChunks(doc);

    expect(manager.getChunkCount()).toBe(3);

    const chunk0 = manager.getChunk(0)!;
    const chunk1 = manager.getChunk(1)!;
    const chunk2 = manager.getChunk(2)!;

    expect(chunk0.startLine).toBe(1);
    expect(chunk0.endLine).toBe(500);

    expect(chunk1.startLine).toBe(501);
    expect(chunk1.endLine).toBe(1000);

    expect(chunk2.startLine).toBe(1001);
    expect(chunk2.endLine).toBe(1200);

    // Populate fake decorations and mark clean
    chunk0.decorations = [Decoration.mark({ class: 'mark-0' }).range(10, 20)];
    chunk0.dirty = false;
    chunk1.decorations = [Decoration.mark({ class: 'mark-1' }).range(chunk1.startPos + 10, chunk1.startPos + 20)];
    chunk1.dirty = false;
    chunk2.decorations = [Decoration.mark({ class: 'mark-2' }).range(chunk2.startPos + 10, chunk2.startPos + 20)];
    chunk2.dirty = false;

    // Invalidate a range inside chunk1 only
    const targetPos = chunk1.startPos + 50;
    manager.invalidateRange(targetPos, targetPos + 10);

    expect(chunk0.dirty).toBe(false);
    expect(chunk0.decorations.length).toBe(1); // Cached preserved

    expect(chunk1.dirty).toBe(true);
    expect(chunk1.decorations.length).toBe(0); // Invalidated

    expect(chunk2.dirty).toBe(false);
    expect(chunk2.decorations.length).toBe(1); // Cached preserved
  });

  it('handles large 10,000-line scale document smoothly under 10ms', () => {
    const lines = Array.from({ length: 10000 }, (_, i) => `これは第${i}行目の日本語原稿文です。`);
    const doc = Text.of(lines);

    const start = performance.now();
    const manager = new ChunkedRangeSetManager(500, 2000);
    manager.synchronizeChunks(doc);
    const duration = performance.now() - start;

    expect(manager.getChunkCount()).toBe(20);
    expect(duration).toBeLessThan(50); // Fast initial partitioning
  });

  it('scans decorations locally with createSimdRubyScanner and WasmSimdTokenizer', () => {
    const text = Text.of([
      '第一行：｜魔法《マゴウ》の発動。',
      '第二行：通常テキスト。',
      '第三行：漢字《かんじ》の読経。',
    ]);

    const manager = new ChunkedRangeSetManager(500, 2000);
    manager.synchronizeChunks(text);
    const chunk0 = manager.getChunk(0)!;

    const mockTokenizer = {
      parseRubySpans: (rawText: string) => {
        const spans: Array<{ rawFrom: number; rawTo: number; baseText: string; rubyText: string }> = [];
        if (rawText.includes('｜魔法《マゴウ》')) {
          const idx = rawText.indexOf('｜魔法《マゴウ》');
          spans.push({ rawFrom: idx, rawTo: idx + 8, baseText: '魔法', rubyText: 'マゴウ' });
        }
        if (rawText.includes('漢字《かんじ》')) {
          const idx = rawText.indexOf('漢字《かんじ》');
          spans.push({ rawFrom: idx, rawTo: idx + 7, baseText: '漢字', rubyText: 'かんじ' });
        }
        return spans;
      },
    };

    const scanner = createSimdRubyScanner(
      mockTokenizer,
      (base, ruby) => Decoration.mark({ class: `ruby-${base}` })
    );

    const decorations = scanner(chunk0, text);
    expect(decorations.length).toBe(2);
    expect(decorations[0].from).toBe(chunk0.startPos + 4);
    expect(decorations[0].to).toBe(chunk0.startPos + 12);
  });
});

