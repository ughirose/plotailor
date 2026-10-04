// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { TypingCadenceMachine } from '../src/core/editor/TypingCadenceMachine.js';
import { createCadenceListenerExtension } from '../src/core/editor/CadenceListenerExtension.js';
import { NarrativeLinterEngine } from '../src/core/editor/NarrativeLinterEngine.js';
import { QwertyTypoDetector } from '../src/core/editor/QwertyTypoDetector.js';

describe('CadenceListenerExtension & Realtime Typing Cadence Feedback', () => {
  it('initializes extension cleanly on CodeMirror 6 EditorView', () => {
    const machine = new TypingCadenceMachine();
    const extension = createCadenceListenerExtension({
      cadenceMachine: machine,
    });

    const state = EditorState.create({
      doc: 'テスト文章',
      extensions: [extension],
    });

    const parent = document.createElement('div');
    const view = new EditorView({ state, parent });

    expect(view).toBeDefined();
    expect(machine.getState()).toBe('idle');
    view.destroy();
  });

  it('records keystrokes from dom keydown events and triggers cadence changes', () => {
    const onCadenceChange = vi.fn();
    const machine = new TypingCadenceMachine({
      burstThresholdMs: 200,
      minBurstStrokes: 2,
    });

    const extension = createCadenceListenerExtension({
      cadenceMachine: machine,
      onCadenceChange,
    });

    const parent = document.createElement('div');
    const view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [extension] }),
      parent,
    });

    // Simulate rapid typing keydown
    const now = Date.now();
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));

    expect(onCadenceChange).toHaveBeenCalled();
    expect(machine.getState()).toBe('typing_burst');
    view.destroy();
  });

  it('suppresses low-confidence typos during typing-burst and reveals them during pause', () => {
    const detector = new QwertyTypoDetector();
    // Register high confidence and medium confidence typos
    detector.registerCustomRule('高確信度タイポ', '高確信度修正', { confidence: 0.96 });
    detector.registerCustomRule('中確信度タイポ', '中確信度修正', { confidence: 0.75 });

    const text = 'これは高確信度タイポと中確信度タイポです。';

    // 1. In typing-burst: only high-confidence (>= 0.95) returned
    const burstResults = detector.detectTyposInText(text, 'typing-burst');
    expect(burstResults.length).toBe(1);
    expect(burstResults[0].original).toBe('高確信度タイポ');

    // 2. In short-pause: both high and medium (>= 0.70) returned
    const pauseResults = detector.detectTyposInText(text, 'short-pause');
    expect(pauseResults.length).toBe(2);

    // 3. In NarrativeLinterEngine, cadenceStatus dynamically controls scan results
    const linter = new NarrativeLinterEngine();
    linter.getTypoDetector().registerCustomRule('高確信度タイポ', '高確信度修正', { confidence: 0.96 });
    linter.getTypoDetector().registerCustomRule('中確信度タイポ', '中確信度修正', { confidence: 0.75 });

    linter.setCadenceStatus('typing-burst');
    const burstAnalysis = linter.analyzeDocument(text);
    const burstTypoItems = burstAnalysis.syntacticItems.filter(i => i.ruleType === 'qwerty-typo');
    expect(burstTypoItems.length).toBe(1);
    expect(burstTypoItems[0].previewText).toBe('高確信度タイポ');

    linter.setCadenceStatus('deep-pause');
    const pauseAnalysis = linter.analyzeDocument(text);
    const pauseTypoItems = pauseAnalysis.syntacticItems.filter(i => i.ruleType === 'qwerty-typo');
    expect(pauseTypoItems.length).toBe(2);
  });
});
