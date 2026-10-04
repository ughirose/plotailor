import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { TypingCadenceMachine, type CadenceStatus } from './TypingCadenceMachine.js';

export interface CadenceListenerOptions {
  cadenceMachine: TypingCadenceMachine;
  onCadenceChange?: (status: CadenceStatus) => void;
}

/**
 * CodeMirror 6 Extension that listens for real-time keystrokes
 * and feeds inter-keystroke intervals (IKI) to the TypingCadenceMachine.
 */
export function createCadenceListenerExtension(options: CadenceListenerOptions): Extension {
  const { cadenceMachine, onCadenceChange } = options;

  return [
    EditorView.domEventHandlers({
      keydown(event) {
        // Exclude standalone modifiers (Shift, Ctrl, Alt, Meta) to preserve pure typing IKI
        if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(event.key)) {
          return false;
        }

        const now = Date.now();
        const status = cadenceMachine.recordKeystroke(now);
        if (onCadenceChange) {
          onCadenceChange(status);
        }
        return false;
      },
      compositionupdate() {
        // Japanese IME syllable input keystrokes
        const now = Date.now();
        const status = cadenceMachine.recordKeystroke(now);
        if (onCadenceChange) {
          onCadenceChange(status);
        }
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      // In case text changed without keydown (e.g. paste or IME conversion commit)
      if (update.docChanged) {
        const now = Date.now();
        const status = cadenceMachine.recordKeystroke(now);
        if (onCadenceChange) {
          onCadenceChange(status);
        }
      }
    }),
  ];
}
