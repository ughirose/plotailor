import type {
  EditEvent,
  EventType,
  MerkleProof,
  MerkleProofNode,
} from './types.js';

export const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * Deterministic JSON stringification for consistent hash calculation across platforms.
 */
export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalize(item)).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys
    .filter((k) => (obj as Record<string, unknown>)[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + canonicalize((obj as Record<string, unknown>)[k]));
  return '{' + pairs.join(',') + '}';
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * Computes standard NIST SHA-256 hex string universally across Browser, Worker, and Node.
 */
export function sha256(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
  let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;

  const bitLen = bytes.length * 8;
  const newLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(newLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(newLen - 4, bitLen >>> 0);
  view.setUint32(newLen - 8, Math.floor(bitLen / 0x100000000));

  const W = new Uint32Array(64);

  for (let i = 0; i < newLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(i + t * 4);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^ ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^ (W[t - 15] >>> 3);
      const s1 = ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^ ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }

    let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;

    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[t] + W[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H0 = (H0 + a) | 0;
    H1 = (H1 + b) | 0;
    H2 = (H2 + c) | 0;
    H3 = (H3 + d) | 0;
    H4 = (H4 + e) | 0;
    H5 = (H5 + f) | 0;
    H6 = (H6 + g) | 0;
    H7 = (H7 + h) | 0;
  }

  const out = [H0, H1, H2, H3, H4, H5, H6, H7];
  return out.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

/**
 * MerkleHashChain maintains an irreversible append-only stream of edit events
 * paired with a Merkle Tree structure for cryptographic process verification.
 */
export class MerkleHashChain {
  private events: EditEvent[] = [];
  private treeLayers: string[][] = [];
  private dirtyTree: boolean = true;

  /**
   * Computes leaf hash for an edit event data structure.
   */
  static computeLeafHash(
    id: string,
    sequence: number,
    timestamp: number,
    authorId: string,
    eventType: EventType,
    payload: unknown,
    prevHash: string,
    delta?: unknown,
    metadata?: Record<string, unknown>
  ): string {
    const canonicalPayload = canonicalize({
      id,
      sequence,
      timestamp,
      authorId,
      eventType,
      payload,
      prevHash,
      delta,
      metadata,
    });
    return sha256(canonicalPayload);
  }

  /**
   * Appends an event to the irreversible stream.
   */
  appendEvent<T = unknown>(input: {
    id: string;
    timestamp?: number;
    authorId: string;
    eventType: EventType;
    payload: T;
    delta?: any;
    metadata?: Record<string, unknown>;
  }): EditEvent<T> {
    const sequence = this.events.length;
    const timestamp = input.timestamp ?? Date.now();
    const prevHash = sequence === 0 ? GENESIS_PREV_HASH : this.events[sequence - 1].hash;

    const hash = MerkleHashChain.computeLeafHash(
      input.id,
      sequence,
      timestamp,
      input.authorId,
      input.eventType,
      input.payload,
      prevHash,
      input.delta,
      input.metadata
    );

    const event: EditEvent<T> = {
      id: input.id,
      sequence,
      timestamp,
      authorId: input.authorId,
      eventType: input.eventType,
      payload: input.payload,
      prevHash,
      hash,
      delta: input.delta,
      metadata: input.metadata,
    };

    this.events.push(event as EditEvent<unknown>);
    this.dirtyTree = true;
    return event;
  }

  /**
   * Gets all events in the chain.
   */
  getEvents(): readonly EditEvent[] {
    return this.events;
  }

  /**
   * Gets total number of events.
   */
  get length(): number {
    return this.events.length;
  }

  /**
   * Gets the event at sequence number.
   */
  getEvent(sequence: number): EditEvent | undefined {
    return this.events[sequence];
  }

  /**
   * Gets genesis event hash or GENESIS_PREV_HASH if empty.
   */
  getGenesisHash(): string {
    return this.events.length > 0 ? this.events[0].hash : GENESIS_PREV_HASH;
  }

  /**
   * Gets latest event hash or GENESIS_PREV_HASH if empty.
   */
  getLatestHash(): string {
    return this.events.length > 0 ? this.events[this.events.length - 1].hash : GENESIS_PREV_HASH;
  }

  /**
   * Recalculates Merkle Tree layers from leaf hashes.
   */
  rebuildMerkleTree(): string[][] {
    if (this.events.length === 0) {
      this.treeLayers = [[GENESIS_PREV_HASH]];
      this.dirtyTree = false;
      return this.treeLayers;
    }

    const leaves = this.events.map((e) => e.hash);
    const layers: string[][] = [leaves];

    let currentLayer = leaves;
    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          const combined = currentLayer[i] + currentLayer[i + 1];
          nextLayer.push(sha256(combined));
        } else {
          // Odd element: duplicate and combine
          const combined = currentLayer[i] + currentLayer[i];
          nextLayer.push(sha256(combined));
        }
      }
      layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    this.treeLayers = layers;
    this.dirtyTree = false;
    return this.treeLayers;
  }

  /**
   * Gets current Merkle Root hash.
   */
  getMerkleRoot(): string {
    if (this.dirtyTree) {
      this.rebuildMerkleTree();
    }
    const topLayer = this.treeLayers[this.treeLayers.length - 1];
    return topLayer ? topLayer[0] : GENESIS_PREV_HASH;
  }

  /**
   * Generates Merkle inclusion proof for sequence index.
   */
  getInclusionProof(sequence: number): MerkleProof {
    if (sequence < 0 || sequence >= this.events.length) {
      throw new Error(`Sequence ${sequence} out of bounds (0..${this.events.length - 1})`);
    }

    if (this.dirtyTree) {
      this.rebuildMerkleTree();
    }

    const leafHash = this.events[sequence].hash;
    const proofNodes: MerkleProofNode[] = [];
    let idx = sequence;

    for (let layerIdx = 0; layerIdx < this.treeLayers.length - 1; layerIdx++) {
      const layer = this.treeLayers[layerIdx];
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;

      let siblingHash: string;
      if (siblingIdx < layer.length) {
        siblingHash = layer[siblingIdx];
      } else {
        siblingHash = layer[idx]; // Duplicate when odd
      }

      proofNodes.push({
        position: isRight ? 'left' : 'right',
        hash: siblingHash,
      });

      idx = Math.floor(idx / 2);
    }

    return {
      sequence,
      leafHash,
      proof: proofNodes,
      rootHash: this.getMerkleRoot(),
    };
  }

  /**
   * Cryptographically verifies a Merkle inclusion proof.
   */
  static verifyInclusionProof(proof: MerkleProof): boolean {
    let currentHash = proof.leafHash;
    for (const node of proof.proof) {
      if (node.position === 'right') {
        currentHash = sha256(currentHash + node.hash);
      } else {
        currentHash = sha256(node.hash + currentHash);
      }
    }
    return currentHash === proof.rootHash;
  }
}
