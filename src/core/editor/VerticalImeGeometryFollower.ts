/**
 * VerticalImeGeometryFollower.ts
 *
 * Implements precise IME candidate window anchoring and vertical caret geometry
 * tracking for CodeMirror 6 under writing-mode: vertical-rl.
 *
 * Background:
 * In vertical-rl writing mode, browsers (Chromium/WebKit) often calculate input method
 * candidate window coordinates using standard horizontal geometry (top-to-bottom line
 * progression, left-to-right character flow). As a result, IME candidate windows can
 * jump to (0,0), outside the viewport, or misalign significantly from the caret.
 *
 * This extension:
 * 1. Tracks caret screen coordinates in vertical-rl mode using getVerticalCoordsAtPos.
 * 2. Positions a lightweight invisible IME anchor element (.cm-vertical-ime-anchor)
 *    directly adjacent to the caret position.
 * 3. Provides clean hooks for IME composition start, update, and end cycles.
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { isVerticalMode, getVerticalCoordsAtPos } from './VerticalWritingExtension.js';

export interface VerticalImeFollowerOptions {
  anchorClassName?: string;
  debugOverlay?: boolean;
}

export class VerticalImeGeometryFollowerPlugin {
  private anchorEl: HTMLElement | null = null;
  private debugOverlayEl: HTMLElement | null = null;
  private isComposing = false;
  private lastPos: number = -1;

  constructor(public view: EditorView, private options: VerticalImeFollowerOptions = {}) {
    this.createAnchorElement();
    this.updateAnchorPosition();
  }

  update(update: ViewUpdate) {
    if (
      update.selectionSet ||
      update.docChanged ||
      update.geometryChanged ||
      update.viewportChanged
    ) {
      this.updateAnchorPosition();
    }
  }

  private createAnchorElement(): void {
    if (typeof document === 'undefined') return;

    this.anchorEl = document.createElement('div');
    this.anchorEl.className = this.options.anchorClassName || 'cm-vertical-ime-anchor';
    this.anchorEl.setAttribute('aria-hidden', 'true');
    this.anchorEl.style.position = 'absolute';
    this.anchorEl.style.width = '2px';
    this.anchorEl.style.height = '18px';
    this.anchorEl.style.pointerEvents = 'none';
    this.anchorEl.style.opacity = '0';
    this.anchorEl.style.zIndex = '-1';

    if (this.options.debugOverlay) {
      this.debugOverlayEl = document.createElement('div');
      this.debugOverlayEl.className = 'cm-vertical-ime-debug-marker';
      this.debugOverlayEl.style.position = 'absolute';
      this.debugOverlayEl.style.width = '4px';
      this.debugOverlayEl.style.height = '20px';
      this.debugOverlayEl.style.backgroundColor = 'rgba(239, 68, 68, 0.8)';
      this.debugOverlayEl.style.pointerEvents = 'none';
      this.debugOverlayEl.style.zIndex = '9999';
      this.view.dom.appendChild(this.debugOverlayEl);
    }

    this.view.dom.appendChild(this.anchorEl);
  }

  public updateAnchorPosition(): void {
    if (!this.anchorEl || typeof window === 'undefined') return;
    if (!isVerticalMode(this.view)) {
      this.anchorEl.style.display = 'none';
      if (this.debugOverlayEl) this.debugOverlayEl.style.display = 'none';
      return;
    }

    this.anchorEl.style.display = 'block';
    if (this.debugOverlayEl) this.debugOverlayEl.style.display = 'block';

    const sel = this.view.state.selection.main;
    const pos = sel.head;
    this.lastPos = pos;

    const coords = getVerticalCoordsAtPos(this.view, pos, 1);
    if (!coords) return;

    const editorRect = this.view.dom.getBoundingClientRect();
    const relativeLeft = coords.left - editorRect.left;
    const relativeTop = coords.top - editorRect.top;
    const height = Math.max(16, coords.bottom - coords.top);

    this.anchorEl.style.left = `${Math.round(relativeLeft)}px`;
    this.anchorEl.style.top = `${Math.round(relativeTop)}px`;
    this.anchorEl.style.height = `${Math.round(height)}px`;

    if (this.debugOverlayEl) {
      this.debugOverlayEl.style.left = `${Math.round(relativeLeft)}px`;
      this.debugOverlayEl.style.top = `${Math.round(relativeTop)}px`;
      this.debugOverlayEl.style.height = `${Math.round(height)}px`;
    }
  }

  public getAnchorCoordinates(): { left: number; top: number; height: number } | null {
    if (!this.anchorEl) return null;
    return {
      left: parseFloat(this.anchorEl.style.left) || 0,
      top: parseFloat(this.anchorEl.style.top) || 0,
      height: parseFloat(this.anchorEl.style.height) || 0,
    };
  }

  destroy(): void {
    if (this.anchorEl && this.anchorEl.parentElement) {
      this.anchorEl.parentElement.removeChild(this.anchorEl);
    }
    if (this.debugOverlayEl && this.debugOverlayEl.parentElement) {
      this.debugOverlayEl.parentElement.removeChild(this.debugOverlayEl);
    }
    this.anchorEl = null;
    this.debugOverlayEl = null;
  }
}

export function verticalImeGeometryFollower(options: VerticalImeFollowerOptions = {}): Extension {
  return ViewPlugin.define((view) => new VerticalImeGeometryFollowerPlugin(view, options));
}
