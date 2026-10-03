/**
 * FullscreenStatusBar - Non-intrusive Status Bar for Fullscreen Writing Mode
 *
 * Strict compliance with the 3-Pane Integrated IDE Constitution:
 * - Displays at the bottom of the editor screen in full-screen writing mode.
 * - Inline metrics: real-time character count (with 400-char manuscript page equivalence),
 *   session writing speed (chars/min), and target word count progress gauge bar.
 * - Non-intrusive UI: auto-fades after inactivity and reappears on keystrokes, mouse move, or hover.
 * - Zero standalone modal dialogs created.
 */

export interface FullscreenStatusBarOptions {
  targetWordCount?: number;
  autoFadeTimeoutMs?: number;
  container?: HTMLElement | null;
  initialText?: string;
  charsPerPage?: number;
  isFullscreen?: boolean;
}

export interface FullscreenStatusState {
  rawText: string;
  characterCount: number;
  manuscriptPages: number;
  targetWordCount: number;
  progressPercent: number;
  sessionTypedCount: number;
  sessionStartTime: number;
  writingSpeedCpm: number;
  isFullscreen: boolean;
  isVisible: boolean;
  isHovered: boolean;
}

export class FullscreenStatusBar {
  private targetWordCount: number;
  private autoFadeTimeoutMs: number;
  private charsPerPage: number;
  private container: HTMLElement | null = null;
  private element: HTMLElement | null = null;

  private state: FullscreenStatusState;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private initialCharCount: number = 0;

  // Bound event listeners for cleanup
  private boundOnMouseMove: (e: Event) => void;
  private boundOnKeyDown: (e: Event) => void;
  private boundOnMouseEnter: (e: Event) => void;
  private boundOnMouseLeave: (e: Event) => void;

  constructor(options?: FullscreenStatusBarOptions) {
    this.targetWordCount = options?.targetWordCount ?? 5000;
    this.autoFadeTimeoutMs = options?.autoFadeTimeoutMs ?? 3000;
    this.charsPerPage = options?.charsPerPage ?? 400;
    const initialText = options?.initialText ?? '';
    const initialCount = initialText.length;
    this.initialCharCount = initialCount;

    const now = Date.now();
    this.state = {
      rawText: initialText,
      characterCount: initialCount,
      manuscriptPages: this.calculateManuscriptPages(initialCount),
      targetWordCount: this.targetWordCount,
      progressPercent: this.calculateProgressPercent(initialCount, this.targetWordCount),
      sessionTypedCount: 0,
      sessionStartTime: now,
      writingSpeedCpm: 0,
      isFullscreen: options?.isFullscreen ?? false,
      isVisible: true,
      isHovered: false,
    };

    this.boundOnMouseMove = () => this.onUserActivity();
    this.boundOnKeyDown = () => this.onKeystroke(1);
    this.boundOnMouseEnter = () => this.onMouseEnter();
    this.boundOnMouseLeave = () => this.onMouseLeave();

    if (options?.container) {
      this.mount(options.container);
    }

    this.resetFadeTimer();
  }

  public getState(): FullscreenStatusState {
    return { ...this.state };
  }

  public setFullscreen(isFullscreen: boolean): void {
    this.state.isFullscreen = isFullscreen;
    this.onUserActivity();
  }

  public setTargetWordCount(target: number): void {
    if (target <= 0) return;
    this.targetWordCount = target;
    this.state.targetWordCount = target;
    this.state.progressPercent = this.calculateProgressPercent(
      this.state.characterCount,
      target
    );
    this.updateDOM();
  }

  /**
   * Updates current text and recalculates word count, manuscript pages, target progress, and CPM.
   */
  public updateText(newText: string): void {
    const prevCount = this.state.characterCount;
    const newCount = newText.length;
    const addedChars = Math.max(0, newCount - prevCount);

    this.state.rawText = newText;
    this.state.characterCount = newCount;
    this.state.manuscriptPages = this.calculateManuscriptPages(newCount);
    this.state.progressPercent = this.calculateProgressPercent(
      newCount,
      this.targetWordCount
    );

    if (addedChars > 0) {
      this.state.sessionTypedCount += addedChars;
    }

    this.recalculateWritingSpeed();
    this.onUserActivity();
  }

  /**
   * Call when typing occurs to record keystrokes and update writing speed.
   */
  public onKeystroke(typedCharsCount: number = 1): void {
    if (typedCharsCount > 0) {
      this.state.sessionTypedCount += typedCharsCount;
    }
    this.recalculateWritingSpeed();
    this.onUserActivity();
  }

  /**
   * Resets auto-fade timer and ensures bar is visible.
   */
  public onUserActivity(): void {
    this.state.isVisible = true;
    this.resetFadeTimer();
    this.updateDOM();
  }

  public onMouseEnter(): void {
    this.state.isHovered = true;
    this.state.isVisible = true;
    this.clearFadeTimer();
    this.updateDOM();
  }

  public onMouseLeave(): void {
    this.state.isHovered = false;
    this.resetFadeTimer();
    this.updateDOM();
  }

  /**
   * Recalculates writing speed in Characters Per Minute (CPM).
   */
  public recalculateWritingSpeed(now: number = Date.now()): void {
    const durationMinutes = (now - this.state.sessionStartTime) / 60000;
    if (durationMinutes <= 0 || this.state.sessionTypedCount <= 0) {
      this.state.writingSpeedCpm = 0;
      return;
    }
    this.state.writingSpeedCpm = Math.round(this.state.sessionTypedCount / durationMinutes);
  }

  private calculateManuscriptPages(charCount: number): number {
    if (charCount <= 0) return 0;
    return Number((charCount / this.charsPerPage).toFixed(1));
  }

  private calculateProgressPercent(charCount: number, target: number): number {
    if (target <= 0) return 0;
    const pct = (charCount / target) * 100;
    return Number(Math.min(100, Math.max(0, pct)).toFixed(1));
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private resetFadeTimer(): void {
    this.clearFadeTimer();

    if (this.state.isHovered || this.autoFadeTimeoutMs <= 0) {
      return;
    }

    this.fadeTimer = setTimeout(() => {
      this.state.isVisible = false;
      this.updateDOM();
    }, this.autoFadeTimeoutMs);
  }

  /**
   * Renders the status bar HTML string model.
   */
  public renderModel(): {
    classes: string;
    wordCountLabel: string;
    manuscriptLabel: string;
    speedLabel: string;
    progressLabel: string;
    progressPercent: number;
    html: string;
  } {
    const s = this.state;
    const classes = [
      'fullscreen-status-bar',
      s.isFullscreen ? 'mode-fullscreen' : 'mode-normal',
      s.isVisible ? 'is-visible' : 'is-faded-out',
      s.isHovered ? 'is-hovered' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const wordCountLabel = `${s.characterCount.toLocaleString()}字`;
    const manuscriptLabel = `原稿用紙 約${s.manuscriptPages.toFixed(1)}枚 (${this.charsPerPage}字詰)`;
    const speedLabel = `${s.writingSpeedCpm.toLocaleString()} 文字/分`;
    const progressLabel = `目標 ${s.targetWordCount.toLocaleString()}字 (${s.progressPercent}%)`;

    const html = `
      <div class="${classes}" role="status" aria-label="執筆ステータス">
        <div class="status-bar-metrics">
          <span class="status-item metric-word-count">
            <span class="metric-icon">📝</span> ${wordCountLabel}
          </span>
          <span class="status-item metric-manuscript">
            (${manuscriptLabel})
          </span>
          <span class="status-item metric-speed">
            <span class="metric-icon">⚡</span> ${speedLabel}
          </span>
        </div>
        <div class="status-bar-progress">
          <span class="progress-text">${progressLabel}</span>
          <div class="progress-gauge-track" title="目標進捗: ${s.progressPercent}%">
            <div class="progress-gauge-fill" style="width: ${s.progressPercent}%;"></div>
          </div>
        </div>
      </div>
    `.trim();

    return {
      classes,
      wordCountLabel,
      manuscriptLabel,
      speedLabel,
      progressLabel,
      progressPercent: s.progressPercent,
      html,
    };
  }

  /**
   * Mounts the status bar element to a container element.
   */
  public mount(container: HTMLElement): void {
    this.unmount();
    this.container = container;

    if (typeof document !== 'undefined') {
      this.element = document.createElement('div');
      this.element.className = 'fullscreen-status-bar-wrapper';
      this.container.appendChild(this.element);

      // Bind events to container/element
      this.container.addEventListener('mousemove', this.boundOnMouseMove);
      this.container.addEventListener('keydown', this.boundOnKeyDown);
      this.element.addEventListener('mouseenter', this.boundOnMouseEnter);
      this.element.addEventListener('mouseleave', this.boundOnMouseLeave);
    }

    this.updateDOM();
  }

  public unmount(): void {
    if (this.container) {
      this.container.removeEventListener('mousemove', this.boundOnMouseMove);
      this.container.removeEventListener('keydown', this.boundOnKeyDown);
      this.container = null;
    }

    if (this.element) {
      this.element.removeEventListener('mouseenter', this.boundOnMouseEnter);
      this.element.removeEventListener('mouseleave', this.boundOnMouseLeave);
      this.element.remove();
      this.element = null;
    }
  }

  private updateDOM(): void {
    if (this.element) {
      const model = this.renderModel();
      this.element.innerHTML = model.html;
    }
  }

  public destroy(): void {
    this.clearFadeTimer();
    this.unmount();
  }
}
