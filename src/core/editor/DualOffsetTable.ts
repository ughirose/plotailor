/**
 * DualOffsetTable
 *
 * Implements paragraph-level dual-offset index table between UTF-8 byte offsets and UTF-16 code unit offsets.
 *
 * Requirements (Spec Section 5):
 * - CodeMirror 6 (JavaScript) manages offsets in UTF-16 Code Units.
 * - Wasm SIMD token scanner operates on UTF-8 byte streams.
 * - Stores paragraph starting offset pairs (utf8_offset, utf16_offset) in an indexed array.
 * - Relative local conversion is performed only within modified paragraphs, completely avoiding
 *   full-document re-conversion for 300,000+ characters.
 */

export interface OffsetPair {
  utf8Offset: number;
  utf16Offset: number;
}

export class DualOffsetTable {
  private checkpoints: OffsetPair[] = [];
  private text: string = '';
  private utf8Bytes: Uint8Array = new Uint8Array(0);

  constructor() {
    this.reset();
  }

  /**
   * Resets the table with a new document string.
   * Scans paragraph boundaries ('\n') and builds checkpoints.
   */
  buildFromText(text: string): void {
    this.text = text;
    const encoder = new TextEncoder();
    this.utf8Bytes = encoder.encode(text);

    this.checkpoints = [{ utf8Offset: 0, utf16Offset: 0 }];

    let utf16Pos = 0;
    let utf8Pos = 0;

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      let byteLen = 1;

      if (code <= 0x7F) {
        byteLen = 1;
      } else if (code <= 0x7FF) {
        byteLen = 2;
      } else if (code >= 0xD800 && code <= 0xDBFF) {
        // High surrogate (4-byte UTF-8 sequence spanning 2 UTF-16 code units)
        byteLen = 4;
        i++; // skip low surrogate
      } else {
        byteLen = 3;
      }

      utf16Pos = i + 1;
      utf8Pos += byteLen;

      // Check for newline (paragraph delimiter)
      if (code === 0x0A) {
        this.checkpoints.push({
          utf8Offset: utf8Pos,
          utf16Offset: utf16Pos,
        });
      }
    }
  }

  getCheckpoints(): readonly OffsetPair[] {
    return this.checkpoints;
  }

  getUtf8Bytes(): Uint8Array {
    return this.utf8Bytes;
  }

  getText(): string {
    return this.text;
  }

  /**
   * Finds the nearest preceding checkpoint for a given UTF-8 offset via binary search.
   */
  findPrecedingByUtf8(targetUtf8: number): OffsetPair {
    if (this.checkpoints.length === 0) return { utf8Offset: 0, utf16Offset: 0 };
    let low = 0;
    let high = this.checkpoints.length - 1;
    let ans = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.checkpoints[mid].utf8Offset <= targetUtf8) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return this.checkpoints[ans];
  }

  /**
   * Finds the nearest preceding checkpoint for a given UTF-16 offset via binary search.
   */
  findPrecedingByUtf16(targetUtf16: number): OffsetPair {
    if (this.checkpoints.length === 0) return { utf8Offset: 0, utf16Offset: 0 };
    let low = 0;
    let high = this.checkpoints.length - 1;
    let ans = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.checkpoints[mid].utf16Offset <= targetUtf16) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return this.checkpoints[ans];
  }

  /**
   * Converts a UTF-8 byte offset to a UTF-16 Code Unit offset.
   * Computes delta locally from the nearest paragraph checkpoint.
   */
  utf8ToUtf16(utf8Offset: number): number {
    if (utf8Offset <= 0) return 0;
    if (utf8Offset >= this.utf8Bytes.length) return this.text.length;

    const cp = this.findPrecedingByUtf8(utf8Offset);
    let curUtf8 = cp.utf8Offset;
    let curUtf16 = cp.utf16Offset;

    while (curUtf8 < utf8Offset && curUtf16 < this.text.length) {
      const code = this.text.charCodeAt(curUtf16);
      if (code <= 0x7F) {
        curUtf8 += 1;
        curUtf16 += 1;
      } else if (code <= 0x7FF) {
        curUtf8 += 2;
        curUtf16 += 1;
      } else if (code >= 0xD800 && code <= 0xDBFF) {
        curUtf8 += 4;
        curUtf16 += 2;
      } else {
        curUtf8 += 3;
        curUtf16 += 1;
      }
    }

    return curUtf16;
  }

  /**
   * Converts a UTF-16 Code Unit offset to a UTF-8 byte offset.
   * Computes delta locally from the nearest paragraph checkpoint.
   */
  utf16ToUtf8(utf16Offset: number): number {
    if (utf16Offset <= 0) return 0;
    if (utf16Offset >= this.text.length) return this.utf8Bytes.length;

    const cp = this.findPrecedingByUtf16(utf16Offset);
    let curUtf8 = cp.utf8Offset;
    let curUtf16 = cp.utf16Offset;

    while (curUtf16 < utf16Offset && curUtf16 < this.text.length) {
      const code = this.text.charCodeAt(curUtf16);
      if (code <= 0x7F) {
        curUtf8 += 1;
        curUtf16 += 1;
      } else if (code <= 0x7FF) {
        curUtf8 += 2;
        curUtf16 += 1;
      } else if (code >= 0xD800 && code <= 0xDBFF) {
        curUtf8 += 4;
        curUtf16 += 2;
      } else {
        curUtf8 += 3;
        curUtf16 += 1;
      }
    }

    return curUtf8;
  }

  reset(): void {
    this.checkpoints = [{ utf8Offset: 0, utf16Offset: 0 }];
    this.text = '';
    this.utf8Bytes = new Uint8Array(0);
  }
}
