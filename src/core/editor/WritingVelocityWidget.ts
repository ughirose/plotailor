/**
 * WritingVelocityWidget - Real-time Character & Writing Speed Measurement Engine
 *
 * Complies with 3-Pane Integrated IDE Constitution:
 * - Collects session keystrokes, net character count (delta), and pause time locally.
 * - Computes Characters Per Minute (CPM) and Characters Per Hour (CPH / 時速) over a 1-hour sliding window.
 * - Non-modal UI integration into the status bar and 3-pane right dock.
 */

export interface WritingVelocityOptions {
  sessionId?: string;
  initialCharCount?: number;
  pauseThresholdMs?: number; // Inactivity threshold before time is counted as pause (default: 5000ms)
  windowSizeMs?: number;     // Sliding window size in ms (default: 3600000ms = 1 hour)
  startTime?: number;        // Custom session start timestamp in ms
}

export interface WritingEventRecord {
  timestamp: number;
  deltaChars: number;
  keystrokes: number;
  isComposing: boolean;
}

export interface WritingSessionMetrics {
  sessionId: string;
  startTime: number;
  keystrokes: number;
  initialCharCount: number;
  currentCharCount: number;
  netCharacters: number;
  pauseTimeMs: number;
  activeTimeMs: number;
  totalElapsedMs: number;
  cpm: number;
  cph: number;
  pastHourNetChars: number;
  pastHourActiveTimeMs: number;
}

export class WritingVelocityWidget {
  private sessionId: string;
  private startTime: number;
  private isStartTimeExplicit: boolean = false;
  private initialCharCount: number;
  private currentCharCount: number;
  private keystrokes: number = 0;
  private pauseTimeMs: number = 0;
  private lastActivityTime: number | null = null;
  private pauseThresholdMs: number;
  private windowSizeMs: number;
  private history: WritingEventRecord[] = [];

  constructor(options?: WritingVelocityOptions) {
    const now = options?.startTime ?? Date.now();
    this.sessionId = options?.sessionId ?? `session-${now}`;
    this.initialCharCount = Math.max(0, options?.initialCharCount ?? 0);
    this.currentCharCount = this.initialCharCount;
    this.pauseThresholdMs = options?.pauseThresholdMs ?? 5000;
    this.windowSizeMs = options?.windowSizeMs ?? 3600000; // 1 hour
    this.startTime = now;
    if (options?.startTime !== undefined) {
      this.isStartTimeExplicit = true;
    }
  }

  /**
   * Records a typing action or editor update.
   */
  public recordKeystroke(
    currentCharCount: number,
    options?: { keystrokeIncrement?: number; isComposing?: boolean; timestamp?: number }
  ): void {
    const now = options?.timestamp ?? Date.now();
    const isComposing = options?.isComposing ?? false;
    const ksInc = options?.keystrokeIncrement ?? 1;

    // Adjust startTime if first keystroke is recorded at an earlier timestamp and startTime was not explicit
    if (!this.isStartTimeExplicit && this.lastActivityTime === null && now < this.startTime) {
      this.startTime = now;
    }

    // Track pause time if inactive beyond pauseThresholdMs
    if (this.lastActivityTime !== null) {
      const gap = now - this.lastActivityTime;
      if (gap >= this.pauseThresholdMs) {
        this.pauseTimeMs += (gap - this.pauseThresholdMs);
      }
    } else {
      // First keystroke after session start: if there was delay before starting to type
      const initialGap = now - this.startTime;
      if (initialGap >= this.pauseThresholdMs) {
        this.pauseTimeMs += (initialGap - this.pauseThresholdMs);
      }
    }

    this.lastActivityTime = now;
    const deltaChars = currentCharCount - this.currentCharCount;
    this.currentCharCount = currentCharCount;
    this.keystrokes += ksInc;

    // Record in history buffer
    this.history.push({
      timestamp: now,
      deltaChars,
      keystrokes: ksInc,
      isComposing,
    });

    // Prune history records older than windowSizeMs
    this.pruneHistory(now);
  }

  /**
   * Resets the current writing session counters.
   */
  public resetSession(initialCharCount: number = 0, now?: number): void {
    const currentTime = now ?? Date.now();
    this.sessionId = `session-${currentTime}`;
    this.startTime = currentTime;
    this.isStartTimeExplicit = true;
    this.initialCharCount = Math.max(0, initialCharCount);
    this.currentCharCount = this.initialCharCount;
    this.keystrokes = 0;
    this.pauseTimeMs = 0;
    this.lastActivityTime = null;
    this.history = [];
  }

  /**
   * Gets aggregated real-time metrics and calculated velocities (CPM / CPH).
   */
  public getMetrics(now?: number): WritingSessionMetrics {
    const currentTime = now ?? Date.now();
    this.pruneHistory(currentTime);

    const totalElapsedMs = Math.max(0, currentTime - this.startTime);

    // Accumulate ongoing pause if user is currently idle
    let currentPauseTimeMs = this.pauseTimeMs;
    if (this.lastActivityTime !== null) {
      const idleGap = currentTime - this.lastActivityTime;
      if (idleGap >= this.pauseThresholdMs) {
        currentPauseTimeMs += (idleGap - this.pauseThresholdMs);
      }
    } else if (totalElapsedMs >= this.pauseThresholdMs) {
      currentPauseTimeMs += (totalElapsedMs - this.pauseThresholdMs);
    }

    const activeTimeMs = Math.max(0, totalElapsedMs - currentPauseTimeMs);
    const netCharacters = this.currentCharCount - this.initialCharCount;

    // Past 1 hour sliding window calculation
    const windowStart = currentTime - this.windowSizeMs;
    const validEvents = this.history.filter((ev) => ev.timestamp >= windowStart && ev.timestamp <= currentTime);

    const pastHourNetChars = validEvents.reduce((sum, ev) => sum + ev.deltaChars, 0);

    // Calculate active time in past 1 hour window
    const windowElapsedMs = Math.min(this.windowSizeMs, Math.max(0, currentTime - Math.max(this.startTime, windowStart)));

    // Estimate pause time within past hour window
    let pastHourPauseMs = 0;
    if (validEvents.length > 0) {
      // Calculate gaps between events in window exceeding pauseThresholdMs
      let prevTime = Math.max(windowStart, this.startTime);
      for (const ev of validEvents) {
        const gap = ev.timestamp - prevTime;
        if (gap >= this.pauseThresholdMs) {
          pastHourPauseMs += (gap - this.pauseThresholdMs);
        }
        prevTime = ev.timestamp;
      }
      // Trailing idle gap
      const trailingGap = currentTime - prevTime;
      if (trailingGap >= this.pauseThresholdMs) {
        pastHourPauseMs += (trailingGap - this.pauseThresholdMs);
      }
    } else {
      // No events in window
      if (windowElapsedMs >= this.pauseThresholdMs) {
        pastHourPauseMs = windowElapsedMs - this.pauseThresholdMs;
      }
    }

    const pastHourActiveTimeMs = Math.max(0, windowElapsedMs - pastHourPauseMs);

    // Velocity (CPM & CPH) calculations
    let cpm = 0;
    let cph = 0;

    if (pastHourActiveTimeMs > 0 && pastHourNetChars > 0) {
      const activeMinutes = pastHourActiveTimeMs / 60000;
      cpm = Math.round(pastHourNetChars / activeMinutes);
      cph = Math.round(cpm * 60);
    } else if (activeTimeMs > 0 && netCharacters > 0) {
      // Fallback to session rate if window events yield 0 pastHourActiveTimeMs
      const sessionActiveMinutes = activeTimeMs / 60000;
      cpm = Math.round(netCharacters / sessionActiveMinutes);
      cph = Math.round(cpm * 60);
    }

    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      keystrokes: this.keystrokes,
      initialCharCount: this.initialCharCount,
      currentCharCount: this.currentCharCount,
      netCharacters,
      pauseTimeMs: currentPauseTimeMs,
      activeTimeMs,
      totalElapsedMs,
      cpm,
      cph,
      pastHourNetChars,
      pastHourActiveTimeMs,
    };
  }

  /**
   * Formats status bar display string.
   */
  public formatStatusBar(now?: number): string {
    const metrics = this.getMetrics(now);
    const sign = metrics.netCharacters >= 0 ? '+' : '';
    const pauseFormatted = this.formatDuration(metrics.pauseTimeMs);

    return `打鍵: ${metrics.keystrokes.toLocaleString()}回 | 純増: ${sign}${metrics.netCharacters.toLocaleString()}字 | 執筆速度: ${metrics.cpm} CPM (${metrics.cph.toLocaleString()}字/時) | 休憩: ${pauseFormatted}`;
  }

  /**
   * Renders HTML structure for 3-Pane Right Dock / Widget inline panel.
   */
  public renderInlineWidget(now?: number): string {
    const metrics = this.getMetrics(now);
    const pauseFormatted = this.formatDuration(metrics.pauseTimeMs);
    const activeFormatted = this.formatDuration(metrics.activeTimeMs);
    const totalFormatted = this.formatDuration(metrics.totalElapsedMs);
    const sign = metrics.netCharacters >= 0 ? '+' : '';

    return `
      <div class="writing-velocity-widget" data-session="${metrics.sessionId}">
        <div class="widget-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="font-weight: 600; color: #6366f1;">⏱️ リアルタイム執筆計測</span>
          <span class="session-badge" style="font-size: 0.7rem; color: var(--text-dim);">${metrics.sessionId}</span>
        </div>

        <div class="velocity-metrics-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;">
          <div class="metric-card" style="background: rgba(99, 102, 241, 0.08); padding: 0.5rem; border-radius: 4px; border: 1px solid rgba(99, 102, 241, 0.2);">
            <div style="font-size: 0.75rem; color: var(--text-dim);">時速 (CPH)</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #818cf8;" class="metric-cph">${metrics.cph.toLocaleString()} <span style="font-size: 0.75rem;">字/時</span></div>
          </div>
          <div class="metric-card" style="background: rgba(16, 185, 129, 0.08); padding: 0.5rem; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.2);">
            <div style="font-size: 0.75rem; color: var(--text-dim);">分速 (CPM)</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #34d399;" class="metric-cpm">${metrics.cpm} <span style="font-size: 0.75rem;">CPM</span></div>
          </div>
        </div>

        <div class="session-details" style="font-size: 0.8rem; line-height: 1.6; color: var(--text-muted);">
          <div style="display: flex; justify-content: space-between;">
            <span>打鍵数:</span>
            <strong style="color: var(--text-main);" class="metric-keystrokes">${metrics.keystrokes.toLocaleString()} 回</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>純増文字数:</span>
            <strong style="color: var(--text-main);" class="metric-net-chars">${sign}${metrics.netCharacters.toLocaleString()} 字</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>実稼働時間:</span>
            <strong style="color: var(--text-main);">${activeFormatted}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>休憩時間:</span>
            <strong style="color: #f59e0b;" class="metric-pause-time">${pauseFormatted}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>総経過時間:</span>
            <strong style="color: var(--text-dim);">${totalFormatted}</strong>
          </div>
        </div>
      </div>
    `.trim();
  }

  private pruneHistory(now: number): void {
    const cutoff = now - this.windowSizeMs;
    this.history = this.history.filter((ev) => ev.timestamp >= cutoff);
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}時間${minutes}分${seconds}秒`;
    }
    if (minutes > 0) {
      return `${minutes}分${seconds}秒`;
    }
    return `${seconds}秒`;
  }
}
