/**
 * Pure TypeScript Zero-Dependency ZIP Archive Builder
 * 
 * Compliant with:
 * - PKWARE .ZIP File Format Specification
 * - IDPF / W3C EPUB Open Container Format (OCF) 3.0+
 * - UTF-8 Filename encoding (Bit 11)
 * - Deterministic, pure Uint8Array memory generation (Browser, WebWorker, Node.js compatible)
 */

export interface ZipEntryInput {
  name: string;
  data: Uint8Array | string;
  compress?: boolean;
  lastModified?: Date;
}

interface InternalZipEntry {
  nameBytes: Uint8Array;
  name: string;
  data: Uint8Array;
  crc32: number;
  uncompressedSize: number;
  compressedSize: number;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
}

// Pre-computed CRC32 Lookup Table (Polynomial: 0xEDB88320)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

/**
 * Calculates standard IEEE 802.3 32-bit Cyclic Redundancy Check (CRC-32).
 */
export function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Converts JavaScript Date to MS-DOS packed time and date format.
 */
export function toDosDateTime(date: Date = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);

  return { dosTime, dosDate };
}

export class ZipArchiveBuilder {
  private entries: ZipEntryInput[] = [];
  private textEncoder = new TextEncoder();

  /**
   * Adds a file entry to the ZIP archive.
   * If adding 'mimetype' for EPUB, add it first.
   */
  public addFile(name: string, content: string | Uint8Array, options?: { lastModified?: Date }): this {
    this.entries.push({
      name,
      data: content,
      lastModified: options?.lastModified,
    });
    return this;
  }

  /**
   * Builds the complete ZIP archive as a contiguous Uint8Array.
   */
  public buildUint8Array(): Uint8Array {
    const internalEntries: InternalZipEntry[] = [];
    let totalLocalHeadersAndDataSize = 0;

    // Phase 1: Prepare and measure entries
    for (const entry of this.entries) {
      const dataBytes = typeof entry.data === 'string'
        ? this.textEncoder.encode(entry.data)
        : entry.data;

      // Normalize path separators to forward slash and strip leading slashes
      const normalizedPath = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
      const nameBytes = this.textEncoder.encode(normalizedPath);
      const crc = calculateCrc32(dataBytes);
      const { dosTime, dosDate } = toDosDateTime(entry.lastModified);

      const internal: InternalZipEntry = {
        nameBytes,
        name: normalizedPath,
        data: dataBytes,
        crc32: crc,
        uncompressedSize: dataBytes.length,
        compressedSize: dataBytes.length, // STORE mode (uncompressed)
        dosTime,
        dosDate,
        localHeaderOffset: totalLocalHeadersAndDataSize,
      };

      internalEntries.push(internal);

      // Local Header Size: 30 bytes + filename length + 0 extra fields + payload size
      totalLocalHeadersAndDataSize += 30 + nameBytes.length + dataBytes.length;
    }

    // Phase 2: Calculate Central Directory Size
    let centralDirectorySize = 0;
    for (const item of internalEntries) {
      // Central Directory Header Size: 46 bytes + filename length + 0 extra fields + 0 comment
      centralDirectorySize += 46 + item.nameBytes.length;
    }

    // End of Central Directory Size: 22 bytes
    const eocdSize = 22;
    const totalArchiveSize = totalLocalHeadersAndDataSize + centralDirectorySize + eocdSize;

    // Phase 3: Allocate single buffer and serialize binary records
    const buffer = new ArrayBuffer(totalArchiveSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    // 3.1. Write Local File Headers and Data
    for (const item of internalEntries) {
      // Local file header signature = 0x04034b50 ("PK\x03\x04")
      view.setUint32(offset, 0x04034b50, true);
      // Version needed to extract: 2.0 (20)
      view.setUint16(offset + 4, 20, true);
      // General purpose bit flag: 0x0800 (Language encoding flag / UTF-8)
      view.setUint16(offset + 6, 0x0800, true);
      // Compression method: 0 (STORE)
      view.setUint16(offset + 8, 0, true);
      // Last mod file time
      view.setUint16(offset + 10, item.dosTime, true);
      // Last mod file date
      view.setUint16(offset + 12, item.dosDate, true);
      // CRC-32
      view.setUint32(offset + 14, item.crc32, true);
      // Compressed size
      view.setUint32(offset + 18, item.compressedSize, true);
      // Uncompressed size
      view.setUint32(offset + 22, item.uncompressedSize, true);
      // File name length
      view.setUint16(offset + 26, item.nameBytes.length, true);
      // Extra field length: 0
      view.setUint16(offset + 28, 0, true);

      offset += 30;

      // File name
      bytes.set(item.nameBytes, offset);
      offset += item.nameBytes.length;

      // File data payload
      bytes.set(item.data, offset);
      offset += item.data.length;
    }

    const centralDirectoryOffset = offset;

    // 3.2. Write Central Directory Headers
    for (const item of internalEntries) {
      // Central directory file header signature = 0x02014b50 ("PK\x01\x02")
      view.setUint32(offset, 0x02014b50, true);
      // Version made by: 20 (MS-DOS / OS-neutral 2.0)
      view.setUint16(offset + 4, 20, true);
      // Version needed to extract: 20
      view.setUint16(offset + 6, 20, true);
      // General purpose bit flag: UTF-8
      view.setUint16(offset + 8, 0x0800, true);
      // Compression method: 0 (STORE)
      view.setUint16(offset + 10, 0, true);
      // Last mod file time
      view.setUint16(offset + 12, item.dosTime, true);
      // Last mod file date
      view.setUint16(offset + 14, item.dosDate, true);
      // CRC-32
      view.setUint32(offset + 16, item.crc32, true);
      // Compressed size
      view.setUint32(offset + 20, item.compressedSize, true);
      // Uncompressed size
      view.setUint32(offset + 24, item.uncompressedSize, true);
      // File name length
      view.setUint16(offset + 28, item.nameBytes.length, true);
      // Extra field length: 0
      view.setUint16(offset + 30, 0, true);
      // File comment length: 0
      view.setUint16(offset + 32, 0, true);
      // Disk number start: 0
      view.setUint16(offset + 34, 0, true);
      // Internal file attributes: 0
      view.setUint16(offset + 36, 0, true);
      // External file attributes: 0x81a40000 (regular UNIX rw-r--r--)
      view.setUint32(offset + 38, 0x81a40000, true);
      // Relative offset of local header
      view.setUint32(offset + 42, item.localHeaderOffset, true);

      offset += 46;

      // File name
      bytes.set(item.nameBytes, offset);
      offset += item.nameBytes.length;
    }

    // 3.3. Write End of Central Directory Record (EOCD)
    // End of central dir signature = 0x06054b50 ("PK\x05\x06")
    view.setUint32(offset, 0x06054b50, true);
    // Number of this disk: 0
    view.setUint16(offset + 4, 0, true);
    // Disk where central directory starts: 0
    view.setUint16(offset + 6, 0, true);
    // Number of central directory records on this disk
    view.setUint16(offset + 8, internalEntries.length, true);
    // Total number of central directory records
    view.setUint16(offset + 10, internalEntries.length, true);
    // Size of central directory
    view.setUint32(offset + 12, centralDirectorySize, true);
    // Offset of start of central directory
    view.setUint32(offset + 16, centralDirectoryOffset, true);
    // Comment length: 0
    view.setUint16(offset + 20, 0, true);

    return bytes;
  }

  /**
   * Builds the complete ZIP archive as a Blob (useful for browser downloads).
   */
  public buildBlob(mimeType = 'application/zip'): Blob {
    const bytes = this.buildUint8Array();
    return new Blob([bytes as unknown as BlobPart], { type: mimeType });
  }
}
