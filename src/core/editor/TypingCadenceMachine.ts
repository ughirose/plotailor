/**
 * Typing Cadence (Inter-Keystroke Interval: IKI) Linked State Machine
 * 
 * Complies with Plotailor Literature IDE Spec Section 2.1:
 * - Typing Burst (<200ms continuous): Opacity 0.05, 300ms (ease-out), shuts off linter/decorations.
 * - Short Pause (400-1000ms): Opacity 0.40, 400ms (ease-in-out), fades in Layer 2 (POV violation) only.
 * - Deep Pause (>1500ms): Opacity 1.00, 600ms (ease-in), full decorations and detail drawer sync.
 */

export type CadenceState = 'idle' | 'typing_burst' | 'short_pause' | 'deep_pause';

export interface CadenceStatus {
  state: CadenceState;
  opacity: number;
  transitionMs: number;
  transitionTiming: string;
  iki: number;
  burstCount: number;
}

export type CadenceListener = (status: CadenceStatus) => void;

export interface TypingCadenceOptions {
  burstThresholdMs?: number; // default: 200
  shortPauseMs?: number;     // default: 400
  deepPauseMs?: number;      // default: 1500
  minBurstStrokes?: number;  // default: 2
  onStateChange?: CadenceListener;
}

export class TypingCadenceMachine {
  private burstThresholdMs: number;
  private shortPauseMs: number;
  private deepPauseMs: number;
  private minBurstStrokes: number;

  private state: CadenceState = 'idle';
  private lastStrokeTime = 0;
  private lastIki = 0;
  private burstCount = 0;

  private shortPauseTimer: ReturnType<typeof setTimeout> | null = null;
  private deepPauseTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<CadenceListener> = new Set();

  constructor(options: TypingCadenceOptions = {}) {
    this.burstThresholdMs = options.burstThresholdMs ?? 200;
    this.shortPauseMs = options.shortPauseMs ?? 400;
    this.deepPauseMs = options.deepPauseMs ?? 1500;
    this.minBurstStrokes = options.minBurstStrokes ?? 2;

    if (options.onStateChange) {
      this.listeners.add(options.onStateChange);
    }
  }

  public recordKeystroke(timestamp: number = Date.now()): CadenceStatus {
    const prevTime = this.lastStrokeTime;
    this.lastStrokeTime = timestamp;

    this.clearTimers();

    if (prevTime > 0) {
      this.lastIki = Math.max(0, timestamp - prevTime);
      if (this.lastIki < this.burstThresholdMs) {
        this.burstCount++;
      } else {
        this.burstCount = 1;
      }
    } else {
      this.lastIki = 0;
      this.burstCount = 1;
    }

    if (this.burstCount >= this.minBurstStrokes) {
      this.setState('typing_burst');
    }

    // Schedule Short Pause
    this.shortPauseTimer = setTimeout(() => {
      this.burstCount = 0;
      this.setState('short_pause');

      // Schedule Deep Pause
      this.deepPauseTimer = setTimeout(() => {
        this.setState('deep_pause');
      }, this.deepPauseMs - this.shortPauseMs);
    }, this.shortPauseMs);

    return this.getStatus();
  }

  public getState(): CadenceState {
    return this.state;
  }

  public getStatus(): CadenceStatus {
    switch (this.state) {
      case 'typing_burst':
        return {
          state: 'typing_burst',
          opacity: 0.05,
          transitionMs: 300,
          transitionTiming: 'ease-out',
          iki: this.lastIki,
          burstCount: this.burstCount,
        };
      case 'short_pause':
        return {
          state: 'short_pause',
          opacity: 0.40,
          transitionMs: 400,
          transitionTiming: 'ease-in-out',
          iki: this.lastIki,
          burstCount: this.burstCount,
        };
      case 'deep_pause':
        return {
          state: 'deep_pause',
          opacity: 1.00,
          transitionMs: 600,
          transitionTiming: 'ease-in',
          iki: this.lastIki,
          burstCount: this.burstCount,
        };
      case 'idle':
      default:
        return {
          state: 'idle',
          opacity: 1.00,
          transitionMs: 300,
          transitionTiming: 'ease-out',
          iki: this.lastIki,
          burstCount: this.burstCount,
        };
    }
  }

  public addListener(listener: CadenceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public applyToDom(targetElement: HTMLElement): void {
    const status = this.getStatus();
    targetElement.classList.remove('cadence-burst', 'cadence-short-pause', 'cadence-deep-pause', 'cadence-idle');

    switch (status.state) {
      case 'typing_burst':
        targetElement.classList.add('cadence-burst');
        break;
      case 'short_pause':
        targetElement.classList.add('cadence-short-pause');
        break;
      case 'deep_pause':
        targetElement.classList.add('cadence-deep-pause');
        break;
      default:
        targetElement.classList.add('cadence-idle');
        break;
    }

    targetElement.style.setProperty('--cadence-opacity', status.opacity.toString());
    targetElement.style.setProperty('--cadence-transition', `${status.transitionMs}ms ${status.transitionTiming}`);
  }

  public reset(): void {
    this.clearTimers();
    this.state = 'idle';
    this.burstCount = 0;
    this.lastStrokeTime = 0;
    this.lastIki = 0;
    this.notify();
  }

  public dispose(): void {
    this.clearTimers();
    this.listeners.clear();
  }

  private setState(newState: CadenceState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.notify();
    }
  }

  private notify(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  private clearTimers(): void {
    if (this.shortPauseTimer) {
      clearTimeout(this.shortPauseTimer);
      this.shortPauseTimer = null;
    }
    if (this.deepPauseTimer) {
      clearTimeout(this.deepPauseTimer);
      this.deepPauseTimer = null;
    }
  }
}
