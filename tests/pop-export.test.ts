import { describe, it, expect } from 'vitest';
import {
  PoPAuditEngine,
  PoPCertificateExporter,
  verifyPoPCertificate,
  computeKeystrokeEntropy,
} from '../src/core/audit/PoPCertificateExporter';
import { runCLI } from '../scripts/pop-verify';

declare function require(moduleName: string): any;
declare const process: any;
const { writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');

describe('Proof of Process (PoP) Audit Engine & Exporter', () => {
  it('should record audit event blocks and form valid Merkle Hash Chain', () => {
    const engine = new PoPAuditEngine('銀河鉄道の夜', '宮沢賢治');

    const b1 = engine.recordEvent({
      eventId: 'evt-001',
      insCount: 150,
      delCount: 20,
      keystrokes: 180,
      pauseDurationMs: 1200,
      keystrokeIntervals: [120, 150, 200, 180, 140, 900],
      payload: 'ケンタウルス祭の夜、ジョバンニは',
      timestamp: 1700000000000,
    });

    const b2 = engine.recordEvent({
      eventId: 'evt-002',
      insCount: 200,
      delCount: 30,
      keystrokes: 250,
      pauseDurationMs: 2500,
      keystrokeIntervals: [110, 130, 220, 300, 1200],
      payload: '天気輪の丘へと駆けあがった。',
      timestamp: 1700000060000,
    });

    expect(b1.index).toBe(0);
    expect(b1.prevHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    expect(b2.index).toBe(1);
    expect(b2.prevHash).toBe(b1.hash);
    expect(engine.getBlocks().length).toBe(2);
    expect(engine.getRootHash()).toBe(b2.hash);
  });

  it('should compute HCIS score, typing entropy, and time summary metrics correctly', () => {
    const engine = new PoPAuditEngine('坊っちゃん', '夏目漱石');

    engine.recordEvent({
      eventId: 'evt-1',
      insCount: 500,
      delCount: 100,
      keystrokes: 650,
      pauseDurationMs: 5000,
      keystrokeIntervals: [100, 150, 200, 50, 600, 1200, 2500],
      timestamp: 1000000,
    });

    engine.recordEvent({
      eventId: 'evt-2',
      insCount: 300,
      delCount: 50,
      keystrokes: 380,
      pauseDurationMs: 3000,
      keystrokeIntervals: [80, 120, 180, 400, 1500],
      timestamp: 1060000, // 60s later
    });

    const metrics = engine.computeMetrics();

    expect(metrics.finalCharCount).toBe(650);
    expect(metrics.hcisScore).toBeGreaterThan(1.4);
    expect(metrics.hcisScore).toBeLessThan(1.5);

    expect(metrics.totalInsertions).toBe(800);
    expect(metrics.totalDeletions).toBe(150);
    expect(metrics.totalKeystrokes).toBe(1030);
    expect(metrics.totalElapsedTimeMs).toBe(60000);
    expect(metrics.pauseTimeMs).toBe(8000);
    expect(metrics.activeWritingTimeMs).toBe(52000);
    expect(metrics.keystrokeEntropy).toBeGreaterThan(0);
  });

  it('should export and import certificates in JSON format correctly', () => {
    const engine = new PoPAuditEngine('羅生門', '芥川龍之介');
    engine.recordEvent({
      eventId: 'evt-rm-1',
      insCount: 100,
      delCount: 10,
      keystrokes: 110,
      pauseDurationMs: 500,
      timestamp: 1700000000000,
    });

    const cert = engine.generateCertificate();
    const jsonStr = PoPCertificateExporter.exportToJSON(cert);
    const importedCert = PoPCertificateExporter.importFromJSON(jsonStr);

    expect(importedCert.manuscriptTitle).toBe('羅生門');
    expect(importedCert.author).toBe('芥川龍之介');
    expect(importedCert.rootHash).toBe(cert.rootHash);
    expect(importedCert.blocks.length).toBe(1);

    const verificationResult = verifyPoPCertificate(jsonStr);
    expect(verificationResult.valid).toBe(true);
    expect(verificationResult.blockCount).toBe(1);
    expect(verificationResult.calculatedRootHash).toBe(cert.rootHash);
  });

  it('should export and import certificates in CBOR format correctly', () => {
    const engine = new PoPAuditEngine('走れメロス', '太宰治');
    engine.recordEvent({
      eventId: 'evt-melos-1',
      insCount: 200,
      delCount: 40,
      keystrokes: 260,
      pauseDurationMs: 1000,
      timestamp: 1700000000000,
    });

    const cert = engine.generateCertificate();
    const cborData = PoPCertificateExporter.exportToCBOR(cert);
    expect(cborData).toBeInstanceOf(Uint8Array);

    const importedCert = PoPCertificateExporter.importFromCBOR(cborData);
    expect(importedCert.manuscriptTitle).toBe('走れメロス');
    expect(importedCert.author).toBe('太宰治');
    expect(importedCert.rootHash).toBe(cert.rootHash);
    expect(importedCert.summary.hcisScore).toBe(cert.summary.hcisScore);

    const verificationResult = verifyPoPCertificate(cborData);
    expect(verificationResult.valid).toBe(true);
    expect(verificationResult.blockCount).toBe(1);
  });

  it('should detect tampered certificate hash or modified block content', () => {
    const engine = new PoPAuditEngine('こころ', '夏目漱石');
    engine.recordEvent({
      eventId: 'evt-c1',
      insCount: 300,
      delCount: 50,
      keystrokes: 350,
      pauseDurationMs: 800,
      timestamp: 1700000000000,
    });
    engine.recordEvent({
      eventId: 'evt-c2',
      insCount: 400,
      delCount: 20,
      keystrokes: 430,
      pauseDurationMs: 900,
      timestamp: 1700000010000,
    });

    const cert = engine.generateCertificate();

    const tamperedCert = JSON.parse(JSON.stringify(cert));
    tamperedCert.blocks[0].insCount = 999;

    const result = verifyPoPCertificate(tamperedCert);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Tampered hash detected');
  });

  it('should detect broken hash chain link', () => {
    const engine = new PoPAuditEngine('雪国', '川端康成');
    engine.recordEvent({
      eventId: 'evt-y1',
      insCount: 100,
      delCount: 0,
      keystrokes: 100,
      pauseDurationMs: 200,
      timestamp: 1700000000000,
    });
    engine.recordEvent({
      eventId: 'evt-y2',
      insCount: 100,
      delCount: 0,
      keystrokes: 100,
      pauseDurationMs: 200,
      timestamp: 1700000010000,
    });

    const cert = engine.generateCertificate();
    const tamperedCert = JSON.parse(JSON.stringify(cert));
    tamperedCert.blocks[1].prevHash = 'badhash00000000000000000000000000000000000000000000000000000000';

    const result = verifyPoPCertificate(tamperedCert);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Previous hash chain link broken');
  });

  it('should compute entropy correctly for different interval distributions', () => {
    expect(computeKeystrokeEntropy([])).toBe(0);

    const intervals = [30, 80, 150, 400];
    const entropy = computeKeystrokeEntropy(intervals);
    expect(entropy).toBeCloseTo(2.0, 1);
  });

  it('should run standalone CLI verification successfully on valid JSON and CBOR files', () => {
    const engine = new PoPAuditEngine('山月記', '中島敦');
    engine.recordEvent({
      eventId: 'evt-sg1',
      insCount: 180,
      delCount: 15,
      keystrokes: 200,
      pauseDurationMs: 600,
      timestamp: 1700000000000,
    });

    const cert = engine.generateCertificate();
    const jsonPath = join(process.cwd(), 'tests', 'test-cert.pop.json');
    const cborPath = join(process.cwd(), 'tests', 'test-cert.cbor');

    writeFileSync(jsonPath, PoPCertificateExporter.exportToJSON(cert));
    writeFileSync(cborPath, PoPCertificateExporter.exportToCBOR(cert));

    try {
      const jsonExitCode = runCLI([jsonPath]);
      expect(jsonExitCode).toBe(0);

      const cborExitCode = runCLI([cborPath]);
      expect(cborExitCode).toBe(0);
    } finally {
      unlinkSync(jsonPath);
      unlinkSync(cborPath);
    }
  });
});
