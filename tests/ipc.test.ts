import { describe, it, expect } from 'vitest';
import {
  SharedMemoryProtocol,
  SharedMemoryProducer,
  SharedMemoryConsumer,
  SPSCRingBuffer,
  PACKET_SIZE,
  MAX_PAYLOAD_SIZE,
  SENTINEL_BYTE,
  SENTINEL_OFFSET,
  PRODUCER_WRITE_IDX,
  CONSUMER_READ_IDX,
  DEFAULT_BUFFER_SIZE,
} from '../src/core/ipc/SharedMemoryProtocol.js';

describe('SPSC Lock-free SharedMemoryProtocol', () => {
  it('should initialize 16MB buffer with 64B cache line separation', () => {
    const sab = SharedMemoryProtocol.create(DEFAULT_BUFFER_SIZE);
    expect(sab.byteLength).toBe(16 * 1024 * 1024);

    const meta = SharedMemoryProtocol.validate(sab);
    expect(meta.capacity).toBe(32768); // 2^15
    expect(meta.packetSize).toBe(PACKET_SIZE);
    expect(meta.dataOffset).toBe(256); // 4 cache lines = 256 bytes

    // Verify cache line separation:
    // Producer write index is at byte offset 0
    // Consumer read index is at byte offset 64 (16 * 4)
    // Distance is 64 bytes (exact 1 cache line separation to prevent false sharing)
    const producerByteOffset = PRODUCER_WRITE_IDX * 4;
    const consumerByteOffset = CONSUMER_READ_IDX * 4;
    expect(consumerByteOffset - producerByteOffset).toBe(64);
  });

  it('should verify 320B packet structure, header, body and 0xFF sentinel byte', () => {
    const ring = new SPSCRingBuffer();
    const payload = new Uint8Array([1, 2, 3, 4, 5]);

    const pushed = ring.producer.tryPush(payload, 0x42, 100);
    expect(pushed).toBe(true);

    const rawBuffer = new Uint8Array(ring.sab);
    const firstSlotOffset = 256;

    // Check sentinel byte at offset 319
    expect(rawBuffer[firstSlotOffset + SENTINEL_OFFSET]).toBe(SENTINEL_BYTE);

    const packet = ring.consumer.tryPop();
    expect(packet).not.toBeNull();
    expect(packet!.header.sequenceNumber).toBe(100);
    expect(packet!.header.payloadLength).toBe(5);
    expect(packet!.header.flags).toBe(0x42);
    expect(Array.from(packet!.payload)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should execute 10,000 packets continuous send/receive test with 0 loss and latency < 10us', () => {
    const TOTAL_PACKETS = 10_000;
    const sab = SharedMemoryProtocol.create(DEFAULT_BUFFER_SIZE);
    const producer = new SharedMemoryProducer(sab);
    const consumer = new SharedMemoryConsumer(sab);

    let packetsLost = 0;
    let totalLatencyUs = 0;
    let minLatencyUs = Infinity;
    let maxLatencyUs = 0;

    const latencies: number[] = new Array(TOTAL_PACKETS);

    const testPayload = new Uint8Array(128);
    for (let j = 0; j < 128; j++) {
      testPayload[j] = (j * 7) & 0xff;
    }

    for (let seq = 0; seq < TOTAL_PACKETS; seq++) {
      // Modify first 4 bytes of payload to encode sequence for integrity check
      testPayload[0] = seq & 0xff;
      testPayload[1] = (seq >> 8) & 0xff;
      testPayload[2] = (seq >> 16) & 0xff;
      testPayload[3] = (seq >> 24) & 0xff;

      const pushed = producer.tryPush(testPayload, 0, seq);
      if (!pushed) {
        packetsLost++;
        continue;
      }

      const received = consumer.tryPop();
      if (!received) {
        packetsLost++;
        continue;
      }

      const now = performance.now();
      const latencyUs = (now - received.header.timestamp) * 1000;
      latencies[seq] = latencyUs;
      totalLatencyUs += latencyUs;

      if (latencyUs < minLatencyUs) minLatencyUs = latencyUs;
      if (latencyUs > maxLatencyUs) maxLatencyUs = latencyUs;

      // Verify sequence & payload integrity
      if (received.header.sequenceNumber !== seq) {
        packetsLost++;
      }
      if (
        received.payload[0] !== testPayload[0] ||
        received.payload[1] !== testPayload[1] ||
        received.payload[2] !== testPayload[2] ||
        received.payload[3] !== testPayload[3]
      ) {
        packetsLost++;
      }
    }

    const avgLatencyUs = totalLatencyUs / TOTAL_PACKETS;

    console.log(`[IPC Benchmark] Total Packets: ${TOTAL_PACKETS}`);
    console.log(`[IPC Benchmark] Packet Loss: ${packetsLost}`);
    console.log(`[IPC Benchmark] Avg Latency: ${avgLatencyUs.toFixed(3)} μs`);
    console.log(`[IPC Benchmark] Min Latency: ${minLatencyUs.toFixed(3)} μs`);
    console.log(`[IPC Benchmark] Max Latency: ${maxLatencyUs.toFixed(3)} μs`);

    expect(packetsLost).toBe(0);
    expect(avgLatencyUs).toBeLessThan(10); // Average latency < 10μs requirement
  });

  it('should handle batch pipelining of 10,000 packets with 0 loss', () => {
    const TOTAL_PACKETS = 10_000;
    const BATCH_SIZE = 64;
    const sab = SharedMemoryProtocol.create(DEFAULT_BUFFER_SIZE);
    const producer = new SharedMemoryProducer(sab);
    const consumer = new SharedMemoryConsumer(sab);

    let sent = 0;
    let receivedCount = 0;
    let packetsLost = 0;

    const samplePayload = new Uint8Array(256);
    samplePayload.fill(0xaa);

    while (receivedCount < TOTAL_PACKETS) {
      // Send batch
      const toSend = Math.min(BATCH_SIZE, TOTAL_PACKETS - sent);
      for (let i = 0; i < toSend; i++) {
        const ok = producer.tryPush(samplePayload, 0, sent);
        if (ok) {
          sent++;
        }
      }

      // Receive batch
      while (true) {
        const pkt = consumer.tryPop();
        if (!pkt) break;
        if (pkt.header.sequenceNumber !== receivedCount) {
          packetsLost++;
        }
        receivedCount++;
      }
    }

    expect(receivedCount).toBe(TOTAL_PACKETS);
    expect(packetsLost).toBe(0);
  });
});
