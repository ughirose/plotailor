import { createHash } from 'crypto';
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

/**
 * Computes SHA-256 hex string for input data.
 */
export function sha256(data: string | Uint8Array): string {
  const hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
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
