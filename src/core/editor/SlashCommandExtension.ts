/**
 * SlashCommandExtension.ts
 *
 * Lightweight, zero-dependency popover completion extension for CodeMirror 6.
 * Dispatches slash commands (/ruby, /bouten, /chapter, /heading) and lore mentions (@entity).
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import {
  SlashMentionCommandParser,
  type SlashCommandDefinition,
  type LoreMentionCandidate,
  type CompletionDispatchResult,
} from './SlashMentionCommandParser.js';

export interface SlashCommandExtensionOptions {
  getLoreCandidates?: () => LoreMentionCandidate[];
  onCommandApplied?: (label: string) => void;
}

export function slashCommandExtension(options: SlashCommandExtensionOptions = {}): Extension {
  let activePopup: HTMLElement | null = null;
  let activeDispatchResult: CompletionDispatchResult<any> | null = null;
  let selectedIndex = 0;

  function removePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
      activeDispatchResult = null;
      selectedIndex = 0;
    }
  }

  function renderPopup(view: EditorView, result: CompletionDispatchResult<any>) {
    removePopup();
    if (!result.candidates || result.candidates.length === 0) return;

    activeDispatchResult = result;
    selectedIndex = 0;

    const coords = view.coordsAtPos(result.to);
    const popup = document.createElement('div');
    popup.className = 'slash-command-popup';
    popup.setAttribute('role', 'listbox');
    popup.style.position = 'fixed';
    popup.style.zIndex = '9999';
    popup.style.background = 'var(--color-bg-panel, #1e232a)';
    popup.style.border = '1px solid var(--color-gold, #cfa85c)';
    popup.style.borderRadius = '6px';
    popup.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
    popup.style.padding = '4px';
    popup.style.minWidth = '220px';
    popup.style.maxWidth = '320px';
    popup.style.maxHeight = '240px';
    popup.style.overflowY = 'auto';

    if (coords) {
      popup.style.left = `${Math.min(window.innerWidth - 240, Math.max(10, coords.left))}px`;
      popup.style.top = `${Math.min(window.innerHeight - 250, coords.bottom + 6)}px`;
    } else {
      popup.style.left = '200px';
      popup.style.top = '100px';
    }

    result.candidates.forEach((cand, idx) => {
      const item = document.createElement('div');
      item.className = `slash-cand-item ${idx === selectedIndex ? 'selected' : ''}`;
      item.style.padding = '6px 10px';
      item.style.borderRadius = '4px';
      item.style.cursor = 'pointer';
      item.style.fontSize = '12px';
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.gap = '2px';
      item.style.background = idx === selectedIndex ? 'rgba(207, 168, 92, 0.2)' : 'transparent';
      item.style.color = idx === selectedIndex ? 'var(--color-gold, #cfa85c)' : 'var(--color-text-main, #e6edf3)';

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>${cand.label}</strong>
          ${cand.detail ? `<span style="font-size: 10px; opacity: 0.7;">${cand.detail}</span>` : ''}
        </div>
        ${cand.description ? `<div style="font-size: 10px; opacity: 0.6;">${cand.description}</div>` : ''}
      `;

      item.addEventListener('mouseenter', () => {
        selectedIndex = idx;
        updateSelection(popup);
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyCandidate(view, cand);
      });

      popup.appendChild(item);
    });

    document.body.appendChild(popup);
    activePopup = popup;
  }

  function updateSelection(popup: HTMLElement) {
    const items = popup.querySelectorAll('.slash-cand-item');
    items.forEach((item, idx) => {
      const el = item as HTMLElement;
      if (idx === selectedIndex) {
        el.style.background = 'rgba(207, 168, 92, 0.2)';
        el.style.color = 'var(--color-gold, #cfa85c)';
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.style.background = 'transparent';
        el.style.color = 'var(--color-text-main, #e6edf3)';
      }
    });
  }

  function applyCandidate(view: EditorView, cand: any) {
    if (!activeDispatchResult) return;
    const { from, to } = activeDispatchResult;
    const insertText = cand.replacementText;

    view.dispatch({
      changes: { from, to, insert: insertText },
      selection: { anchor: from + insertText.length },
      scrollIntoView: true,
    });
    options.onCommandApplied?.(cand.label);
    removePopup();
    view.focus();
  }

  const plugin = ViewPlugin.fromClass(
    class {
      private parser: SlashMentionCommandParser;

      constructor(view: EditorView) {
        const lore = options.getLoreCandidates ? options.getLoreCandidates() : [];
        this.parser = new SlashMentionCommandParser(undefined, lore);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          const sel = update.state.selection.main;
          if (sel.from !== sel.to) {
            removePopup();
            return;
          }

          if (options.getLoreCandidates) {
            this.parser.setLoreDictionary(options.getLoreCandidates());
          }

          const text = update.state.doc.toString();
          const result = this.parser.dispatch({
            text,
            cursorOffset: sel.head,
          });

          if (result && result.candidates.length > 0) {
            renderPopup(update.view, result);
          } else {
            removePopup();
          }
        }
      }

      destroy() {
        removePopup();
      }
    }
  );

  const domEventHandler = EditorView.domEventHandlers({
    keydown(event, view) {
      if (!activePopup || !activeDispatchResult) return false;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const total = activeDispatchResult.candidates.length;
        selectedIndex = (selectedIndex + 1) % total;
        updateSelection(activePopup);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const total = activeDispatchResult.candidates.length;
        selectedIndex = (selectedIndex - 1 + total) % total;
        updateSelection(activePopup);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const cand = activeDispatchResult.candidates[selectedIndex];
        if (cand) {
          applyCandidate(view, cand);
        }
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        removePopup();
        return true;
      }
      return false;
    },
  });

  return [plugin, domEventHandler];
}
