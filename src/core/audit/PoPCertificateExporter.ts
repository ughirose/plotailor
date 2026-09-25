declare function require(moduleName: string): any;
const { createHash } = require('crypto');

/**
 * Single Audit Event Block in the Proof of Process (PoP) Merkle Hash Chain
 */
export interface PoPAuditBlock {
  index: number;
  timestamp: number;
  eventId: string;
  insCount: number;
  delCount: number;
  keystrokes: number;
  pauseDurationMs: number;
  keystrokeIntervals?: number[];
  payloadHash: string;
  prevHash: string;
  hash: string;
  signature?: string;
}

/**
 * Human-Centric Authoring & Typing Summary Metrics
 */
export interface PoPSummaryMetrics {
  hcisScore: number;            // Human-Centric Authoring Score: (ins + del) / finalCharCount
  keystrokeEntropy: number;     // Typing entropy in bits (Shannon entropy of keystroke intervals)
  totalElapsedTimeMs: number;  // Total elapsed time from start to end
  activeWritingTimeMs: number; // Duration of active writing
  pauseTimeMs: number;         // Total pause duration
  finalCharCount: number;      // Final manuscript length in characters
  totalInsertions: number;     // Total inserted characters
  totalDeletions: number;      // Total deleted characters
  totalKeystrokes: number;     // Total keystroke events
  totalBlocks: number;         // Total audit log blocks in chain
}

/**
 * Summary Card representation for IDE 3-Pane Right Pane / Reports
 */
export interface PoPSummaryCard {
  title: string;
  manuscriptTitle: string;
  author: string;
  metrics: PoPSummaryMetrics;
  rootHash: string;
  chainLength: number;
  exportedAt: string;
  formattedCardMarkdown: string;
  formattedCardHTML: string;
}

/**
 * Certificate Data Structure exported in JSON / CBOR format
 */
export interface PoPCertificate {
  version: string;
  specVersion: string;
  manuscriptTitle: string;
  author: string;
  exportedAt: string;
  rootHash: string;
  summary: PoPSummaryMetrics;
  summaryCard: PoPSummaryCard;
  blocks: PoPAuditBlock[];
}

/**
 * Verification result returned by standalone verification function
 */
export interface PoPVerificationResult {
  valid: boolean;
  blockCount: number;
  calculatedRootHash?: string;
  expectedRootHash?: string;
  error?: string;
  summary?: PoPSummaryMetrics;
}

/**
 * Compute SHA-256 hash string from string or Uint8Array
 */
export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Calculate block hash given its properties
 */
export function calculateBlockHash(
  index: number,
  timestamp: number,
  eventId: string,
  insCount: number,
  delCount: number,
  keystrokes: number,
  pauseDurationMs: number,
  payloadHash: string,
  prevHash: string
): string {
  const content = `${index}:${timestamp}:${eventId}:${insCount}:${delCount}:${keystrokes}:${pauseDurationMs}:${payloadHash}:${prevHash}`;
  return sha256(content);
}

/**
 * PoPAuditEngine records authoring edit events and builds an immutable Merkle Hash Chain
 */
export class PoPAuditEngine {
  private blocks: PoPAuditBlock[] = [];
  private manuscriptTitle: string;
  private author: string;

  constructor(manuscriptTitle = 'Untitled Manuscript', author = 'Anonymous Author') {
    this.manuscriptTitle = manuscriptTitle;
    this.author = author;
  }

  public setMetadata(title: string, author: string): void {
    this.manuscriptTitle = title;
    this.author = author;
  }

  /**
   * Append a new audit event block to the chain
   */
  public recordEvent(params: {
    eventId: string;
    insCount: number;
    delCount: number;
    keystrokes: number;
    pauseDurationMs: number;
    payload?: string;
    keystrokeIntervals?: number[];
    timestamp?: number;
  }): PoPAuditBlock {
    const index = this.blocks.length;
    const timestamp = params.timestamp ?? Date.now();
    const prevHash = index === 0
      ? '0000000000000000000000000000000000000000000000000000000000000000'
      : this.blocks[index - 1].hash;

    const payloadHash = params.payload ? sha256(params.payload) : sha256('');

    const hash = calculateBlockHash(
      index,
      timestamp,
      params.eventId,
      params.insCount,
      params.delCount,
      params.keystrokes,
      params.pauseDurationMs,
      payloadHash,
      prevHash
    );

    const block: PoPAuditBlock = {
      index,
      timestamp,
      eventId: params.eventId,
      insCount: params.insCount,
      delCount: params.delCount,
      keystrokes: params.keystrokes,
      pauseDurationMs: params.pauseDurationMs,
      keystrokeIntervals: params.keystrokeIntervals ? [...params.keystrokeIntervals] : undefined,
      payloadHash,
      prevHash,
      hash,
    };

    this.blocks.push(block);
    return block;
  }

  public getBlocks(): readonly PoPAuditBlock[] {
    return this.blocks;
  }

  public getRootHash(): string {
    if (this.blocks.length === 0) {
      return '0000000000000000000000000000000000000000000000000000000000000000';
    }
    return this.blocks[this.blocks.length - 1].hash;
  }

  /**
   * Calculate summary metrics: HCIS, Typing Entropy, and Elapsed Writing Time
   */
  public computeMetrics(): PoPSummaryMetrics {
    if (this.blocks.length === 0) {
      return {
        hcisScore: 0,
        keystrokeEntropy: 0,
        totalElapsedTimeMs: 0,
        activeWritingTimeMs: 0,
        pauseTimeMs: 0,
        finalCharCount: 0,
        totalInsertions: 0,
        totalDeletions: 0,
        totalKeystrokes: 0,
        totalBlocks: 0,
      };
    }

    let totalInsertions = 0;
    let totalDeletions = 0;
    let totalKeystrokes = 0;
    let totalPauseMs = 0;
    const allIntervals: number[] = [];

    for (const b of this.blocks) {
      totalInsertions += b.insCount;
      totalDeletions += b.delCount;
      totalKeystrokes += b.keystrokes;
      totalPauseMs += b.pauseDurationMs;
      if (b.keystrokeIntervals) {
        allIntervals.push(...b.keystrokeIntervals);
      }
    }

    const finalCharCount = Math.max(0, totalInsertions - totalDeletions);
    // HCIS Score: CR = (ins + del) / L_final
    const hcisScore = finalCharCount > 0 ? (totalInsertions + totalDeletions) / finalCharCount : 0;

    // Calculate Keystroke Entropy (Shannon Entropy of binned inter-keystroke timing intervals)
    const keystrokeEntropy = computeKeystrokeEntropy(allIntervals);

    const startTime = this.blocks[0].timestamp;
    const endTime = this.blocks[this.blocks.length - 1].timestamp;
    const totalElapsedTimeMs = Math.max(0, endTime - startTime);
    const activeWritingTimeMs = Math.max(0, totalElapsedTimeMs - totalPauseMs);

    return {
      hcisScore: Number(hcisScore.toFixed(4)),
      keystrokeEntropy: Number(keystrokeEntropy.toFixed(4)),
      totalElapsedTimeMs,
      activeWritingTimeMs,
      pauseTimeMs: totalPauseMs,
      finalCharCount,
      totalInsertions,
      totalDeletions,
      totalKeystrokes,
      totalBlocks: this.blocks.length,
    };
  }

  /**
   * Generate PoP Certificate structure
   */
  public generateCertificate(): PoPCertificate {
    const metrics = this.computeMetrics();
    const rootHash = this.getRootHash();
    const exportedAt = new Date().toISOString();

    const summaryCard = createSummaryCard(
      this.manuscriptTitle,
      this.author,
      metrics,
      rootHash,
      this.blocks.length,
      exportedAt
    );

    return {
      version: '1.0.0',
      specVersion: 'PoP-v1',
      manuscriptTitle: this.manuscriptTitle,
      author: this.author,
      exportedAt,
      rootHash,
      summary: metrics,
      summaryCard,
      blocks: [...this.blocks],
    };
  }
}

/**
 * Compute Shannon entropy of keystroke intervals (binned timing distribution)
 */
export function computeKeystrokeEntropy(intervals: number[]): number {
  if (intervals.length === 0) return 0;

  // Bin interval durations (ms) into logarithmic or fixed frequency buckets
  // Buckets: [0-50], [50-100], [100-200], [200-350], [350-500], [500-1000], [1000-2000], [2000+]
  const bucketCounts = new Array(8).fill(0);

  for (const interval of intervals) {
    if (interval <= 50) bucketCounts[0]++;
    else if (interval <= 100) bucketCounts[1]++;
    else if (interval <= 200) bucketCounts[2]++;
    else if (interval <= 350) bucketCounts[3]++;
    else if (interval <= 500) bucketCounts[4]++;
    else if (interval <= 1000) bucketCounts[5]++;
    else if (interval <= 2000) bucketCounts[6]++;
    else bucketCounts[7]++;
  }

  const total = intervals.length;
  let entropy = 0;

  for (const count of bucketCounts) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Format summary metrics into a structured Summary Card for 3-Pane IDE integration
 */
export function createSummaryCard(
  manuscriptTitle: string,
  author: string,
  metrics: PoPSummaryMetrics,
  rootHash: string,
  chainLength: number,
  exportedAt: string
): PoPSummaryCard {
  const activeMins = (metrics.activeWritingTimeMs / 60000).toFixed(1);
  const totalMins = (metrics.totalElapsedTimeMs / 60000).toFixed(1);

  const formattedCardMarkdown = [
    `### 📜 Proof of Process (PoP) 創作プロセス証明書`,
    `- **作品名**: ${manuscriptTitle}`,
    `- **著者**: ${author}`,
    `- **人間主体的執筆スコア (HCIS)**: \`${metrics.hcisScore.toFixed(2)}\` (CR)`,
    `- **打鍵エントロピー**: \`${metrics.keystrokeEntropy.toFixed(2)}\` bits`,
    `- **最終文字数**: \`${metrics.finalCharCount.toLocaleString()}\` 字`,
    `- **総挿入 / 総削除**: +${metrics.totalInsertions.toLocaleString()} / -${metrics.totalDeletions.toLocaleString()}`,
    `- **執筆時間サマリー**: 実執筆 ${activeMins} 分 / 総経過 ${totalMins} 分`,
    `- **監査ブロック数**: ${chainLength} ブロック`,
    `- **ルートハッシュ (Merkle Root)**: \`${rootHash.slice(0, 16)}...\``,
    `- **発行日時**: ${exportedAt}`,
  ].join('\n');

  const formattedCardHTML = `
<div class="pop-summary-card" data-root-hash="${rootHash}">
  <div class="pop-card-header">
    <span class="pop-badge">PoP Certificate Verified</span>
    <h4>${manuscriptTitle}</h4>
    <p class="pop-author">著者: ${author}</p>
  </div>
  <div class="pop-card-grid">
    <div class="pop-metric-item">
      <span class="label">人間主体スコア (HCIS)</span>
      <span class="value hcis-value">${metrics.hcisScore.toFixed(2)}</span>
    </div>
    <div class="pop-metric-item">
      <span class="label">打鍵エントロピー</span>
      <span class="value">${metrics.keystrokeEntropy.toFixed(2)} bits</span>
    </div>
    <div class="pop-metric-item">
      <span class="label">最終文字数</span>
      <span class="value">${metrics.finalCharCount.toLocaleString()} 字</span>
    </div>
    <div class="pop-metric-item">
      <span class="label">推敲数 (+/ -)</span>
      <span class="value">+${metrics.totalInsertions} / -${metrics.totalDeletions}</span>
    </div>
    <div class="pop-metric-item">
      <span class="label">実執筆時間</span>
      <span class="value">${activeMins} 分</span>
    </div>
    <div class="pop-metric-item">
      <span class="label">総監査ブロック</span>
      <span class="value">${chainLength}</span>
    </div>
  </div>
  <div class="pop-card-footer">
    <code class="root-hash">Root: ${rootHash.slice(0, 16)}...</code>
    <span class="timestamp">${exportedAt}</span>
  </div>
</div>
  `.trim();

  return {
    title: 'Proof of Process Summary',
    manuscriptTitle,
    author,
    metrics,
    rootHash,
    chainLength,
    exportedAt,
    formattedCardMarkdown,
    formattedCardHTML,
  };
}

/**
 * Exporter utility for JSON and CBOR serialization of PoP Certificates
 */
export class PoPCertificateExporter {
  /**
   * Export certificate to JSON string format
   */
  public static exportToJSON(cert: PoPCertificate, pretty = true): string {
    return JSON.stringify(cert, null, pretty ? 2 : undefined);
  }

  /**
   * Import certificate from JSON string format
   */
  public static importFromJSON(jsonString: string): PoPCertificate {
    return JSON.parse(jsonString) as PoPCertificate;
  }

  /**
   * Export certificate to CBOR binary format
   */
  public static exportToCBOR(cert: PoPCertificate): Uint8Array {
    return encodeCBOR(cert);
  }

  /**
   * Import certificate from CBOR binary format
   */
  public static importFromCBOR(cborData: Uint8Array): PoPCertificate {
    return decodeCBOR(cborData) as PoPCertificate;
  }
}

/**
 * Standalone verification function to independently verify a PoP certificate
 */
export function verifyPoPCertificate(
  certInput: PoPCertificate | Uint8Array | string
): PoPVerificationResult {
  let cert: PoPCertificate;

  try {
    if (typeof certInput === 'string') {
      cert = PoPCertificateExporter.importFromJSON(certInput);
    } else if (certInput instanceof Uint8Array) {
      cert = PoPCertificateExporter.importFromCBOR(certInput);
    } else {
      cert = certInput;
    }
  } catch (err: any) {
    return {
      valid: false,
      blockCount: 0,
      error: `Failed to parse certificate input: ${err?.message || err}`,
    };
  }

  if (!cert || !Array.isArray(cert.blocks)) {
    return {
      valid: false,
      blockCount: 0,
      error: 'Invalid certificate format: missing blocks array',
    };
  }

  if (cert.blocks.length === 0) {
    const isGenesisMatch = cert.rootHash === '0000000000000000000000000000000000000000000000000000000000000000';
    return {
      valid: isGenesisMatch,
      blockCount: 0,
      calculatedRootHash: cert.rootHash,
      expectedRootHash: cert.rootHash,
      error: isGenesisMatch ? undefined : 'Genesis hash mismatch for empty block chain',
      summary: cert.summary,
    };
  }

  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (let i = 0; i < cert.blocks.length; i++) {
    const block = cert.blocks[i];

    if (block.index !== i) {
      return {
        valid: false,
        blockCount: cert.blocks.length,
        error: `Block index mismatch at block ${i}: expected ${i}, got ${block.index}`,
      };
    }

    if (block.prevHash !== prevHash) {
      return {
        valid: false,
        blockCount: cert.blocks.length,
        error: `Previous hash chain link broken at block ${i}: expected ${prevHash}, got ${block.prevHash}`,
      };
    }

    const expectedHash = calculateBlockHash(
      block.index,
      block.timestamp,
      block.eventId,
      block.insCount,
      block.delCount,
      block.keystrokes,
      block.pauseDurationMs,
      block.payloadHash,
      block.prevHash
    );

    if (block.hash !== expectedHash) {
      return {
        valid: false,
        blockCount: cert.blocks.length,
        error: `Tampered hash detected at block ${i}: expected ${expectedHash}, got ${block.hash}`,
      };
    }

    prevHash = block.hash;
  }

  const finalHash = cert.blocks[cert.blocks.length - 1].hash;

  if (cert.rootHash !== finalHash) {
    return {
      valid: false,
      blockCount: cert.blocks.length,
      calculatedRootHash: finalHash,
      expectedRootHash: cert.rootHash,
      error: `Root hash mismatch: expected ${cert.rootHash}, calculated ${finalHash}`,
    };
  }

  return {
    valid: true,
    blockCount: cert.blocks.length,
    calculatedRootHash: finalHash,
    expectedRootHash: cert.rootHash,
    summary: cert.summary,
  };
}

// -----------------------------------------------------------------------------
// Lightweight Standard Compliant CBOR Encoder & Decoder
// -----------------------------------------------------------------------------

export function encodeCBOR(value: unknown): Uint8Array {
  const buffers: Uint8Array[] = [];

  function pushByte(b: number) {
    buffers.push(new Uint8Array([b]));
  }

  function pushBytes(arr: Uint8Array) {
    buffers.push(arr);
  }

  function encodeHeader(major: number, val: number) {
    if (val < 24) {
      pushByte((major << 5) | val);
    } else if (val < 256) {
      pushByte((major << 5) | 24);
      pushByte(val);
    } else if (val < 65536) {
      pushByte((major << 5) | 25);
      const buf = new Uint8Array(2);
      new DataView(buf.buffer).setUint16(0, val, false);
      pushBytes(buf);
    } else if (val < 4294967296) {
      pushByte((major << 5) | 26);
      const buf = new Uint8Array(4);
      new DataView(buf.buffer).setUint32(0, val, false);
      pushBytes(buf);
    } else {
      pushByte((major << 5) | 27);
      const buf = new Uint8Array(8);
      const view = new DataView(buf.buffer);
      view.setUint32(0, Math.floor(val / 4294967296), false);
      view.setUint32(4, val % 4294967296, false);
      pushBytes(buf);
    }
  }

  function encodeItem(item: unknown) {
    if (item === null || item === undefined) {
      pushByte(0xf6); // simple value 22 (null)
    } else if (typeof item === 'boolean') {
      pushByte(item ? 0xf5 : 0xf4);
    } else if (typeof item === 'number') {
      if (Number.isInteger(item)) {
        if (item >= 0) {
          encodeHeader(0, item);
        } else {
          encodeHeader(1, -1 - item);
        }
      } else {
        // float64
        pushByte(0xfb);
        const buf = new Uint8Array(8);
        new DataView(buf.buffer).setFloat64(0, item, false);
        pushBytes(buf);
      }
    } else if (typeof item === 'string') {
      const utf8 = new TextEncoder().encode(item);
      encodeHeader(3, utf8.length);
      pushBytes(utf8);
    } else if (item instanceof Uint8Array) {
      encodeHeader(2, item.length);
      pushBytes(item);
    } else if (Array.isArray(item)) {
      encodeHeader(4, item.length);
      for (const elem of item) {
        encodeItem(elem);
      }
    } else if (typeof item === 'object') {
      const keys = Object.keys(item);
      encodeHeader(5, keys.length);
      for (const k of keys) {
        encodeItem(k);
        encodeItem((item as Record<string, unknown>)[k]);
      }
    }
  }

  encodeItem(value);

  let totalLen = 0;
  for (const b of buffers) totalLen += b.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of buffers) {
    result.set(b, offset);
    offset += b.length;
  }
  return result;
}

export function decodeCBOR(data: Uint8Array): unknown {
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  function readUint(length: number): number {
    if (length === 0) return view.getUint8(offset++);
    if (length === 1) {
      const val = view.getUint8(offset);
      offset += 1;
      return val;
    }
    if (length === 2) {
      const val = view.getUint16(offset, false);
      offset += 2;
      return val;
    }
    if (length === 4) {
      const val = view.getUint32(offset, false);
      offset += 4;
      return val;
    }
    if (length === 8) {
      const hi = view.getUint32(offset, false);
      const lo = view.getUint32(offset + 4, false);
      offset += 8;
      return hi * 4294967296 + lo;
    }
    throw new Error(`Unsupported uint length: ${length}`);
  }

  function readVal(info: number): number {
    if (info < 24) return info;
    if (info === 24) return readUint(1);
    if (info === 25) return readUint(2);
    if (info === 26) return readUint(4);
    if (info === 27) return readUint(8);
    throw new Error(`Invalid CBOR length info: ${info}`);
  }

  function decodeNext(): unknown {
    if (offset >= data.length) {
      throw new Error('Unexpected end of CBOR stream');
    }

    const header = view.getUint8(offset++);
    const major = header >> 5;
    const info = header & 0x1f;

    if (major === 0) {
      return readVal(info);
    } else if (major === 1) {
      return -1 - readVal(info);
    } else if (major === 2) {
      const len = readVal(info);
      const bytes = data.subarray(offset, offset + len);
      offset += len;
      return bytes;
    } else if (major === 3) {
      const len = readVal(info);
      const bytes = data.subarray(offset, offset + len);
      offset += len;
      return new TextDecoder().decode(bytes);
    } else if (major === 4) {
      const len = readVal(info);
      const arr: unknown[] = [];
      for (let i = 0; i < len; i++) {
        arr.push(decodeNext());
      }
      return arr;
    } else if (major === 5) {
      const len = readVal(info);
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < len; i++) {
        const key = decodeNext() as string;
        const val = decodeNext();
        obj[key] = val;
      }
      return obj;
    } else if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22 || info === 23) return null;
      if (info === 27) {
        const val = view.getFloat64(offset, false);
        offset += 8;
        return val;
      }
      throw new Error(`Unsupported major type 7 info: ${info}`);
    }

    throw new Error(`Unsupported CBOR major type: ${major}`);
  }

  return decodeNext();
}
