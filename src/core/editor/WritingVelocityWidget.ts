/**
 * WritingVelocityWidget - Real-time Writing Speed (CPM / CPH) and Keystroke Analytics Engine
 * 
 * Strict compliance with the 3-Pane Integrated Literature IDE Constitution:
 * - Local-First real-time metrics calculation
 * - Non-modal status bar & docked widget rendering
 * - Keystroke entropy, net character growth, and idle/pause detection
 */

export interface KeystrokeRecord {
  timestamp: number;
  charCount: number;
  keystrokeDelta: number;
}

export interface WritingVelocityConfig {
  idleThresholdMs: number; // Duration without input to consider as paused/idle (default 60,000ms = 1min)
  slidingWindowMs: number; // Rolling time window for velocity calculation (default 3,600,000ms = 1hr)
}

export interface VelocityMetrics {
  totalKeystrokes: number;
  initialCharCount: number;
  currentCharCount: number;
  netCharacterDelta: number;
  sessionDurationMs: number;
  idleDurationMs: number;
  activeDurationMs: number;
  cpm: number; // Chars Per Minute (over rolling window or active time)
  cph: number; // Chars Per Hour
  kpm: number; // Keystrokes Per Minute
  isCurrentlyIdle: boolean;
}

export class WritingVelocityWidget {
  private config: WritingVelocityConfig;
  private sessionStartTime: number;
  private lastActivityTime: number;
  private initialCharCount: number = 0;
  private currentCharCount: number = 0;
  private totalKeystrokes: number = 0;
  private records: KeystrokeRecord[] = [];
  private accumulatedIdleMs: number = 0;

  constructor(config?: Partial<WritingVelocityConfig>) {
    this.config = {
      idleThresholdMs: config?.idleThresholdMs ?? 60_000,
      slidingWindowMs: config?.slidingWindowMs ?? 3_600_000,
    };
    this.sessionStartTime = Date.now();
    this.lastActivityTime = this.sessionStartTime;
  }

  /**
   * Starts a new writing session.
   */
  public startSession(initialCharCount: number = 0, timestamp: number = Date.now()): void {
    this.sessionStartTime = timestamp;
    this.lastActivityTime = timestamp;
    this.initialCharCount = initialCharCount;
    this.currentCharCount = initialCharCount;
    this.totalKeystrokes = 0;
    this.accumulatedIdleMs = 0;
    this.records = [
      {
        timestamp,
        charCount: initialCharCount,
        keystrokeDelta: 0,
      },
    ];
  }

  /**
   * Records a typing or editing event.
   */
  public recordKeystroke(textOrLength: string | number, timestamp: number = Date.now()): void {
    const newCount = typeof textOrLength === 'string' ? textOrLength.length : textOrLength;

    const timeSinceLast = timestamp - this.lastActivityTime;
    if (timeSinceLast > this.config.idleThresholdMs) {
      // Author paused / took a break
      this.accumulatedIdleMs += timeSinceLast;
    }

    this.lastActivityTime = timestamp;
    this.totalKeystrokes++;
    this.currentCharCount = newCount;

    this.records.push({
      timestamp,
      charCount: newCount,
      keystrokeDelta: 1,
    });

    // Prune records older than 2x slidingWindowMs to preserve memory
    const cutoff = timestamp - this.config.slidingWindowMs * 2;
    while (this.records.length > 1 && this.records[0].timestamp < cutoff) {
      this.records.shift();
    }
  }

  /**
   * Computes comprehensive velocity and session analytics.
   */
  public getMetrics(now: number = Date.now()): VelocityMetrics {
    const elapsedTotalMs = Math.max(0, now - this.sessionStartTime);
    const timeSinceLast = Math.max(0, now - this.lastActivityTime);

    let idleMs = this.accumulatedIdleMs;
    const isCurrentlyIdle = timeSinceLast > this.config.idleThresholdMs;
    if (isCurrentlyIdle) {
      idleMs += timeSinceLast;
    }

    const activeMs = Math.max(0, elapsedTotalMs - idleMs);
    const netDelta = this.currentCharCount - this.initialCharCount;

    // Rolling window velocity calculation (default past 1 hour)
    const windowStart = now - this.config.slidingWindowMs;
    const windowRecords = this.records.filter((r) => r.timestamp >= windowStart);

    let windowCharDelta = 0;
    let windowKeystrokes = 0;

    if (windowRecords.length >= 2) {
      const oldest = windowRecords[0];
      const newest = windowRecords[windowRecords.length - 1];
      windowCharDelta = Math.max(0, newest.charCount - oldest.charCount);
      windowKeystrokes = windowRecords.length - 1;
    } else if (windowRecords.length === 1) {
      windowCharDelta = Math.max(0, this.currentCharCount - windowRecords[0].charCount);
      windowKeystrokes = 1;
    }

    // Minutes active in the window
    const windowDurationMs = Math.min(this.config.slidingWindowMs, elapsedTotalMs);
    const windowMinutes = Math.max(0.1, (windowDurationMs - (isCurrentlyIdle ? timeSinceLast : 0)) / 60_000);

    const cpm = Math.round((windowCharDelta / windowMinutes) * 10) / 10;
    const cph = Math.round(cpm * 60);
    const kpm = Math.round((windowKeystrokes / windowMinutes) * 10) / 10;

    return {
      totalKeystrokes: this.totalKeystrokes,
      initialCharCount: this.initialCharCount,
      currentCharCount: this.currentCharCount,
      netCharacterDelta: netDelta,
      sessionDurationMs: elapsedTotalMs,
      idleDurationMs: idleMs,
      activeDurationMs: activeMs,
      cpm,
      cph,
      kpm,
      isCurrentlyIdle,
    };
  }

  /**
   * Renders compact inline HTML for 3-pane IDE status bar.
   */
  public renderStatusBarHtml(now: number = Date.now()): string {
    const metrics = this.getMetrics(now);
    const deltaSign = metrics.netCharacterDelta >= 0 ? '+' : '';
    const idleIndicator = metrics.isCurrentlyIdle ? '<span class="velocity-idle">（休憩中）</span>' : '';

    return `<div class="writing-velocity-status" title="打鍵数: ${metrics.totalKeystrokes} / 純増: ${deltaSign}${metrics.netCharacterDelta}文字">` +
      `<span>⚡ 執筆速度: <strong>${metrics.cpm}</strong> CPM (${metrics.cph} 文字/時)</span> ` +
      `<span>| 純増: <strong>${deltaSign}${metrics.netCharacterDelta}</strong>字</span>` +
      `${idleIndicator}` +
      `</div>`;
  }

  /**
   * Updates idle detection threshold in milliseconds.
   */
  public setIdleThreshold(idleThresholdMs: number): void {
    this.config.idleThresholdMs = idleThresholdMs;
  }

  /**
   * Gets current idle detection threshold in milliseconds.
   */
  public getIdleThreshold(): number {
    return this.config.idleThresholdMs;
  }

  /**
   * Updates configuration properties.
   */
  public updateConfig(config: Partial<WritingVelocityConfig>): void {
    if (config.idleThresholdMs !== undefined) {
      this.config.idleThresholdMs = config.idleThresholdMs;
    }
    if (config.slidingWindowMs !== undefined) {
      this.config.slidingWindowMs = config.slidingWindowMs;
    }
  }

  /**
   * Resets session to current state.
   */
  public reset(timestamp: number = Date.now()): void {
    this.startSession(this.currentCharCount, timestamp);
  }
}
