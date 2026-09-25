/**
 * Write-Ahead Logging (WAL) Implementation
 *
 * Binary Layout:
 * WAL File Header (4 bytes):
 * - Magic: "WAL1" (0x57, 0x41, 0x4C, 0x31)
 *
 * Record Header (20 bytes):
 * - OpType: uint8 (1 byte): 1=BEGIN, 2=WRITE, 3=COMMIT, 4=ABORT
 * - Reserved: uint8 (1 byte)
 * - RecordLength: uint16 (2 bytes)
 * - TxnId: uint32 (4 bytes)
 * - TargetOffset: uint32 (4 bytes)
 * - PayloadLength: uint32 (4 bytes)
 * - Checksum: uint32 (4 bytes, CRC32 of payload)
 *
 * Record Body:
 * - Payload: Uint8Array (PayloadLength bytes)
 */

import { OPFSStorage, SyncAccessHandle } from './OPFSStorage.js';

export enum WALOpType {
  BEGIN = 1,
  WRITE = 2,
  COMMIT = 3,
  ABORT = 4,
}

export interface WALRecord {
  opType: WALOpType;
  txnId: number;
  targetOffset: number;
  payloadLength: number;
  checksum: number;
  payload: Uint8Array;
  isValidChecksum: boolean;
}

export const WAL_MAGIC = new Uint8Array([0x57, 0x41, 0x4c, 0x31]); // "WAL1"
export const RECORD_HEADER_SIZE = 20;

export function computeCRC32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export class WriteAheadLog {
  private storage: OPFSStorage;
  private walPath: string;
  private currentTxnId: number = 0;

  constructor(storage: OPFSStorage, walPath: string = 'app.wal') {
    this.storage = storage;
    this.walPath = walPath;
    this.ensureHeader();
  }

  private ensureHeader(): void {
    const handle = this.storage.getOrCreateHandle(this.walPath);
    if (handle.getSize() === 0) {
      handle.write(WAL_MAGIC, { at: 0 });
      handle.flush();
    }
  }

  beginTransaction(): number {
    this.currentTxnId++;
    const txnId = this.currentTxnId;
    this.appendRecord(WALOpType.BEGIN, txnId, 0, new Uint8Array(0));
    return txnId;
  }

  logWrite(txnId: number, targetOffset: number, data: Uint8Array): void {
    this.appendRecord(WALOpType.WRITE, txnId, targetOffset, data);
  }

  commitTransaction(txnId: number): void {
    this.appendRecord(WALOpType.COMMIT, txnId, 0, new Uint8Array(0));
    this.flush();
  }

  abortTransaction(txnId: number): void {
    this.appendRecord(WALOpType.ABORT, txnId, 0, new Uint8Array(0));
    this.flush();
  }

  private appendRecord(
    opType: WALOpType,
    txnId: number,
    targetOffset: number,
    payload: Uint8Array
  ): void {
    const handle = this.storage.getOrCreateHandle(this.walPath);
    const writePos = handle.getSize();

    const recordLength = RECORD_HEADER_SIZE + payload.byteLength;
    const recordBuf = new Uint8Array(recordLength);
    const view = new DataView(recordBuf.buffer);

    const checksum = computeCRC32(payload);

    // OpType
    recordBuf[0] = opType;
    // Reserved
    recordBuf[1] = 0;
    // RecordLength
    view.setUint16(2, recordLength, true);
    // TxnId
    view.setUint32(4, txnId, true);
    // TargetOffset
    view.setUint32(8, targetOffset, true);
    // PayloadLength
    view.setUint32(12, payload.byteLength, true);
    // Checksum
    view.setUint32(16, checksum, true);

    // Payload
    if (payload.byteLength > 0) {
      recordBuf.set(payload, RECORD_HEADER_SIZE);
    }

    handle.write(recordBuf, { at: writePos });
  }

  flush(): void {
    const handle = this.storage.getOrCreateHandle(this.walPath);
    handle.flush();
  }

  readAllRecords(): WALRecord[] {
    const handle = this.storage.getOrCreateHandle(this.walPath);
    const size = handle.getSize();
    if (size < 4) return [];

    const magicBuf = new Uint8Array(4);
    handle.read(magicBuf, { at: 0 });
    if (
      magicBuf[0] !== WAL_MAGIC[0] ||
      magicBuf[1] !== WAL_MAGIC[1] ||
      magicBuf[2] !== WAL_MAGIC[2] ||
      magicBuf[3] !== WAL_MAGIC[3]
    ) {
      throw new Error('Invalid WAL magic header');
    }

    const records: WALRecord[] = [];
    let pos = 4;

    while (pos + RECORD_HEADER_SIZE <= size) {
      const headerBuf = new Uint8Array(RECORD_HEADER_SIZE);
      const readHeaderBytes = handle.read(headerBuf, { at: pos });
      if (readHeaderBytes < RECORD_HEADER_SIZE) break;

      const view = new DataView(headerBuf.buffer);
      const opType = headerBuf[0] as WALOpType;
      const recordLength = view.getUint16(2, true);
      const txnId = view.getUint32(4, true);
      const targetOffset = view.getUint32(8, true);
      const payloadLength = view.getUint32(12, true);
      const checksum = view.getUint32(16, true);

      if (pos + RECORD_HEADER_SIZE + payloadLength > size) {
        // Incomplete / truncated record detected at tail
        break;
      }

      const payload = new Uint8Array(payloadLength);
      if (payloadLength > 0) {
        handle.read(payload, { at: pos + RECORD_HEADER_SIZE });
      }

      const actualChecksum = computeCRC32(payload);
      const isValidChecksum = checksum === actualChecksum;

      records.push({
        opType,
        txnId,
        targetOffset,
        payloadLength,
        checksum,
        payload,
        isValidChecksum,
      });

      pos += RECORD_HEADER_SIZE + payloadLength;
    }

    return records;
  }

  clear(): void {
    const handle = this.storage.getOrCreateHandle(this.walPath);
    handle.truncate(0);
    handle.write(WAL_MAGIC, { at: 0 });
    handle.flush();
    this.currentTxnId = 0;
  }
}
