import { describe, it, expect } from 'vitest';
import { WritingVelocityWidget } from '../src/core/editor/WritingVelocityWidget.js';

describe('WritingVelocityWidget - Writing Speed & Keystroke Tracking', () => {
  it('initializes with default metrics', () => {
    const startTime = 1000000;
    const widget = new WritingVelocityWidget();
    widget.startSession(500, startTime);

    const metrics = widget.getMetrics(startTime);
    expect(metrics.initialCharCount).toBe(500);
    expect(metrics.currentCharCount).toBe(500);
    expect(metrics.totalKeystrokes).toBe(0);
    expect(metrics.netCharacterDelta).toBe(0);
    expect(metrics.cpm).toBe(0);
  });

  it('accurately calculates CPM and CPH during continuous writing', () => {
    const startTime = 1000000;
    const widget = new WritingVelocityWidget({ idleThresholdMs: 60000 });
    widget.startSession(0, startTime);

    // Simulate 100 keystrokes over 2 minutes (120,000ms), 100 chars added
    for (let i = 1; i <= 100; i++) {
      const t = startTime + (i * 1200); // 1.2s per char
      widget.recordKeystroke(i, t);
    }

    const checkTime = startTime + 120000; // 2 minutes later
    const metrics = widget.getMetrics(checkTime);

    expect(metrics.totalKeystrokes).toBe(100);
    expect(metrics.currentCharCount).toBe(100);
    expect(metrics.netCharacterDelta).toBe(100);
    expect(metrics.activeDurationMs).toBe(120000);
    expect(metrics.cpm).toBeCloseTo(50, 0); // 100 chars in 2 minutes = 50 cpm
    expect(metrics.cph).toBeCloseTo(3000, -2); // 50 * 60 = 3000 cph
  });

  it('detects idle pause time and excludes it from active duration', () => {
    const startTime = 1000000;
    const widget = new WritingVelocityWidget({ idleThresholdMs: 30000 }); // 30s idle threshold
    widget.startSession(0, startTime);

    // Write for 30s
    widget.recordKeystroke(20, startTime + 30000);

    // Author pauses for 2 minutes (120,000ms)
    const afterBreakTime = startTime + 150000;
    widget.recordKeystroke(21, afterBreakTime);

    const metrics = widget.getMetrics(afterBreakTime);
    expect(metrics.idleDurationMs).toBeGreaterThanOrEqual(120000);
    expect(metrics.isCurrentlyIdle).toBe(false);
  });

  it('renders non-modal inline status bar HTML', () => {
    const startTime = 1000000;
    const widget = new WritingVelocityWidget();
    widget.startSession(100, startTime);
    widget.recordKeystroke(150, startTime + 60000);

    const html = widget.renderStatusBarHtml(startTime + 60000);
    expect(html).toContain('writing-velocity-status');
    expect(html).toContain('執筆速度');
    expect(html).toContain('+50');
  });

  it('resets session cleanly when requested', () => {
    const startTime = 1000000;
    const widget = new WritingVelocityWidget();
    widget.startSession(100, startTime);
    widget.recordKeystroke(200, startTime + 10000);

    widget.reset(startTime + 20000);
    const metrics = widget.getMetrics(startTime + 20000);
    expect(metrics.initialCharCount).toBe(200);
    expect(metrics.currentCharCount).toBe(200);
    expect(metrics.totalKeystrokes).toBe(0);
    expect(metrics.netCharacterDelta).toBe(0);
  });
});
