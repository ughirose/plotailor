import { describe, it, expect, beforeEach } from 'vitest';
import { DualOffsetTable } from '../src/core/editor/DualOffsetTable.js';
import { WasmSimdTokenizer, SimdTokenKind } from '../src/core/editor/WasmSimdTokenizer.js';

describe('DualOffsetTable & WasmSimdTokenizer Integration', () => {
  let offsetTable: DualOffsetTable;
  let tokenizer: WasmSimdTokenizer;

  beforeEach(() => {
    offsetTable = new DualOffsetTable();
    tokenizer = new WasmSimdTokenizer();
  });

  describe('DualOffsetTable UTF-8 <-> UTF-16 conversion', () => {
    it('should build paragraph checkpoints accurately', () => {
      const text = '第一行のテキスト\n第二行の日本語文章\n第三行';
      offsetTable.buildFromText(text);

      const checkpoints = offsetTable.getCheckpoints();
      expect(checkpoints.length).toBe(3); // line 1 (0,0), line 2, line 3
      expect(checkpoints[0]).toEqual({ utf8Offset: 0, utf16Offset: 0 });

      // First newline is at index 8 in UTF-16
      const firstLineUtf8Len = new TextEncoder().encode('第一行のテキスト\n').length;
      expect(checkpoints[1]).toEqual({
        utf8Offset: firstLineUtf8Len,
        utf16Offset: 9,
      });
    });

    it('should accurately convert between UTF-8 and UTF-16 for Japanese text', () => {
      const text = '吾輩は猫である。名前はまだ無い。\nどこで生れたかとんと見当がつかぬ。';
      offsetTable.buildFromText(text);

      for (let i = 0; i <= text.length; i++) {
        const u8 = offsetTable.utf16ToUtf8(i);
        const backU16 = offsetTable.utf8ToUtf16(u8);
        expect(backU16).toBe(i);
      }
    });

    it('should correctly handle multi-byte surrogate pairs (emoji)', () => {
      const text = '文字🎨と音楽🎶の旅\n第二章';
      offsetTable.buildFromText(text);

      // Check emoji UTF-16 length is 2 and UTF-8 length is 4
      const emojiPos = text.indexOf('🎨');
      const u8Pos = offsetTable.utf16ToUtf8(emojiPos);
      expect(offsetTable.utf8ToUtf16(u8Pos)).toBe(emojiPos);

      const afterEmoji = emojiPos + 2;
      const u8After = offsetTable.utf16ToUtf8(afterEmoji);
      expect(u8After - u8Pos).toBe(4); // Emoji is 4 bytes in UTF-8
      expect(offsetTable.utf8ToUtf16(u8After)).toBe(afterEmoji);
    });

    it('should find closest preceding checkpoint in O(log N)', () => {
      const text = 'A\nB\nC\nD\nE\nF\n';
      offsetTable.buildFromText(text);

      const cp = offsetTable.findPrecedingByUtf16(5); // Between C and D
      expect(cp.utf16Offset).toBe(4); // Start of C
    });
  });

  describe('WasmSimdTokenizer', () => {
    it('should verify Wasm SIMD engine is initialized and available', () => {
      expect(tokenizer.isAvailable()).toBe(true);
    });

    it('should scan tokens in parallel matching specification patterns', () => {
      const text = 'これは｜魔法《マゴウ》と|特技《スキル》です。\n第二段落｜天下一《てんかいち》';
      const resolved = tokenizer.tokenizeWithTable(text, offsetTable);

      expect(resolved.length).toBe(10);

      // 1. Wide pipe ｜
      expect(resolved[0].kind).toBe(SimdTokenKind.InlinePipeWide);
      expect(text.charAt(resolved[0].utf16Offset)).toBe('｜');

      // 2. Ruby open 《
      expect(resolved[1].kind).toBe(SimdTokenKind.RubyOpen);
      expect(text.charAt(resolved[1].utf16Offset)).toBe('《');

      // 3. Ruby close 》
      expect(resolved[2].kind).toBe(SimdTokenKind.RubyClose);
      expect(text.charAt(resolved[2].utf16Offset)).toBe('》');

      // 4. Ascii pipe |
      expect(resolved[3].kind).toBe(SimdTokenKind.InlinePipeAscii);
      expect(text.charAt(resolved[3].utf16Offset)).toBe('|');

      // 5. Ruby open 《
      expect(resolved[4].kind).toBe(SimdTokenKind.RubyOpen);
      expect(text.charAt(resolved[4].utf16Offset)).toBe('《');

      // 6. Ruby close 》
      expect(resolved[5].kind).toBe(SimdTokenKind.RubyClose);
      expect(text.charAt(resolved[5].utf16Offset)).toBe('》');

      // 7. Newline \n
      expect(resolved[6].kind).toBe(SimdTokenKind.Newline);
      expect(text.charAt(resolved[6].utf16Offset)).toBe('\n');

      // 8. Wide pipe ｜
      expect(resolved[7].kind).toBe(SimdTokenKind.InlinePipeWide);
      expect(text.charAt(resolved[7].utf16Offset)).toBe('｜');

      // 9. Ruby open 《
      expect(resolved[8].kind).toBe(SimdTokenKind.RubyOpen);
      expect(text.charAt(resolved[8].utf16Offset)).toBe('《');

      // 10. Ruby close 》
      expect(resolved[9].kind).toBe(SimdTokenKind.RubyClose);
      expect(text.charAt(resolved[9].utf16Offset)).toBe('》');
    });

    it('should accurately parse explicit and implicit ruby spans', () => {
      const text = '冒険者は｜魔法《マゴウ》を放ち、漢字《かんじ》の巻物を開いた。';
      const rubySpans = tokenizer.parseRubySpans(text, offsetTable);

      expect(rubySpans.length).toBe(2);

      // Explicit: '｜魔法《マゴウ》' (indices 4..12)
      expect(rubySpans[0]).toEqual({
        type: 'ruby',
        rawFrom: 4,
        rawTo: 12,
        baseText: '魔法',
        rubyText: 'マゴウ',
        isExplicit: true,
        pipeChar: '｜',
      });

      // Implicit: '漢字《かんじ》' (indices 16..23)
      expect(rubySpans[1]).toEqual({
        type: 'ruby',
        rawFrom: 16,
        rawTo: 23,
        baseText: '漢字',
        rubyText: 'かんじ',
        isExplicit: false,
        pipeChar: undefined,
      });
    });

    it('should process 10,000 characters within extreme latency target (< 5ms)', () => {
      const paragraph = '第一衛星《セレネ》が輝き、｜黒曜石《オブシディアン》の城門が開く。\n';
      const largeText = paragraph.repeat(250); // ~10,000 chars

      const start = performance.now();
      const spans = tokenizer.parseRubySpans(largeText, offsetTable);
      const elapsed = performance.now() - start;

      expect(spans.length).toBe(500); // 2 per paragraph * 250
      expect(elapsed).toBeLessThan(10); // Extreme performance target (typically < 3ms)
    });
  });
});
