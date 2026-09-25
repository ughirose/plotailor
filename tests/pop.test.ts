import { describe, it, expect } from 'vitest';
import {
  PlotailorIDE,
  MerkleHashChain,
  PoPAuditEngine,
  CBOR,
  GENESIS_PREV_HASH,
  sha256,
} from '../src/index.js';

describe('Creation Process Proof (PoP) Audit Engine', () => {
  describe('CBOR Encoder / Decoder', () => {
    it('should roundtrip primitives, objects, arrays, and binary data', () => {
      const sample = {
        string: 'Hello Plotailor World',
        num: 42,
        negNum: -100,
        float: 3.1415926535,
        boolTrue: true,
        boolFalse: false,
        nullVal: null,
        arr: [1, 'two', { three: 3 }],
        bytes: new Uint8Array([0x01, 0x02, 0xfe, 0xff]),
      };

      const encoded = CBOR.encode(sample);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = CBOR.decode<typeof sample>(encoded);
      expect(decoded.string).toBe(sample.string);
      expect(decoded.num).toBe(sample.num);
      expect(decoded.negNum).toBe(sample.negNum);
      expect(decoded.float).toBeCloseTo(sample.float, 5);
      expect(decoded.boolTrue).toBe(true);
      expect(decoded.boolFalse).toBe(false);
      expect(decoded.nullVal).toBeNull();
      expect(decoded.arr).toEqual(sample.arr);
      expect(Array.from(decoded.bytes)).toEqual(Array.from(sample.bytes));
    });
  });

  describe('MerkleHashChain & Irreversible Stream', () => {
    it('should maintain sequential prevHash chaining and compute Merkle Root', () => {
      const chain = new MerkleHashChain();

      const e0 = chain.appendEvent({
        id: 'evt-0',
        authorId: 'author-1',
        eventType: 'node_create',
        payload: { title: 'Chapter 1' },
      });

      expect(e0.sequence).toBe(0);
      expect(e0.prevHash).toBe(GENESIS_PREV_HASH);
      expect(e0.hash).toHaveLength(64);

      const e1 = chain.appendEvent({
        id: 'evt-1',
        authorId: 'author-1',
        eventType: 'update',
        payload: { content: 'Once upon a time...' },
      });

      expect(e1.sequence).toBe(1);
      expect(e1.prevHash).toBe(e0.hash);
      expect(e1.hash).toHaveLength(64);

      const root = chain.getMerkleRoot();
      expect(root).toHaveLength(64);
    });

    it('should generate and cryptographically verify Merkle inclusion proofs', () => {
      const chain = new MerkleHashChain();

      for (let i = 0; i < 7; i++) {
        chain.appendEvent({
          id: `evt-${i}`,
          authorId: 'author-1',
          eventType: 'patch',
          payload: { index: i },
        });
      }

      for (let seq = 0; seq < 7; seq++) {
        const proof = chain.getInclusionProof(seq);
        expect(proof.sequence).toBe(seq);
        expect(proof.rootHash).toBe(chain.getMerkleRoot());

        const isValid = MerkleHashChain.verifyInclusionProof(proof);
        expect(isValid).toBe(true);
      }
    });

    it('should fail inclusion proof verification if proof node hash is tampered', () => {
      const chain = new MerkleHashChain();
      chain.appendEvent({ id: '1', authorId: 'a', eventType: 'create', payload: {} });
      chain.appendEvent({ id: '2', authorId: 'a', eventType: 'update', payload: {} });

      const proof = chain.getInclusionProof(0);
      proof.proof[0].hash = 'a'.repeat(64); // Tamper proof sibling

      const isValid = MerkleHashChain.verifyInclusionProof(proof);
      expect(isValid).toBe(false);
    });
  });

  describe('PoPAuditEngine Verification & Audit Logs', () => {
    it('should verify clean event stream integrity and generate audit report', () => {
      const engine = new PoPAuditEngine('author-alice');

      engine.recordEvent({
        id: 'e1',
        eventType: 'node_create',
        payload: { name: 'Main Character' },
      });

      engine.recordEvent({
        id: 'e2',
        eventType: 'property_change',
        payload: { age: 25 },
      });

      const res = engine.verifyIntegrity();
      expect(res.valid).toBe(true);
      expect(res.totalEvents).toBe(2);
      expect(res.timestampChecks.monotonic).toBe(true);
      expect(res.logs.length).toBeGreaterThan(0);

      const report = engine.generateAuditReport();
      expect(report).toContain('PASSED [VALID]');
      expect(report).toContain('Author ID: author-alice');
    });

    it('should detect tamper in hash chain and output failed audit log', () => {
      const engine = new PoPAuditEngine('author-bob');

      engine.recordEvent({ id: '1', eventType: 'create', payload: 'Original 1' });
      engine.recordEvent({ id: '2', eventType: 'create', payload: 'Original 2' });

      // Mutate internal chain event directly to simulate tamper
      const events = engine.getChain().getEvents() as any[];
      events[0].payload = 'Tampered Payload';

      const res = engine.verifyIntegrity();
      expect(res.valid).toBe(false);
      expect(res.failedSequence).toBe(0);
      expect(res.failureReason).toContain('Hash tamper detected at sequence 0');

      const report = engine.generateAuditReport();
      expect(report).toContain('FAILED [INVALID]');
      expect(report).toContain('Hash tamper detected');
    });

    it('should perform timestamp monotonicity checks', () => {
      const engine = new PoPAuditEngine('author-carol');
      const baseTime = 1700000000000;

      engine.recordEvent({
        id: 't1',
        timestamp: baseTime,
        eventType: 'create',
        payload: {},
      });

      // Insert older timestamp
      engine.recordEvent({
        id: 't2',
        timestamp: baseTime - 1000,
        eventType: 'update',
        payload: {},
      });

      const res = engine.verifyIntegrity();
      expect(res.timestampChecks.monotonic).toBe(false);
      expect(res.timestampChecks.driftViolationCount).toBe(1);
    });
  });

  describe('PoP Certificate Specification Export/Import (JSON/CBOR)', () => {
    it('should export and import PoP Certificate in JSON format', () => {
      const engine = new PoPAuditEngine('author-dave');

      engine.recordEvent({ id: 'c1', eventType: 'create', payload: { section: 1 } });
      engine.recordEvent({ id: 'c2', eventType: 'update', payload: { section: 2 } });

      const jsonString = engine.exportCertificate('json') as string;
      expect(typeof jsonString).toBe('string');
      expect(jsonString).toContain('pop-cert-');

      const imported = PoPAuditEngine.importCertificate(jsonString, 'json');
      expect(imported.auditResult.valid).toBe(true);
      expect(imported.certificate.author.id).toBe('author-dave');
      expect(imported.certificate.chainSummary.totalEvents).toBe(2);
    });

    it('should export and import PoP Certificate in CBOR format', () => {
      const engine = new PoPAuditEngine('author-eve');

      engine.recordEvent({ id: 'cb1', eventType: 'node_create', payload: { node: 'A' } });
      engine.recordEvent({ id: 'cb2', eventType: 'edge_connect', payload: { from: 'A', to: 'B' } });

      const cborBytes = engine.exportCertificate('cbor') as Uint8Array;
      expect(cborBytes).toBeInstanceOf(Uint8Array);

      const imported = PoPAuditEngine.importCertificate(cborBytes, 'cbor');
      expect(imported.auditResult.valid).toBe(true);
      expect(imported.certificate.author.id).toBe('author-eve');
      expect(imported.certificate.chainSummary.totalEvents).toBe(2);
    });
  });

  describe('3-Pane IDE Constitution Compliance & PlotailorIDE Integration', () => {
    it('should integrate PoP Audit Engine into PlotailorIDE and render 3-pane layout without modals', () => {
      const ide = new PlotailorIDE();

      const evt1 = ide.recordEditEvent({
        eventType: 'node_create',
        payload: { name: 'Protagonist' },
      });
      expect(evt1.sequence).toBe(0);

      const evt2 = ide.recordEditEvent({
        eventType: 'property_change',
        payload: { trait: 'Courageous' },
      });
      expect(evt2.sequence).toBe(1);

      const layout = ide.renderThreePaneLayout();

      // Constitution Check 1: 3-pane layout integration
      expect(layout.leftPane.title).toBe('Audit Stream & Merkle Explorer');
      expect(layout.middlePane.title).toBe('Creation Process Canvas & Timeline');
      expect(layout.rightPane.title).toBe('PoP Certificate & Verification Inspector');

      // Constitution Check 2: Modal prohibition (modalCount === 0)
      expect(layout.modalCount).toBe(0);

      // Verify pane data content
      expect(layout.leftPane.data.totalEvents).toBe(2);
      expect(layout.rightPane.data.valid).toBe(true);
    });
  });
});
