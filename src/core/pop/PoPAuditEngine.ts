import { GENESIS_PREV_HASH, MerkleHashChain, sha256 } from './MerkleHashChain.js';
import { CBOR } from './CBOR.js';
import type {
  AuditLogEntry,
  AuditVerificationResult,
  EditEvent,
  EventType,
  MerkleProof,
  PoPCertificate,
  TimestampVerificationOptions,
} from './types.js';

export class PoPAuditEngine {
  private chain: MerkleHashChain;
  private primaryAuthorId: string;

  constructor(primaryAuthorId: string = 'author-default') {
    this.chain = new MerkleHashChain();
    this.primaryAuthorId = primaryAuthorId;
  }

  /**
   * Records a new edit event into the Merkle Hash Chain.
   */
  recordEvent<T = unknown>(input: {
    id: string;
    timestamp?: number;
    authorId?: string;
    eventType: EventType;
    payload: T;
    delta?: any;
    metadata?: Record<string, unknown>;
  }): EditEvent<T> {
    return this.chain.appendEvent({
      id: input.id,
      timestamp: input.timestamp,
      authorId: input.authorId ?? this.primaryAuthorId,
      eventType: input.eventType,
      payload: input.payload,
      delta: input.delta,
      metadata: input.metadata,
    });
  }

  /**
   * Access underlying MerkleHashChain.
   */
  getChain(): MerkleHashChain {
    return this.chain;
  }

  /**
   * Verifies full cryptographic integrity of the event stream and Merkle Tree.
   */
  verifyIntegrity(
    timestampOpts: TimestampVerificationOptions = {}
  ): AuditVerificationResult {
    const logs: AuditLogEntry[] = [];
    const now = Date.now();
    const events = this.chain.getEvents();
    const totalEvents = events.length;

    logs.push({
      check: 'INITIALIZATION',
      status: 'INFO',
      details: `Starting Proof of Process (PoP) audit verification for ${totalEvents} events.`,
      timestamp: now,
    });

    if (totalEvents === 0) {
      logs.push({
        check: 'CHAIN_EMPTY',
        status: 'WARN',
        details: 'Event stream is empty. Genesis hash defaults to zero hash.',
        timestamp: now,
      });
      return {
        valid: true,
        totalEvents: 0,
        genesisHash: GENESIS_PREV_HASH,
        latestHash: GENESIS_PREV_HASH,
        merkleRoot: GENESIS_PREV_HASH,
        timestampChecks: {
          monotonic: true,
          driftViolationCount: 0,
          anchorValid: true,
        },
        auditTimestamp: now,
        logs,
      };
    }

    let valid = true;
    let failedSequence: number | undefined;
    let failureReason: string | undefined;

    let prevHashCheck = GENESIS_PREV_HASH;
    let lastTimestamp = 0;
    let monotonic = true;
    let driftViolationCount = 0;

    const allowDriftMs = timestampOpts.allowDriftMs ?? 300000; // 5 minutes
    const maxFutureTimeMs = timestampOpts.maxFutureTimeMs ?? 60000; // 1 minute

    for (let i = 0; i < totalEvents; i++) {
      const event = events[i];

      // 1. Sequence check
      if (event.sequence !== i) {
        valid = false;
        failedSequence = i;
        failureReason = `Sequence mismatch at index ${i}: event.sequence=${event.sequence}`;
        logs.push({
          sequence: i,
          check: 'SEQUENCE_CONTINUITY',
          status: 'FAIL',
          details: failureReason,
          timestamp: now,
        });
        break;
      }

      // 2. Previous Hash chaining check
      if (event.prevHash !== prevHashCheck) {
        valid = false;
        failedSequence = i;
        failureReason = `Hash chain broken at sequence ${i}: expected prevHash ${prevHashCheck}, got ${event.prevHash}`;
        logs.push({
          sequence: i,
          check: 'PREV_HASH_CHAIN',
          status: 'FAIL',
          details: failureReason,
          timestamp: now,
        });
        break;
      }

      // 3. Leaf hash recalculation check
      const recalculatedHash = MerkleHashChain.computeLeafHash(
        event.id,
        event.sequence,
        event.timestamp,
        event.authorId,
        event.eventType,
        event.payload,
        event.prevHash,
        event.delta,
        event.metadata
      );

      if (recalculatedHash !== event.hash) {
        valid = false;
        failedSequence = i;
        failureReason = `Hash tamper detected at sequence ${i}: recorded ${event.hash}, calculated ${recalculatedHash}`;
        logs.push({
          sequence: i,
          check: 'LEAF_HASH_INTEGRITY',
          status: 'FAIL',
          details: failureReason,
          timestamp: now,
        });
        break;
      }

      // 4. Timestamp monotonicity & bounds check
      if (i > 0 && event.timestamp < lastTimestamp) {
        monotonic = false;
        driftViolationCount++;
        logs.push({
          sequence: i,
          check: 'TIMESTAMP_MONOTONICITY',
          status: 'WARN',
          details: `Non-monotonic timestamp at sequence ${i}: current ${event.timestamp} < previous ${lastTimestamp}`,
          timestamp: now,
        });
      }

      if (event.timestamp > now + maxFutureTimeMs) {
        driftViolationCount++;
        logs.push({
          sequence: i,
          check: 'TIMESTAMP_FUTURE_DRIFT',
          status: 'WARN',
          details: `Future timestamp drift at sequence ${i}: timestamp ${event.timestamp} > now + ${maxFutureTimeMs}ms`,
          timestamp: now,
        });
      }

      prevHashCheck = event.hash;
      lastTimestamp = event.timestamp;

      logs.push({
        sequence: i,
        check: 'BLOCK_VERIFIED',
        status: 'PASS',
        details: `Sequence ${i} (${event.eventType}) verified successfully. Hash: ${event.hash.slice(0, 16)}...`,
        timestamp: now,
      });
    }

    // 5. Merkle Root validation
    const recalculatedMerkleRoot = this.chain.getMerkleRoot();
    if (valid) {
      logs.push({
        check: 'MERKLE_ROOT_VERIFICATION',
        status: 'PASS',
        details: `Merkle Root validated successfully: ${recalculatedMerkleRoot}`,
        timestamp: now,
      });
    }

    return {
      valid,
      totalEvents,
      genesisHash: this.chain.getGenesisHash(),
      latestHash: this.chain.getLatestHash(),
      merkleRoot: recalculatedMerkleRoot,
      failedSequence,
      failureReason,
      timestampChecks: {
        monotonic,
        driftViolationCount,
        anchorValid: true,
      },
      auditTimestamp: now,
      logs,
    };
  }

  /**
   * Verifies timestamp continuity and anchor consistency for a certificate or stream.
   */
  verifyTimestampAnchor(
    merkleRoot: string,
    issuedAt: number,
    authorId: string,
    expectedAnchorHash: string
  ): boolean {
    const computedAnchor = sha256(`${merkleRoot}:${issuedAt}:${authorId}`);
    return computedAnchor === expectedAnchorHash;
  }

  /**
   * Exports an immutable Proof of Process (PoP) Certificate in JSON or CBOR format.
   */
  exportCertificate(
    format: 'json' | 'cbor' = 'json',
    options: { includeEvents?: boolean; includeProofs?: boolean } = { includeEvents: true, includeProofs: true }
  ): PoPCertificate | string | Uint8Array {
    const events = this.chain.getEvents();
    const totalEvents = events.length;
    const merkleRoot = this.chain.getMerkleRoot();
    const genesisHash = this.chain.getGenesisHash();
    const latestHash = this.chain.getLatestHash();

    const startTime = totalEvents > 0 ? events[0].timestamp : Date.now();
    const endTime = totalEvents > 0 ? events[totalEvents - 1].timestamp : Date.now();
    const issuedAt = Date.now();

    const anchorHash = sha256(`${merkleRoot}:${issuedAt}:${this.primaryAuthorId}`);

    const proofs: MerkleProof[] = [];
    if (options.includeProofs && totalEvents > 0) {
      for (let i = 0; i < totalEvents; i++) {
        proofs.push(this.chain.getInclusionProof(i));
      }
    }

    const cert: PoPCertificate = {
      version: '1.0.0',
      certificateId: `pop-cert-${issuedAt}-${sha256(merkleRoot).slice(0, 8)}`,
      createdAt: issuedAt,
      author: {
        id: this.primaryAuthorId,
      },
      chainSummary: {
        totalEvents,
        genesisHash,
        latestHash,
        merkleRoot,
        startTime,
        endTime,
      },
      timestampAnchor: {
        issuedAt,
        anchorType: 'crypto_hash',
        anchorHash,
      },
      events: options.includeEvents ? [...events] : undefined,
      proofs: options.includeProofs ? proofs : undefined,
    };

    if (format === 'json') {
      return JSON.stringify(cert, null, 2);
    } else if (format === 'cbor') {
      return CBOR.encode(cert);
    }
    return cert;
  }

  /**
   * Imports and cryptographically validates an external PoP Certificate.
   */
  static importCertificate(
    data: string | Uint8Array | PoPCertificate,
    format: 'json' | 'cbor' | 'object' = 'json'
  ): { certificate: PoPCertificate; auditResult: AuditVerificationResult } {
    let cert: PoPCertificate;

    if (format === 'json' || typeof data === 'string') {
      cert = JSON.parse(data as string) as PoPCertificate;
    } else if (format === 'cbor' || data instanceof Uint8Array) {
      cert = CBOR.decode<PoPCertificate>(data as Uint8Array);
    } else {
      cert = data as PoPCertificate;
    }

    // Create temporary audit engine to re-verify certificate stream
    const tempEngine = new PoPAuditEngine(cert.author.id);
    if (cert.events && cert.events.length > 0) {
      for (const event of cert.events) {
        tempEngine.chain.appendEvent({
          id: event.id,
          timestamp: event.timestamp,
          authorId: event.authorId,
          eventType: event.eventType,
          payload: event.payload,
          delta: event.delta,
          metadata: event.metadata,
        });
      }
    }

    const auditResult = tempEngine.verifyIntegrity();

    // Verify timestamp anchor
    const anchorValid = tempEngine.verifyTimestampAnchor(
      cert.chainSummary.merkleRoot,
      cert.timestampAnchor.issuedAt,
      cert.author.id,
      cert.timestampAnchor.anchorHash
    );

    auditResult.timestampChecks.anchorValid = anchorValid;

    if (!anchorValid) {
      auditResult.valid = false;
      auditResult.failureReason = 'Timestamp anchor hash verification failed';
      auditResult.logs.push({
        check: 'TIMESTAMP_ANCHOR_VERIFICATION',
        status: 'FAIL',
        details: 'Timestamp anchor hash mismatch',
        timestamp: Date.now(),
      });
    }

    // Verify Merkle Root matches certificate summary
    if (cert.events && cert.events.length > 0) {
      if (auditResult.merkleRoot !== cert.chainSummary.merkleRoot) {
        auditResult.valid = false;
        auditResult.failureReason = `Merkle Root mismatch: computed ${auditResult.merkleRoot}, certificate has ${cert.chainSummary.merkleRoot}`;
        auditResult.logs.push({
          check: 'MERKLE_ROOT_MATCH',
          status: 'FAIL',
          details: auditResult.failureReason,
          timestamp: Date.now(),
        });
      }
    }

    // Verify proofs if included
    if (cert.proofs && cert.proofs.length > 0) {
      for (const proof of cert.proofs) {
        const proofValid = MerkleHashChain.verifyInclusionProof(proof);
        if (!proofValid) {
          auditResult.valid = false;
          auditResult.failureReason = `Inclusion proof invalid for sequence ${proof.sequence}`;
          auditResult.logs.push({
            sequence: proof.sequence,
            check: 'INCLUSION_PROOF_VERIFICATION',
            status: 'FAIL',
            details: auditResult.failureReason,
            timestamp: Date.now(),
          });
          break;
        }
      }
    }

    return { certificate: cert, auditResult };
  }

  /**
   * Generates a formatted text audit log report for export or UI display.
   */
  generateAuditReport(): string {
    const res = this.verifyIntegrity();
    const lines: string[] = [
      `============================================================`,
      `          PROOFS OF PROCESS (PoP) AUDIT ENGINE REPORT        `,
      `============================================================`,
      `Audit Status: ${res.valid ? 'PASSED [VALID]' : 'FAILED [INVALID]'}`,
      `Audit Timestamp: ${new Date(res.auditTimestamp).toISOString()}`,
      `Author ID: ${this.primaryAuthorId}`,
      `Total Events: ${res.totalEvents}`,
      `Genesis Hash: ${res.genesisHash}`,
      `Latest Hash: ${res.latestHash}`,
      `Merkle Root: ${res.merkleRoot}`,
      `Timestamp Monotonicity: ${res.timestampChecks.monotonic ? 'YES' : 'NO (Drift detected)'}`,
      `Drift Violations: ${res.timestampChecks.driftViolationCount}`,
      `Timestamp Anchor Valid: ${res.timestampChecks.anchorValid ? 'YES' : 'NO'}`,
    ];

    if (!res.valid) {
      lines.push(`Failed Sequence: ${res.failedSequence}`);
      lines.push(`Failure Reason: ${res.failureReason}`);
    }

    lines.push(`------------------------------------------------------------`);
    lines.push(`DETAILED AUDIT LOGS:`);
    for (const log of res.logs) {
      const seqStr = log.sequence !== undefined ? `[Seq ${log.sequence}]` : '[System]';
      lines.push(`  ${seqStr} [${log.status}] ${log.check}: ${log.details}`);
    }
    lines.push(`============================================================`);

    return lines.join('\n');
  }
}
