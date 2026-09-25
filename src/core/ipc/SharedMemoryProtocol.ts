/**
 * SPSC (Single Producer Single Consumer) Lock-Free Ring Buffer Protocol
 * Supporting 16MB SharedArrayBuffer, 320B fixed-size packets, 64B cacheline separation,
 * and Atomics-based synchronization.
 */

export const PACKET_SIZE = 320;
export const HEADER_SIZE = 32;
export const MAX_PAYLOAD_SIZE = 287; // 320 - 32 (header) - 1 (sentinel) = 287 bytes
export const SENTINEL_OFFSET = 319;
export const SENTINEL_BYTE = 0xFF;

export const CACHE_LINE_SIZE = 64;
export const CONTROL_HEADER_SIZE = 256; // 4 cache lines
export const DEFAULT_BUFFER_SIZE = 16 * 1024 * 1024; // 16 MB

export const MAGIC_SPSC = 0x53505343; // 'SPSC'
export const PROTOCOL_VERSION = 1;

/**
 * Control Block Layout (Int32Array words, word = byteOffset / 4):
 *
 * Cache Line 0 (Producer Control - Modified exclusively by Producer):
 *   Word 0 (Offset 0):   writeIndex (monotonic uint32 stored as int32)
 *   Word 1 (Offset 4):   producerSeq (last sequence written)
 *   Words 2..15 (Offset 8..63): Padding (56 bytes) to prevent false sharing
 *
 * Cache Line 1 (Consumer Control - Modified exclusively by Consumer):
 *   Word 16 (Offset 64):  readIndex (monotonic uint32 stored as int32)
 *   Word 17 (Offset 68):  consumerSeq (last sequence acknowledged)
 *   Words 18..31 (Offset 72..127): Padding (56 bytes) to prevent false sharing
 *
 * Cache Line 2 (Shared Configuration - Read-only after initialization):
 *   Word 32 (Offset 128): magic (0x53505343)
 *   Word 33 (Offset 132): version (1)
 *   Word 34 (Offset 136): capacity (number of packets, power of 2)
 *   Word 35 (Offset 140): packetSize (320)
 *   Word 36 (Offset 144): dataOffset (256)
 *   Words 37..47 (Offset 148..191): Padding (44 bytes)
 *
 * Cache Line 3 (Alignment Padding):
 *   Words 48..63 (Offset 192..255): Padding to align data buffer at 256 (64B aligned)
 */
export const PRODUCER_WRITE_IDX = 0;       // Byte offset 0
export const PRODUCER_SEQ_IDX = 1;         // Byte offset 4

export const CONSUMER_READ_IDX = 16;       // Byte offset 64
export const CONSUMER_SEQ_IDX = 17;        // Byte offset 68

export const CONFIG_MAGIC_IDX = 32;        // Byte offset 128
export const CONFIG_VERSION_IDX = 33;      // Byte offset 132
export const CONFIG_CAPACITY_IDX = 34;     // Byte offset 136
export const CONFIG_PACKET_SIZE_IDX = 35;  // Byte offset 140
export const CONFIG_DATA_OFFSET_IDX = 36;  // Byte offset 144

export interface PacketHeader {
  sequenceNumber: number;
  payloadLength: number;
  timestamp: number;
  flags: number;
}

export interface Packet {
  header: PacketHeader;
  payload: Uint8Array;
}

export interface SharedMemoryConfig {
  bufferSize?: number;
  packetSize?: number;
}

/**
 * Calculates the largest power-of-two capacity fitting within the buffer.
 */
export function calculateCapacity(
  byteLength: number,
  dataOffset: number = CONTROL_HEADER_SIZE,
  packetSize: number = PACKET_SIZE
): number {
  const availableBytes = byteLength - dataOffset;
  if (availableBytes < packetSize) {
    throw new Error(`Buffer size (${byteLength} bytes) is too small for ring buffer`);
  }
  const maxPackets = Math.floor(availableBytes / packetSize);
  let cap = 1;
  while ((cap << 1) <= maxPackets) {
    cap <<= 1;
  }
  return cap;
}

/**
 * SharedMemoryProtocol manages initialization and layout validation of the SharedArrayBuffer.
 */
export class SharedMemoryProtocol {
  /**
   * Allocates and initializes a new 16MB (or custom size) SharedArrayBuffer.
   */
  static create(byteLength: number = DEFAULT_BUFFER_SIZE): SharedArrayBuffer {
    const sab = new SharedArrayBuffer(byteLength);
    this.init(sab);
    return sab;
  }

  /**
   * Initializes the control block in an existing SharedArrayBuffer.
   */
  static init(sab: SharedArrayBuffer, packetSize: number = PACKET_SIZE): void {
    if (sab.byteLength < CONTROL_HEADER_SIZE + packetSize) {
      throw new Error(`SharedArrayBuffer is too small (${sab.byteLength} bytes)`);
    }

    const ctrl = new Int32Array(sab, 0, CONTROL_HEADER_SIZE / 4);
    const capacity = calculateCapacity(sab.byteLength, CONTROL_HEADER_SIZE, packetSize);

    // Initialize Producer control line
    Atomics.store(ctrl, PRODUCER_WRITE_IDX, 0);
    Atomics.store(ctrl, PRODUCER_SEQ_IDX, 0);

    // Initialize Consumer control line
    Atomics.store(ctrl, CONSUMER_READ_IDX, 0);
    Atomics.store(ctrl, CONSUMER_SEQ_IDX, 0);

    // Initialize Config line
    Atomics.store(ctrl, CONFIG_MAGIC_IDX, MAGIC_SPSC);
    Atomics.store(ctrl, CONFIG_VERSION_IDX, PROTOCOL_VERSION);
    Atomics.store(ctrl, CONFIG_CAPACITY_IDX, capacity);
    Atomics.store(ctrl, CONFIG_PACKET_SIZE_IDX, packetSize);
    Atomics.store(ctrl, CONFIG_DATA_OFFSET_IDX, CONTROL_HEADER_SIZE);
  }

  /**
   * Validates that the buffer contains a compatible SPSC Ring Buffer header.
   */
  static validate(sab: SharedArrayBuffer): { capacity: number; packetSize: number; dataOffset: number } {
    if (sab.byteLength < CONTROL_HEADER_SIZE) {
      throw new Error(`Invalid buffer: byteLength (${sab.byteLength}) < CONTROL_HEADER_SIZE`);
    }
    const ctrl = new Int32Array(sab, 0, CONTROL_HEADER_SIZE / 4);
    const magic = Atomics.load(ctrl, CONFIG_MAGIC_IDX);
    if (magic !== MAGIC_SPSC) {
      throw new Error(`Invalid SPSC magic: 0x${magic.toString(16)} (expected 0x${MAGIC_SPSC.toString(16)})`);
    }
    const version = Atomics.load(ctrl, CONFIG_VERSION_IDX);
    if (version !== PROTOCOL_VERSION) {
      throw new Error(`Unsupported protocol version: ${version} (expected ${PROTOCOL_VERSION})`);
    }
    const capacity = Atomics.load(ctrl, CONFIG_CAPACITY_IDX);
    const packetSize = Atomics.load(ctrl, CONFIG_PACKET_SIZE_IDX);
    const dataOffset = Atomics.load(ctrl, CONFIG_DATA_OFFSET_IDX);

    return { capacity, packetSize, dataOffset };
  }
}

/**
 * Single Producer for SPSC Ring Buffer.
 */
export class SharedMemoryProducer {
  private readonly ctrl: Int32Array;
  private readonly dataView: DataView;
  private readonly uint8View: Uint8Array;
  readonly capacity: number;
  readonly capacityMask: number;
  readonly packetSize: number;
  readonly dataOffset: number;

  private cachedReadIndex: number = 0;
  private localSeq: number = 0;

  constructor(sab: SharedArrayBuffer) {
    const meta = SharedMemoryProtocol.validate(sab);
    this.capacity = meta.capacity;
    this.capacityMask = meta.capacity - 1;
    this.packetSize = meta.packetSize;
    this.dataOffset = meta.dataOffset;

    this.ctrl = new Int32Array(sab, 0, CONTROL_HEADER_SIZE / 4);
    this.dataView = new DataView(sab);
    this.uint8View = new Uint8Array(sab);

    // Initial cache sync
    this.cachedReadIndex = Atomics.load(this.ctrl, CONSUMER_READ_IDX);
    this.localSeq = Atomics.load(this.ctrl, PRODUCER_SEQ_IDX);
  }

  /**
   * Non-blocking push of a 320B packet.
   * Returns true on success, false if the ring buffer is full.
   */
  tryPush(payload: Uint8Array, flags: number = 0, sequenceNumber?: number): boolean {
    if (payload.byteLength > MAX_PAYLOAD_SIZE) {
      throw new Error(
        `Payload size (${payload.byteLength}B) exceeds MAX_PAYLOAD_SIZE (${MAX_PAYLOAD_SIZE}B)`
      );
    }

    const writeIndex = Atomics.load(this.ctrl, PRODUCER_WRITE_IDX);

    // Check available space with cached read index first (optimistic path)
    let occupied = (writeIndex - this.cachedReadIndex) >>> 0;
    if (occupied >= this.capacity) {
      // Refresh cached read index
      this.cachedReadIndex = Atomics.load(this.ctrl, CONSUMER_READ_IDX);
      occupied = (writeIndex - this.cachedReadIndex) >>> 0;
      if (occupied >= this.capacity) {
        return false; // Queue is full
      }
    }

    const seq = sequenceNumber !== undefined ? sequenceNumber : this.localSeq++;
    const slot = writeIndex & this.capacityMask;
    const slotByteOffset = this.dataOffset + slot * this.packetSize;

    // Write Header (32 bytes):
    // 0..3: sequenceNumber
    this.dataView.setUint32(slotByteOffset + 0, seq, true);
    // 4..7: payloadLength
    this.dataView.setUint32(slotByteOffset + 4, payload.byteLength, true);
    // 8..15: timestamp (high precision ms)
    this.dataView.setFloat64(slotByteOffset + 8, performance.now(), true);
    // 16..19: flags
    this.dataView.setUint32(slotByteOffset + 16, flags, true);
    // 20..23: reserved
    this.dataView.setUint32(slotByteOffset + 20, 0, true);
    // 24..31: reserved
    this.dataView.setBigUint64(slotByteOffset + 24, 0n, true);

    // Write Body:
    this.uint8View.set(payload, slotByteOffset + HEADER_SIZE);

    // Write Sentinel Byte at 319:
    this.uint8View[slotByteOffset + SENTINEL_OFFSET] = SENTINEL_BYTE;

    // Release fence: Advance write index atomically
    Atomics.store(this.ctrl, PRODUCER_WRITE_IDX, (writeIndex + 1) | 0);
    Atomics.store(this.ctrl, PRODUCER_SEQ_IDX, seq);

    return true;
  }

  /**
   * Blocking push with timeout.
   */
  push(payload: Uint8Array, flags: number = 0, sequenceNumber?: number, timeoutMs: number = 1000): boolean {
    const start = performance.now();
    let spinCount = 0;

    while (true) {
      if (this.tryPush(payload, flags, sequenceNumber)) {
        // Notify waiting consumer
        Atomics.notify(this.ctrl, PRODUCER_WRITE_IDX, 1);
        return true;
      }

      if (spinCount < 64) {
        spinCount++;
        continue;
      }

      const elapsed = performance.now() - start;
      if (elapsed >= timeoutMs) {
        return false;
      }

      // Wait on consumer readIndex update
      const remaining = Math.max(1, Math.floor(timeoutMs - elapsed));
      try {
        Atomics.wait(this.ctrl, CONSUMER_READ_IDX, this.cachedReadIndex, remaining);
      } catch {
        // In environments where Atomics.wait is prohibited, spin/fallback
      }
    }
  }

  getWriteIndex(): number {
    return Atomics.load(this.ctrl, PRODUCER_WRITE_IDX) >>> 0;
  }

  getAvailableSlots(): number {
    const writeIndex = Atomics.load(this.ctrl, PRODUCER_WRITE_IDX);
    const readIndex = Atomics.load(this.ctrl, CONSUMER_READ_IDX);
    const occupied = (writeIndex - readIndex) >>> 0;
    return this.capacity - occupied;
  }

  isFull(): boolean {
    return this.getAvailableSlots() === 0;
  }
}

/**
 * Single Consumer for SPSC Ring Buffer.
 */
export class SharedMemoryConsumer {
  private readonly ctrl: Int32Array;
  private readonly dataView: DataView;
  private readonly uint8View: Uint8Array;
  readonly capacity: number;
  readonly capacityMask: number;
  readonly packetSize: number;
  readonly dataOffset: number;

  private cachedWriteIndex: number = 0;

  constructor(sab: SharedArrayBuffer) {
    const meta = SharedMemoryProtocol.validate(sab);
    this.capacity = meta.capacity;
    this.capacityMask = meta.capacity - 1;
    this.packetSize = meta.packetSize;
    this.dataOffset = meta.dataOffset;

    this.ctrl = new Int32Array(sab, 0, CONTROL_HEADER_SIZE / 4);
    this.dataView = new DataView(sab);
    this.uint8View = new Uint8Array(sab);

    // Initial cache sync
    this.cachedWriteIndex = Atomics.load(this.ctrl, PRODUCER_WRITE_IDX);
  }

  /**
   * Non-blocking pop of a 320B packet.
   * Returns packet on success, or null if the ring buffer is empty.
   */
  tryPop(): Packet | null {
    const readIndex = Atomics.load(this.ctrl, CONSUMER_READ_IDX);

    // Check available packets with cached write index first
    let available = (this.cachedWriteIndex - readIndex) >>> 0;
    if (available === 0) {
      // Refresh cached write index
      this.cachedWriteIndex = Atomics.load(this.ctrl, PRODUCER_WRITE_IDX);
      available = (this.cachedWriteIndex - readIndex) >>> 0;
      if (available === 0) {
        return null; // Queue is empty
      }
    }

    const slot = readIndex & this.capacityMask;
    const slotByteOffset = this.dataOffset + slot * this.packetSize;

    // Verify Sentinel Byte at 319:
    const sentinel = this.uint8View[slotByteOffset + SENTINEL_OFFSET];
    if (sentinel !== SENTINEL_BYTE) {
      throw new Error(
        `Corrupted packet at slot ${slot}: sentinel byte 0x${sentinel.toString(16)} !== 0x${SENTINEL_BYTE.toString(16)}`
      );
    }

    // Read Header (32 bytes):
    const sequenceNumber = this.dataView.getUint32(slotByteOffset + 0, true);
    const payloadLength = this.dataView.getUint32(slotByteOffset + 4, true);
    const timestamp = this.dataView.getFloat64(slotByteOffset + 8, true);
    const flags = this.dataView.getUint32(slotByteOffset + 16, true);

    if (payloadLength > MAX_PAYLOAD_SIZE) {
      throw new Error(
        `Invalid payload length ${payloadLength} exceeds MAX_PAYLOAD_SIZE (${MAX_PAYLOAD_SIZE})`
      );
    }

    // Read Body:
    const payload = this.uint8View.slice(
      slotByteOffset + HEADER_SIZE,
      slotByteOffset + HEADER_SIZE + payloadLength
    );

    // Clear sentinel byte to guard against unwritten reuse
    this.uint8View[slotByteOffset + SENTINEL_OFFSET] = 0;

    // Release fence: Advance read index atomically
    Atomics.store(this.ctrl, CONSUMER_READ_IDX, (readIndex + 1) | 0);
    Atomics.store(this.ctrl, CONSUMER_SEQ_IDX, sequenceNumber);

    return {
      header: {
        sequenceNumber,
        payloadLength,
        timestamp,
        flags,
      },
      payload,
    };
  }

  /**
   * Blocking pop with timeout.
   */
  pop(timeoutMs: number = 1000): Packet | null {
    const start = performance.now();
    let spinCount = 0;

    while (true) {
      const pkt = this.tryPop();
      if (pkt !== null) {
        // Notify waiting producer
        Atomics.notify(this.ctrl, CONSUMER_READ_IDX, 1);
        return pkt;
      }

      if (spinCount < 64) {
        spinCount++;
        continue;
      }

      const elapsed = performance.now() - start;
      if (elapsed >= timeoutMs) {
        return null;
      }

      const remaining = Math.max(1, Math.floor(timeoutMs - elapsed));
      try {
        Atomics.wait(this.ctrl, PRODUCER_WRITE_IDX, this.cachedWriteIndex, remaining);
      } catch {
        // In environments where Atomics.wait is prohibited, spin/fallback
      }
    }
  }

  getReadIndex(): number {
    return Atomics.load(this.ctrl, CONSUMER_READ_IDX) >>> 0;
  }

  getAvailableCount(): number {
    const writeIndex = Atomics.load(this.ctrl, PRODUCER_WRITE_IDX);
    const readIndex = Atomics.load(this.ctrl, CONSUMER_READ_IDX);
    return (writeIndex - readIndex) >>> 0;
  }

  isEmpty(): boolean {
    return this.getAvailableCount() === 0;
  }
}

/**
 * SPSCRingBuffer bundle for convenience.
 */
export class SPSCRingBuffer {
  readonly sab: SharedArrayBuffer;
  readonly producer: SharedMemoryProducer;
  readonly consumer: SharedMemoryConsumer;

  constructor(sab?: SharedArrayBuffer) {
    if (!sab) {
      sab = SharedMemoryProtocol.create(DEFAULT_BUFFER_SIZE);
    }
    this.sab = sab;
    this.producer = new SharedMemoryProducer(sab);
    this.consumer = new SharedMemoryConsumer(sab);
  }
}
