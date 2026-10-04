/**
 * WasmSimdTokenizer
 *
 * Implements high-speed 16-byte parallel token scanning via WebAssembly SIMD128.
 * Detects:
 * - Newline (\\n: 0x0A) -> TokenKind.Newline (1)
 * - Half-width pipe (|: 0x7C) -> TokenKind.InlinePipeAscii (2)
 * - Full-width ruby open (《: 0xE3 0x80 0x8A) -> TokenKind.RubyOpen (3)
 * - Full-width ruby close (》: 0xE3 0x80 0x8B) -> TokenKind.RubyClose (4)
 * - Full-width pipe (｜: 0xEF 0xBD 0x9C) -> TokenKind.InlinePipeWide (5)
 *
 * Interoperates with DualOffsetTable to convert UTF-8 byte offsets to CodeMirror UTF-16 code units.
 */

import { SIMD_TOKENIZER_WASM_BASE64 } from './wasm/simd_tokenizer_base64.js';
import { DualOffsetTable } from './DualOffsetTable.js';

export enum SimdTokenKind {
  Newline = 1,
  InlinePipeAscii = 2,
  RubyOpen = 3,
  RubyClose = 4,
  InlinePipeWide = 5,
}

export interface SimdRawToken {
  kind: SimdTokenKind;
  utf8Offset: number;
}

export interface SimdResolvedToken {
  kind: SimdTokenKind;
  utf8Offset: number;
  utf16Offset: number;
}

export interface SimdRubySpan {
  type: 'ruby';
  rawFrom: number; // UTF-16 code unit
  rawTo: number;   // UTF-16 code unit
  baseText: string;
  rubyText: string;
  isExplicit: boolean;
  pipeChar?: '｜' | '|';
}

export class WasmSimdTokenizer {
  private instance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private scanTokensSimd: ((
    ptr: number,
    len: number,
    baseUtf8: number,
    outBuf: number,
    maxTokens: number
  ) => number) | null = null;

  private isReady = false;

  constructor() {
    this.initSync();
  }

  private initSync(): void {
    try {
      const binaryString = atob(SIMD_TOKENIZER_WASM_BASE64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const module = new WebAssembly.Module(bytes);
      this.instance = new WebAssembly.Instance(module);
      const exports = this.instance.exports as {
        memory: WebAssembly.Memory;
        scan_tokens_simd: (ptr: number, len: number, baseUtf8: number, outBuf: number, maxTokens: number) => number;
      };

      this.memory = exports.memory;
      this.scanTokensSimd = exports.scan_tokens_simd;
      this.isReady = true;
    } catch (err) {
      console.warn('[WasmSimdTokenizer] Failed to initialize Wasm SIMD instance synchronously:', err);
      this.isReady = false;
    }
  }

  public isAvailable(): boolean {
    return this.isReady && this.scanTokensSimd !== null && this.memory !== null;
  }

  /**
   * Scans raw tokens from a UTF-8 Uint8Array segment using Wasm SIMD.
   */
  public scanTokens(
    utf8Bytes: Uint8Array,
    baseUtf8: number = 0,
    maxTokens: number = 65536
  ): SimdRawToken[] {
    if (!this.isAvailable()) {
      return this.fallbackScanTokens(utf8Bytes, baseUtf8, maxTokens);
    }

    const mem = this.memory!;
    const memU8 = new Uint8Array(mem.buffer);

    // Staging memory offsets (well above 64KB stack / scratch space)
    const textPtr = 65536;
    const outBufPtr = (textPtr + utf8Bytes.length + 1027) & ~3;

    // Check if buffer needs expansion (grow pages if needed)
    const requiredBytes = outBufPtr + maxTokens * 8 + 1024;
    if (requiredBytes > mem.buffer.byteLength) {
      const pagesToGrow = Math.ceil((requiredBytes - mem.buffer.byteLength) / 65536);
      mem.grow(pagesToGrow);
    }

    const liveMemU8 = new Uint8Array(mem.buffer);
    liveMemU8.set(utf8Bytes, textPtr);

    const count = this.scanTokensSimd!(textPtr, utf8Bytes.length, baseUtf8, outBufPtr, maxTokens);

    const liveMemI32 = new Int32Array(mem.buffer, outBufPtr, count * 2);
    const tokens: SimdRawToken[] = new Array(count);

    for (let i = 0; i < count; i++) {
      tokens[i] = {
        kind: liveMemI32[i * 2] as SimdTokenKind,
        utf8Offset: liveMemI32[i * 2 + 1],
      };
    }

    return tokens;
  }

  /**
   * Fallback token scanning without Wasm SIMD.
   */
  private fallbackScanTokens(
    utf8Bytes: Uint8Array,
    baseUtf8: number,
    maxTokens: number
  ): SimdRawToken[] {
    const tokens: SimdRawToken[] = [];
    const len = utf8Bytes.length;

    for (let pos = 0; pos < len && tokens.length < maxTokens; pos++) {
      const b0 = utf8Bytes[pos];
      if (b0 === 0x0A) {
        tokens.push({ kind: SimdTokenKind.Newline, utf8Offset: baseUtf8 + pos });
      } else if (b0 === 0x7C) {
        tokens.push({ kind: SimdTokenKind.InlinePipeAscii, utf8Offset: baseUtf8 + pos });
      } else if (b0 === 0xE3 && pos + 2 < len) {
        const b1 = utf8Bytes[pos + 1];
        const b2 = utf8Bytes[pos + 2];
        if (b1 === 0x80 && b2 === 0x8A) {
          tokens.push({ kind: SimdTokenKind.RubyOpen, utf8Offset: baseUtf8 + pos });
          pos += 2;
        } else if (b1 === 0x80 && b2 === 0x8B) {
          tokens.push({ kind: SimdTokenKind.RubyClose, utf8Offset: baseUtf8 + pos });
          pos += 2;
        }
      } else if (b0 === 0xEF && pos + 2 < len) {
        const b1 = utf8Bytes[pos + 1];
        const b2 = utf8Bytes[pos + 2];
        if (b1 === 0xBD && b2 === 0x9C) {
          tokens.push({ kind: SimdTokenKind.InlinePipeWide, utf8Offset: baseUtf8 + pos });
          pos += 2;
        }
      }
    }

    return tokens;
  }

  /**
   * Full pipeline: scans tokens and maps to UTF-16 using DualOffsetTable.
   */
  public tokenizeWithTable(
    text: string,
    offsetTable: DualOffsetTable
  ): SimdResolvedToken[] {
    offsetTable.buildFromText(text);
    const utf8Bytes = offsetTable.getUtf8Bytes();
    const rawTokens = this.scanTokens(utf8Bytes, 0, 65536);

    return rawTokens.map((t) => ({
      kind: t.kind,
      utf8Offset: t.utf8Offset,
      utf16Offset: offsetTable.utf8ToUtf16(t.utf8Offset),
    }));
  }

  /**
   * Fast Ruby Markup Parser accelerated by SIMD tokens and DualOffsetTable.
   * Matches both explicit (｜親文字《ルビ》) and implicit (漢字《ルビ》) structures.
   */
  public parseRubySpans(text: string, offsetTable?: DualOffsetTable): SimdRubySpan[] {
    const table = offsetTable ?? new DualOffsetTable();
    const resolvedTokens = this.tokenizeWithTable(text, table);

    const spans: SimdRubySpan[] = [];

    // Helper to find tokens by index
    for (let i = 0; i < resolvedTokens.length; i++) {
      const token = resolvedTokens[i];

      // Detect RubyOpen (《)
      if (token.kind === SimdTokenKind.RubyOpen) {
        // Look for corresponding RubyClose (》) before next newline
        let closeIdx = -1;
        for (let j = i + 1; j < resolvedTokens.length; j++) {
          if (resolvedTokens[j].kind === SimdTokenKind.Newline) break;
          if (resolvedTokens[j].kind === SimdTokenKind.RubyClose) {
            closeIdx = j;
            break;
          }
        }

        if (closeIdx === -1) continue;

        const openPos = token.utf16Offset;
        const closePos = resolvedTokens[closeIdx].utf16Offset;
        const rubyText = text.slice(openPos + 1, closePos);

        // Check if preceding token is an explicit pipe (｜ or |)
        let isExplicit = false;
        let pipeChar: '｜' | '|' | undefined = undefined;
        let rawFrom = -1;
        let baseText = '';

        if (i > 0) {
          const prevToken = resolvedTokens[i - 1];
          if (
            (prevToken.kind === SimdTokenKind.InlinePipeWide ||
             prevToken.kind === SimdTokenKind.InlinePipeAscii) &&
            prevToken.utf16Offset < openPos
          ) {
            isExplicit = true;
            pipeChar = prevToken.kind === SimdTokenKind.InlinePipeWide ? '｜' : '|';
            rawFrom = prevToken.utf16Offset;
            baseText = text.slice(rawFrom + 1, openPos);
          }
        }

        if (!isExplicit) {
          // Implicit ruby: search backward for Kanji characters immediately before 《
          let baseStart = openPos - 1;
          while (baseStart >= 0) {
            const ch = text.charAt(baseStart);
            // Check Kanji Unicode range
            if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(ch)) {
              baseStart--;
            } else {
              break;
            }
          }
          baseStart += 1;

          if (baseStart < openPos) {
            rawFrom = baseStart;
            baseText = text.slice(baseStart, openPos);
          }
        }

        if (rawFrom >= 0 && baseText.length > 0) {
          spans.push({
            type: 'ruby',
            rawFrom,
            rawTo: closePos + 1,
            baseText,
            rubyText,
            isExplicit,
            pipeChar,
          });
        }
      }
    }

    return spans;
  }
}
