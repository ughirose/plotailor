// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TypingCadenceMachine } from '../src/core/editor/TypingCadenceMachine.js';

describe('TypingCadenceMachine (IKI State Machine)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state with opacity 1.0', () => {
    const machine = new TypingCadenceMachine();
    expect(machine.getState()).toBe('idle');
    const status = machine.getStatus();
    expect(status.opacity).toBe(1.00);
    expect(status.iki).toBe(0);
  });

  it('transitions to typing_burst when consecutive keystrokes are < 200ms', () => {
    const machine = new TypingCadenceMachine();
    let now = 1000;

    machine.recordKeystroke(now);
    expect(machine.getState()).toBe('idle');

    now += 150; // IKI = 150ms (< 200ms)
    machine.recordKeystroke(now);
    expect(machine.getState()).toBe('typing_burst');

    const status = machine.getStatus();
    expect(status.opacity).toBe(0.05);
    expect(status.transitionMs).toBe(300);
    expect(status.transitionTiming).toBe('ease-out');
  });

  it('transitions to short_pause after 400ms without typing', () => {
    const machine = new TypingCadenceMachine();
    machine.recordKeystroke(1000);
    machine.recordKeystroke(1150); // In burst
    expect(machine.getState()).toBe('typing_burst');

    vi.advanceTimersByTime(400);
    expect(machine.getState()).toBe('short_pause');

    const status = machine.getStatus();
    expect(status.opacity).toBe(0.40);
    expect(status.transitionMs).toBe(400);
    expect(status.transitionTiming).toBe('ease-in-out');
  });

  it('transitions to deep_pause after 1500ms without typing', () => {
    const machine = new TypingCadenceMachine();
    machine.recordKeystroke(1000);
    machine.recordKeystroke(1150);

    vi.advanceTimersByTime(1500);
    expect(machine.getState()).toBe('deep_pause');

    const status = machine.getStatus();
    expect(status.opacity).toBe(1.00);
    expect(status.transitionMs).toBe(600);
    expect(status.transitionTiming).toBe('ease-in');
  });

  it('notifies listeners upon state changes', () => {
    const machine = new TypingCadenceMachine();
    const listener = vi.fn();
    machine.addListener(listener);

    machine.recordKeystroke(1000);
    machine.recordKeystroke(1100);

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      state: 'typing_burst',
      opacity: 0.05,
    }));

    vi.advanceTimersByTime(400);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      state: 'short_pause',
      opacity: 0.40,
    }));
  });

  it('applies cadence classes and CSS variables to DOM element', () => {
    const machine = new TypingCadenceMachine();
    const el = document.createElement('div');

    machine.recordKeystroke(1000);
    machine.recordKeystroke(1100);
    machine.applyToDom(el);

    expect(el.classList.contains('cadence-burst')).toBe(true);
    expect(el.style.getPropertyValue('--cadence-opacity')).toBe('0.05');

    vi.advanceTimersByTime(400);
    machine.applyToDom(el);
    expect(el.classList.contains('cadence-short-pause')).toBe(true);
    expect(el.style.getPropertyValue('--cadence-opacity')).toBe('0.4');

    vi.advanceTimersByTime(1100);
    machine.applyToDom(el);
    expect(el.classList.contains('cadence-deep-pause')).toBe(true);
    expect(el.style.getPropertyValue('--cadence-opacity')).toBe('1');
  });
});
