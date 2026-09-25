# codemirror6_lockfree_ringbuffer.ts

/**
 * CodeMirror 6 ViewPlugin + Lock-free RingBuffer IPC (SharedArrayBuffer + Atomics)
 * Implements high-performance zero-copy delta streaming to NarrativeNano Wasm SIMD evaluator.
 */

import { ViewPlugin, ViewUpdate, EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
import { z } from "zod";

export const RingBufferLayout = {
  REQ_BUFFER_OFFSET: 65536,
  REQ_BUFFER_SIZE: 4 * 1024 * 1024, // 4MB
  REQ_BUFFER_MASK: (4 * 1024 * 1024) - 1,
  RES_BUFFER_OFFSET: 65 * 65536,
  RES_BUFFER_SIZE: 4 * 1024 * 1024, // 4MB
  RES_BUFFER_MASK: (4 * 1024 * 1024) - 1,
  REQ_WRITE_PTR: 0,
  REQ_READ_PTR: 16,
  RES_WRITE_PTR: 32,
  RES_READ_PTR: 48,
  WORKER_STATE: 64,
  GLOBAL_EPOCH: 80,
  PACKET_DATA: 0x01,
  PACKET_SENTINEL_WRAP: 0xFF
} as const;

export interface NarrativeAlert {
  from: number;
  to: number;
  severity: "fatal" | "warning" | "info";
  message: string;
}

export const setAlertsEffect = StateEffect.define<NarrativeAlert[]>();

export const narrativeAlertField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(underlines, tr) {
    underlines = underlines.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setAlertsEffect)) {
        const builder = new RangeSetBuilder<Decoration>();
        for (const alert of effect.value) {
          const className = alert.severity === "fatal" 
            ? "cm-narrative-error" 
            : "cm-narrative-warning";
          builder.add(
            alert.from,
            alert.to,
            Decoration.mark({ class: className, attributes: { "data-narrative-hint": alert.message } })
          );
        }
        return builder.finish();
      }
    }
    return underlines;
  },
  provide: f => EditorView.decorations.from(f)
});

export class RingBufferProducer {
  private ctrl: Int32Array;
  private ringBytes: Uint8Array;
  private textEncoder = new TextEncoder();

  constructor(private sharedBuffer: SharedArrayBuffer) {
    this.ctrl = new Int32Array(sharedBuffer, 0, 1024);
    this.ringBytes = new Uint8Array(sharedBuffer);
  }

  public enqueueDelta(from: number, to: number, insertedText: string, epoch: number): boolean {
    const textBytes = this.textEncoder.encode(insertedText);
    const packetLength = 16 + textBytes.length;
    const write = Atomics.load(this.ctrl, RingBufferLayout.REQ_WRITE_PTR);
    const read = Atomics.load(this.ctrl, RingBufferLayout.REQ_READ_PTR);

    const capacity = RingBufferLayout.REQ_BUFFER_SIZE;
    if ((write - read) + packetLength > capacity) {
      return false; // Buffer overflow
    }

    const writeOffset = write & RingBufferLayout.REQ_BUFFER_MASK;
    const tailSpace = capacity - writeOffset;

    let targetOffset = writeOffset;
    let actualWrite = write;

    if (tailSpace < packetLength) {
      // Write Sentinel wrap header
      const sentinelTarget = RingBufferLayout.REQ_BUFFER_OFFSET + writeOffset;
      const view = new DataView(this.sharedBuffer, sentinelTarget, 4);
      view.setUint8(0, RingBufferLayout.PACKET_SENTINEL_WRAP);
      actualWrite += tailSpace;
      targetOffset = 0;
    }

    const absoluteOffset = RingBufferLayout.REQ_BUFFER_OFFSET + targetOffset;
    const headerView = new DataView(this.sharedBuffer, absoluteOffset, 16);
    headerView.setUint8(0, RingBufferLayout.PACKET_DATA);
    headerView.setUint8(1, 0); // flags
    headerView.setUint16(2, packetLength, true);
    headerView.setUint32(4, from, true);
    headerView.setUint32(8, to, true);
    headerView.setUint32(12, epoch, true);

    this.ringBytes.set(textBytes, absoluteOffset + 16);

    Atomics.store(this.ctrl, RingBufferLayout.REQ_WRITE_PTR, actualWrite + packetLength);
    Atomics.notify(this.ctrl, RingBufferLayout.REQ_WRITE_PTR);
    return true;
  }
}
