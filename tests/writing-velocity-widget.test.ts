import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WritingVelocityWidget, ThreePaneWorkspace } from '../src/index.js';

describe('WritingVelocityWidget - Real-time Character & Writing Speed Measurement Engine', () => {
  const baseTime = 1700000000000;

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default options and zero initial metrics', () => {
    const widget = new WritingVelocityWidget({ startTime: baseTime });
    const metrics = widget.getMetrics(baseTime);

    expect(metrics.sessionId).toMatch(/^session-\d+/);
    expect(metrics.keystrokes).toBe(0);
    expect(metrics.initialCharCount).toBe(0);
    expect(metrics.currentCharCount).toBe(0);
    expect(metrics.netCharacters).toBe(0);
    expect(metrics.pauseTimeMs).toBe(0);
    expect(metrics.cpm).toBe(0);
    expect(metrics.cph).toBe(0);
  });

  it('accepts custom initial character count and options', () => {
    const widget = new WritingVelocityWidget({
      sessionId: 'custom-session-123',
      initialCharCount: 500,
      pauseThresholdMs: 3000,
      windowSizeMs: 1800000, // 30 mins
      startTime: baseTime,
    });

    const metrics = widget.getMetrics(baseTime);
    expect(metrics.sessionId).toBe('custom-session-123');
    expect(metrics.initialCharCount).toBe(500);
    expect(metrics.currentCharCount).toBe(500);
    expect(metrics.netCharacters).toBe(0);
  });

  it('accurately tracks keystrokes and net character changes (delta)', () => {
    const widget = new WritingVelocityWidget({
      initialCharCount: 100,
      pauseThresholdMs: 5000,
      startTime: baseTime,
    });

    let t = baseTime;
    // Type 10 chars at t+1s
    widget.recordKeystroke(110, { timestamp: t + 1000 });
    // Type 15 chars at t+2s
    widget.recordKeystroke(125, { timestamp: t + 2000, keystrokeIncrement: 5 });
    // Delete 5 chars at t+3s
    widget.recordKeystroke(120, { timestamp: t + 3000 });

    const metrics = widget.getMetrics(t + 3000);
    expect(metrics.keystrokes).toBe(7); // 1 + 5 + 1
    expect(metrics.currentCharCount).toBe(120);
    expect(metrics.netCharacters).toBe(20); // 120 - 100
  });

  it('accumulates pause time when typing inactivity exceeds threshold', () => {
    const widget = new WritingVelocityWidget({
      initialCharCount: 0,
      pauseThresholdMs: 5000, // 5 seconds
      startTime: baseTime,
    });

    let t = baseTime;
    // Keystroke at t=0
    widget.recordKeystroke(10, { timestamp: t });

    // Active typing within 2 seconds (gap = 2s < 5s threshold -> no pause)
    t += 2000;
    widget.recordKeystroke(20, { timestamp: t });
    expect(widget.getMetrics(t).pauseTimeMs).toBe(0);

    // Pause for 15 seconds (gap = 15s >= 5s -> pause added = 15s - 5s = 10s)
    t += 15000;
    widget.recordKeystroke(30, { timestamp: t });
    expect(widget.getMetrics(t).pauseTimeMs).toBe(10000);

    // Ongoing idle gap at t + 20s (total gap = 20s >= 5s -> ongoing pause = 15s)
    const metricsIdle = widget.getMetrics(t + 20000);
    expect(metricsIdle.pauseTimeMs).toBe(25000); // 10000 + (20000 - 5000)
  });

  it('computes Characters Per Minute (CPM) and Chars Per Hour (CPH / 時速) over a sliding window', () => {
    const widget = new WritingVelocityWidget({
      initialCharCount: 0,
      pauseThresholdMs: 5000,
      windowSizeMs: 3600000, // 1 hour
      startTime: baseTime,
    });

    let t = baseTime;
    // Write 300 characters evenly over 6 minutes (100 characters every 2 minutes)
    widget.recordKeystroke(0, { timestamp: t });

    t += 120000; // 2 min
    widget.recordKeystroke(100, { timestamp: t });

    t += 120000; // 4 min
    widget.recordKeystroke(200, { timestamp: t });

    t += 120000; // 6 min
    widget.recordKeystroke(300, { timestamp: t });

    const metrics = widget.getMetrics(t);
    expect(metrics.cpm).toBeGreaterThan(0);
    expect(metrics.cph).toBe(metrics.cpm * 60);
    expect(metrics.pastHourNetChars).toBe(300);
  });

  it('prunes events older than 1 hour from the sliding window velocity calculation', () => {
    const widget = new WritingVelocityWidget({
      initialCharCount: 0,
      windowSizeMs: 3600000, // 1 hour
      startTime: baseTime,
    });

    let t = baseTime;
    // Write 1000 characters at t = 0
    widget.recordKeystroke(1000, { timestamp: t });

    // Advance 2 hours (7,200,000 ms) and write 200 characters
    t += 7200000;
    widget.recordKeystroke(1200, { timestamp: t });

    const metrics = widget.getMetrics(t);
    // Only the 200 characters written in the past hour should count toward pastHourNetChars
    expect(metrics.pastHourNetChars).toBe(200);
    expect(metrics.netCharacters).toBe(1200); // total session net chars
  });

  it('handles Japanese IME composition state flags during input tracking', () => {
    const widget = new WritingVelocityWidget({ initialCharCount: 0, startTime: baseTime });

    let t = baseTime;
    // IME conversion input
    widget.recordKeystroke(5, { timestamp: t, isComposing: true });
    widget.recordKeystroke(10, { timestamp: t + 500, isComposing: true });

    // IME confirmed
    widget.recordKeystroke(10, { timestamp: t + 1000, isComposing: false });

    const metrics = widget.getMetrics(t + 1000);
    expect(metrics.keystrokes).toBe(3);
    expect(metrics.currentCharCount).toBe(10);
  });

  it('formats status bar display string with Japanese localized labels', () => {
    const widget = new WritingVelocityWidget({ initialCharCount: 50, startTime: baseTime });
    widget.recordKeystroke(150, { timestamp: baseTime + 1000, keystrokeIncrement: 10 });

    const statusBarText = widget.formatStatusBar(baseTime + 1000);
    expect(statusBarText).toContain('打鍵: 10回');
    expect(statusBarText).toContain('純増: +100字');
    expect(statusBarText).toContain('執筆速度:');
    expect(statusBarText).toContain('CPM');
    expect(statusBarText).toContain('字/時');
    expect(statusBarText).toContain('休憩:');
  });

  it('renders inline widget HTML adhering to 3-Pane non-modal guidelines', () => {
    const widget = new WritingVelocityWidget({ sessionId: 'test-session-777', initialCharCount: 0, startTime: baseTime });
    widget.recordKeystroke(250, { timestamp: baseTime + 60000 });

    const html = widget.renderInlineWidget(baseTime + 60000);
    expect(html).toContain('writing-velocity-widget');
    expect(html).toContain('test-session-777');
    expect(html).toContain('リアルタイム執筆計測');
    expect(html).toContain('metric-cph');
    expect(html).toContain('metric-cpm');
    expect(html).toContain('metric-keystrokes');
    expect(html).toContain('metric-net-chars');
  });

  it('resets session metrics cleanly when resetSession is called', () => {
    const widget = new WritingVelocityWidget({ initialCharCount: 0, startTime: baseTime });
    widget.recordKeystroke(100, { timestamp: baseTime });

    widget.resetSession(200, baseTime + 5000);
    const metrics = widget.getMetrics(baseTime + 5000);

    expect(metrics.initialCharCount).toBe(200);
    expect(metrics.currentCharCount).toBe(200);
    expect(metrics.netCharacters).toBe(0);
    expect(metrics.keystrokes).toBe(0);
    expect(metrics.pauseTimeMs).toBe(0);
  });

  it('integrates seamlessly with ThreePaneWorkspace without regressions', () => {
    const workspace = new ThreePaneWorkspace({ initialText: '初期原稿テキスト' });

    // Type new text into workspace
    const newText = '初期原稿テキスト。新しいストーリーの始まり。';
    workspace.onTextChange(newText, false);

    const widget = workspace.getWritingVelocityWidget();
    const metrics = widget.getMetrics();
    expect(metrics.netCharacters).toBe(newText.length - '初期原稿テキスト'.length);

    // Switch right tab to writing-velocity dock
    workspace.setRightTab('writing-velocity');
    const model = workspace.renderWorkspaceModel();

    expect(model.rightPane.activeTab).toBe('writing-velocity');
    expect(model.rightPane.contentHtml).toContain('writing-velocity-dock');
    expect(model.rightPane.contentHtml).toContain('リアルタイム執筆計測');
  });
});
