import { describe, it, expect } from 'vitest';
import {
  ZipArchiveBuilder,
  calculateCrc32,
  toDosDateTime,
} from '../src/core/export/ZipArchiveBuilder.js';

describe('ZipArchiveBuilder & CRC32', () => {
  describe('calculateCrc32', () => {
    it('calculates standard CRC-32 checksums for known vectors', () => {
      const encoder = new TextEncoder();
      // Empty input
      expect(calculateCrc32(new Uint8Array(0))).toBe(0);

      // Standard test vector: "123456789" -> 0xcbf43926 (3421780262)
      const testVec = encoder.encode('123456789');
      expect(calculateCrc32(testVec)).toBe(0xcbf43926);

      // Simple ASCII: "mimetype"
      const mime = encoder.encode('mimetype');
      expect(calculateCrc32(mime)).toBeGreaterThan(0);
    });
  });

  describe('toDosDateTime', () => {
    it('encodes date into valid MS-DOS time and date bitfields', () => {
      const date = new Date(2026, 9, 7, 18, 30, 40); // 2026-10-07 18:30:40
      const { dosTime, dosDate } = toDosDateTime(date);

      expect(dosTime).toBeGreaterThan(0);
      expect(dosDate).toBeGreaterThan(0);

      // Verify year field in date: (2026 - 1980) = 46 -> bits 9..15
      const year = ((dosDate >> 9) & 0x7f) + 1980;
      expect(year).toBe(2026);
    });
  });

  describe('ZipArchiveBuilder binary layout', () => {
    it('generates compliant binary structure with PK local header and central directory', () => {
      const builder = new ZipArchiveBuilder();
      builder.addFile('hello.txt', 'Hello, World!');
      builder.addFile('docs/readme.md', '# Readme');

      const bytes = builder.buildUint8Array();
      expect(bytes.length).toBeGreaterThan(0);

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      // 1. First Local File Header Signature: PK\x03\x04 (0x04034b50)
      expect(view.getUint32(0, true)).toBe(0x04034b50);

      // Filename length at offset 26
      const fnLen1 = view.getUint16(26, true);
      expect(fnLen1).toBe('hello.txt'.length);

      const decoder = new TextDecoder();
      const filename1 = decoder.decode(bytes.slice(30, 30 + fnLen1));
      expect(filename1).toBe('hello.txt');

      // Verify EOCD signature at end of file: PK\x05\x06 (0x06054b50)
      const eocdOffset = bytes.length - 22;
      expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);

      // Number of entries in EOCD
      const entryCount = view.getUint16(eocdOffset + 10, true);
      expect(entryCount).toBe(2);
    });

    it('strictly satisfies EPUB OCF 3.0 specification when mimetype is first entry', () => {
      const builder = new ZipArchiveBuilder();
      const mimetype = 'application/epub+zip';
      builder.addFile('mimetype', mimetype);
      builder.addFile('META-INF/container.xml', '<?xml version="1.0"?><container/>');

      const bytes = builder.buildUint8Array();
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const decoder = new TextDecoder();

      // EPUB OCF Requirements:
      // 1. Starts with PK\x03\x04
      expect(view.getUint32(0, true)).toBe(0x04034b50);

      // 2. Compression method is 0 (STORE)
      expect(view.getUint16(8, true)).toBe(0);

      // 3. Filename length is 8
      expect(view.getUint16(26, true)).toBe(8);

      // 4. Extra field length is 0
      expect(view.getUint16(28, true)).toBe(0);

      // 5. Bytes 30..37 are exactly "mimetype"
      const fn = decoder.decode(bytes.slice(30, 38));
      expect(fn).toBe('mimetype');

      // 6. Bytes 38..57 are exactly "application/epub+zip"
      const content = decoder.decode(bytes.slice(38, 58));
      expect(content).toBe('application/epub+zip');

      // 7. Byte 58 starts the next local file header (PK\x03\x04)
      expect(view.getUint32(58, true)).toBe(0x04034b50);
    });
  });
});
