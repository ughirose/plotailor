import type { StateDeltaEvent } from '@schema';

export type EventType =
  | 'create'
  | 'update'
  | 'delete'
  | 'patch'
  | 'node_create'
  | 'edge_connect'
  | 'property_change'
  | 'snapshot'
  | string;

export interface EditEvent<T = unknown> {
  id: string;
  sequence: number;
  timestamp: number;
  authorId: string;
  eventType: EventType;
  payload: T;
  prevHash: string;
  hash: string;
  metadata?: Record<string, unknown>;
  delta?: StateDeltaEvent;
}

export interface MerkleProofNode {
  position: 'left' | 'right';
  hash: string;
}

export interface MerkleProof {
  sequence: number;
  leafHash: string;
  proof: MerkleProofNode[];
  rootHash: string;
}

export interface PoPCertificate {
  version: '1.0.0' | string;
  certificateId: string;
  createdAt: number;
  author: {
    id: string;
    sessionSignature?: string;
  };
  chainSummary: {
    totalEvents: number;
    genesisHash: string;
    latestHash: string;
    merkleRoot: string;
    startTime: number;
    endTime: number;
  };
  timestampAnchor: {
    issuedAt: number;
    anchorType: 'system' | 'crypto_hash' | 'tsa';
    anchorHash: string;
  };
  events?: EditEvent[];
  proofs?: MerkleProof[];
}

export interface AuditLogEntry {
  sequence?: number;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'INFO';
  details: string;
  timestamp: number;
}

export interface TimestampVerificationOptions {
  allowDriftMs?: number;
  maxFutureTimeMs?: number;
}

export interface AuditVerificationResult {
  valid: boolean;
  totalEvents: number;
  genesisHash: string;
  latestHash: string;
  merkleRoot: string;
  failedSequence?: number;
  failureReason?: string;
  timestampChecks: {
    monotonic: boolean;
    driftViolationCount: number;
    anchorValid: boolean;
  };
  auditTimestamp: number;
  logs: AuditLogEntry[];
}

export interface PaneContent {
  id: string;
  title: string;
  type: string;
  data: Record<string, unknown>;
}

export interface ThreePaneView {
  leftPane: PaneContent;   // Navigation & Event Stream / Merkle Tree
  middlePane: PaneContent; // Main Creation Canvas & Process Timeline
  rightPane: PaneContent;  // PoP Certificate Inspector & Verification Status
  activePaneId: string;
  modalCount: number;      // Must always be 0 to comply with constitution
}
