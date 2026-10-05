import { describe, it, expect } from 'vitest';
import { ForeshadowingDistanceAuditor } from '../src/core/editor/ForeshadowingDistanceAuditor.js';

describe('ForeshadowingDistanceAuditor', () => {
  it('should calculate character distance and chapter distance correctly for resolved foreshadowings', () => {
    const auditor = new ForeshadowingDistanceAuditor({ prematureCharThreshold: 50 });

    const manuscript = `
第1章 始まりの街
@plant(fs-key, "古びた鍵")
ここに第1章の本文が長く続きます。
${'A'.repeat(200)}

第2章 秘境の洞窟
@payoff(fs-key, "鍵で開く扉")
ここに第2章の本文が続きます。
`;

    const report = auditor.auditText(manuscript);

    expect(report.totalCount).toBe(1);
    expect(report.resolvedCount).toBe(1);
    expect(report.unresolvedCount).toBe(0);
    expect(report.prematureCount).toBe(0);

    const metric = report.metrics[0];
    expect(metric.id).toBe('fs-key');
    expect(metric.status).toBe('RESOLVED');
    expect(metric.charDistance).toBeGreaterThan(200);
    expect(metric.chapterDistance).toBe(1); // Ch 1 to Ch 2
  });

  it('should generate a warning diagnostic for premature payoff (recovered too early)', () => {
    const auditor = new ForeshadowingDistanceAuditor({ prematureCharThreshold: 200 });

    const manuscript = `
第1章 旅立ち
@plant(fs-ring, "指輪の秘密")
@payoff(fs-ring, "すぐ回収")
`;

    const report = auditor.auditText(manuscript);

    expect(report.prematureCount).toBe(1);
    expect(report.diagnostics).toHaveLength(1);

    const diag = report.diagnostics[0];
    expect(diag.type).toBe('PREMATURE_PAYOFF');
    expect(diag.severity).toBe('warning');
    expect(diag.foreshadowingId).toBe('fs-ring');
    expect(diag.message).toContain('回収が早すぎる伏線');
    expect(diag.charDistance).toBeLessThan(200);
  });

  it('should generate an alert for unresolved / neglected foreshadowing exceeding threshold (20,000 chars)', () => {
    const auditor = new ForeshadowingDistanceAuditor({ unresolvedCharThreshold: 20000 });

    const padding = 'あ'.repeat(21000);
    const manuscript = `
第1章 謎のメッセージ
@plant(fs-abandoned, "開かずの扉")
${padding}
`;

    const report = auditor.auditText(manuscript);

    expect(report.unresolvedCount).toBe(1);
    expect(report.neglectedCount).toBe(1);
    expect(report.diagnostics).toHaveLength(1);

    const diag = report.diagnostics[0];
    expect(diag.type).toBe('UNRESOLVED_NEGLECTED');
    expect(diag.severity).toBe('warning');
    expect(diag.foreshadowingId).toBe('fs-abandoned');
    expect(diag.message).toContain('未回収伏線');
    expect(diag.charDistance).toBeGreaterThanOrEqual(20000);
  });

  it('should calculate in-universe elapsed days using chapterDayMap and inline @day tags', () => {
    const auditor = new ForeshadowingDistanceAuditor({
      chapterDayMap: {
        'ch-1': 1,
        'ch-3': 10,
      },
    });

    const manuscript = `
第1章 誓い
@plant(fs-sword, "伝説の剣")

第2章 旅路
@day(3)

第3章 決戦
@payoff(fs-sword, "剣の真価")
`;

    const report = auditor.auditText(manuscript);

    expect(report.metrics).toHaveLength(1);
    const metric = report.metrics[0];

    expect(metric.plantedDay).toBe(1);
    expect(metric.resolvedDay).toBe(10);
    expect(metric.daysElapsed).toBe(9); // Day 1 to Day 10
  });

  it('should support both @payoff and @resolve tags interchangeably', () => {
    const auditor = new ForeshadowingDistanceAuditor({ prematureCharThreshold: 10 });

    const manuscript = `
第1章
@plant(fs-1, "伏線1")
${'X'.repeat(50)}
@resolve(fs-1, "解決1")

@plant(fs-2, "伏線2")
${'Y'.repeat(50)}
@payoff(fs-2, "回収2")
`;

    const report = auditor.auditText(manuscript);

    expect(report.totalCount).toBe(2);
    expect(report.resolvedCount).toBe(2);
    expect(report.unresolvedCount).toBe(0);
    expect(report.prematureCount).toBe(0);
  });
});
