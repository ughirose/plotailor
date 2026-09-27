/**
 * VerticalWritingExtension.ts
 * 
 * Solves the CodeMirror 6 vertical-rl viewport collapse (line disappearance) bug.
 * 
 * In standard horizontal mode, CodeMirror 6 measures lines by Y-height and replaces
 * off-screen lines with <div class="cm-gap"> spacer blocks.
 * In vertical-rl mode, lines expand along the X-axis while line.offsetHeight remains ~600px.
 * CodeMirror miscalculates that lines 3+ are below the screen (Y > 1200px) and removes them.
 * 
 * This extension hooks ViewState.getViewport when the editor is in vertical-rl mode,
 * forcing the viewport to cover the entire document [0..doc.length].
 * As a result, no BlockGap widgets are created and all lines are reliably rendered.
 */

import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension } from '@codemirror/state';

/**
 * Checks whether the editor is currently rendered in vertical-rl writing mode.
 */
export function isVerticalMode(view: EditorView): boolean {
  return (
    view.dom.closest('.vertical-rl') !== null ||
    view.dom.classList.contains('cm-vertical-rl') ||
    view.scrollDOM.classList.contains('cm-vertical-rl') ||
    view.contentDOM.classList.contains('cm-vertical-rl') ||
    (typeof window !== 'undefined' &&
      typeof window.getComputedStyle === 'function' &&
      window.getComputedStyle(view.contentDOM).writingMode?.startsWith('vertical'))
  );
}

/**
 * Computes exact document character position from screen coordinates (x, y)
 * under writing-mode: vertical-rl.
 */
export function getVerticalPosAtCoords(
  view: EditorView,
  coords: { x: number; y: number }
): number | null {
  // 1. Try browser native caret positioning APIs (Chrome, Edge, Safari, Firefox)
  if (typeof document !== 'undefined') {
    let targetNode: Node | null = null;
    let targetOffset = 0;

    if (typeof (document as any).caretPositionFromPoint === 'function') {
      const caret = (document as any).caretPositionFromPoint(coords.x, coords.y);
      if (caret) {
        targetNode = caret.offsetNode;
        targetOffset = caret.offset;
      }
    } else if (typeof (document as any).caretRangeFromPoint === 'function') {
      const range = (document as any).caretRangeFromPoint(coords.x, coords.y);
      if (range) {
        targetNode = range.startContainer;
        targetOffset = range.startOffset;
      }
    }

    if (targetNode && view.dom.contains(targetNode)) {
      try {
        const docPos = view.posAtDOM(targetNode, targetOffset);
        if (typeof docPos === 'number') {
          return docPos;
        }
      } catch {
        // Fallback to geometric calculation if posAtDOM throws
      }
    }
  }

  // 2. Geometric fallback (e.g. in test/jsdom environments or outside caret point)
  const lineEls = Array.from(view.contentDOM.querySelectorAll('.cm-line')) as HTMLElement[];
  if (lineEls.length === 0) {
    return 0;
  }

  // Vertical-rl: Lines are columns arranged right-to-left.
  const lineBoxes: { el: HTMLElement; rect: DOMRect; pos: number }[] = [];
  for (const el of lineEls) {
    try {
      const pos = view.posAtDOM(el, 0);
      lineBoxes.push({ el, rect: el.getBoundingClientRect(), pos });
    } catch {
      continue;
    }
  }

  if (lineBoxes.length === 0) return 0;

  // Find column matching X coordinate
  let best = lineBoxes[0];
  let minDiff = Infinity;
  for (const box of lineBoxes) {
    if (coords.x >= box.rect.left && coords.x <= box.rect.right) {
      best = box;
      minDiff = 0;
      break;
    }
    const diff = Math.min(Math.abs(coords.x - box.rect.left), Math.abs(coords.x - box.rect.right));
    if (diff < minDiff) {
      minDiff = diff;
      best = box;
    }
  }

  const line = view.state.doc.lineAt(best.pos);
  if (line.length === 0) {
    return line.from;
  }

  // Vertical text progresses downwards along the Y axis
  const boxRect = best.rect;
  if (coords.y <= boxRect.top) {
    return line.from;
  }
  if (coords.y >= boxRect.bottom) {
    return line.to;
  }

  const height = boxRect.height || 1;
  const progress = Math.max(0, Math.min(1, (coords.y - boxRect.top) / height));
  const charOffset = Math.round(progress * line.length);
  return Math.min(line.to, line.from + charOffset);
}

/**
 * Computes screen bounding box for a document character position under vertical-rl mode.
 */
export function getVerticalCoordsAtPos(
  view: EditorView,
  pos: number,
  side: -1 | 1 = 1
): { left: number; right: number; top: number; bottom: number } | null {
  try {
    const dom = view.domAtPos(pos, side);
    if (dom && dom.node && typeof document !== 'undefined') {
      if (document.createRange) {
        const range = document.createRange();
        if (dom.node.nodeType === Node.TEXT_NODE) {
          const textLen = (dom.node.textContent || '').length;
          const start = Math.min(Math.max(0, dom.offset), textLen);
          range.setStart(dom.node, start);
          range.setEnd(dom.node, Math.min(start + (side > 0 ? 1 : 0), textLen));
        } else {
          range.selectNodeContents(dom.node);
        }
        if (typeof range.getClientRects === 'function') {
          const rects = range.getClientRects();
          if (rects && rects.length > 0) {
            const r = rects[0];
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          }
        }
      }
      const el = dom.node instanceof Element ? dom.node : dom.node.parentElement;
      if (el && typeof el.getBoundingClientRect === 'function') {
        const bRect = el.getBoundingClientRect();
        return { left: bRect.left, right: bRect.right, top: bRect.top, bottom: bRect.bottom };
      }
    }
    if (typeof view.dom.getBoundingClientRect === 'function') {
      const bRect = view.dom.getBoundingClientRect();
      return { left: bRect.left, right: bRect.right, top: bRect.top, bottom: bRect.bottom };
    }
  } catch {
    // ignore
  }
  return null;
}

class VerticalWritingPlugin {
  constructor(view: EditorView) {
    this.patchViewState(view);
  }

  update(update: ViewUpdate) {
    this.patchViewState(update.view);
  }

  private patchViewState(view: EditorView) {
    const vs = (view as any).viewState;
    if (vs && !vs._verticalWritingPatched) {
      vs._verticalWritingPatched = true;

      const originalGetViewport = vs.getViewport;
      const originalViewportIsAppropriate = vs.viewportIsAppropriate;

      vs.getViewport = function (bias: any, scrollTarget: any) {
        if (isVerticalMode(view)) {
          // Return full document range as a single viewport to prevent BlockGapWidget creation
          const ViewportClass = this.viewport.constructor;
          return new ViewportClass(0, this.state.doc.length);
        }
        return originalGetViewport.call(this, bias, scrollTarget);
      };

      vs.viewportIsAppropriate = function (vp: any, bias: any) {
        if (isVerticalMode(view)) {
          return vp.from === 0 && vp.to === this.state.doc.length;
        }
        return originalViewportIsAppropriate.call(this, vp, bias);
      };
    }

    // Patch view.posAtCoords and view.coordsAtPos for writing-mode: vertical-rl
    if (!(view as any)._verticalCoordsPatched) {
      (view as any)._verticalCoordsPatched = true;
      const originalPosAtCoords = view.posAtCoords.bind(view);
      const originalCoordsAtPos = view.coordsAtPos.bind(view);

      (view as any).posAtCoords = function (coords: { x: number; y: number }, precise: any = true) {
        if (isVerticalMode(this)) {
          const vPos = getVerticalPosAtCoords(this, coords);
          if (vPos !== null) {
            return vPos;
          }
        }
        try {
          return originalPosAtCoords(coords, precise);
        } catch {
          return null;
        }
      };

      (view as any).coordsAtPos = function (pos: number, side: any = 1) {
        if (isVerticalMode(this)) {
          const vRect = getVerticalCoordsAtPos(this, pos, side);
          if (vRect) {
            return vRect;
          }
        }
        try {
          return originalCoordsAtPos(pos, side);
        } catch {
          return null;
        }
      };
    }
  }
}

export const verticalWritingPlugin = ViewPlugin.fromClass(VerticalWritingPlugin);

/**
 * Event handler for mouse/pointer clicks in vertical writing mode.
 * Accurately sets selection anchor to prevent coordinate misalignment.
 */
const verticalMouseHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    if (!isVerticalMode(view)) return false;
    const coords = { x: event.clientX, y: event.clientY };
    const pos = getVerticalPosAtCoords(view, coords);
    if (pos !== null) {
      if (event.shiftKey) {
        view.dispatch({
          selection: { anchor: view.state.selection.main.anchor, head: pos },
          userEvent: 'select.pointer',
        });
      } else {
        view.dispatch({
          selection: { anchor: pos },
          userEvent: 'select.pointer',
        });
      }
      view.focus();
      return true;
    }
    return false;
  },
});

/**
 * Event handler for mouse wheel scroll in vertical writing mode.
 * Converts vertical wheel deltaY into horizontal scrollLeft so users can navigate long manuscripts.
 */
const verticalWheelHandler = EditorView.domEventHandlers({
  wheel(event: WheelEvent, view: EditorView) {
    if (!isVerticalMode(view)) return false;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      view.scrollDOM.scrollLeft -= event.deltaY;
      return true;
    }
    return false;
  },
});

import { Prec } from '@codemirror/state';

export let isAutoIndentEnabled = true;
export function setAutoIndentEnabled(enabled: boolean) {
  isAutoIndentEnabled = enabled;
}

function handleVerticalArrow(
  view: EditorView,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
): boolean {
  if (!isVerticalMode(view)) return false;
  const doc = view.state.doc;
  const sel = view.state.selection.main;
  const currentPos = sel.head;
  const currentLine = doc.lineAt(currentPos);
  const offsetInLine = currentPos - currentLine.from;

  let targetPos = currentPos;

  if (key === 'ArrowUp') {
    // 視覚的な上＝同じ段落（行）の1文字上へ
    if (currentPos > currentLine.from) {
      targetPos = currentPos - 1;
    } else if (currentLine.number > 1) {
      const prevLine = doc.line(currentLine.number - 1);
      targetPos = prevLine.to;
    }
  } else if (key === 'ArrowDown') {
    // 視覚的な下＝同じ段落（行）の1文字下へ
    if (currentPos < currentLine.to) {
      targetPos = currentPos + 1;
    } else if (currentLine.number < doc.lines) {
      const nextLine = doc.line(currentLine.number + 1);
      targetPos = nextLine.from;
    }
  } else if (key === 'ArrowLeft') {
    // 視覚的な左＝左側の段落（次の段落）の同位置へ移動！
    if (currentLine.number < doc.lines) {
      const nextLine = doc.line(currentLine.number + 1);
      targetPos = nextLine.from + Math.min(offsetInLine, nextLine.length);
    }
  } else if (key === 'ArrowRight') {
    // 視覚的な右＝右側の段落（前の段落）の同位置へ移動！
    if (currentLine.number > 1) {
      const prevLine = doc.line(currentLine.number - 1);
      targetPos = prevLine.from + Math.min(offsetInLine, prevLine.length);
    }
  }

  if (targetPos !== currentPos) {
    view.dispatch({
      selection: { anchor: targetPos, head: targetPos },
      scrollIntoView: true,
    });
  }
  return true;
}

export const verticalArrowNavigationKeymap = Prec.highest(
  keymap.of([
    {
      key: 'ArrowUp',
      run: (view: EditorView) => handleVerticalArrow(view, 'ArrowUp'),
    },
    {
      key: 'ArrowDown',
      run: (view: EditorView) => handleVerticalArrow(view, 'ArrowDown'),
    },
    {
      key: 'ArrowLeft',
      run: (view: EditorView) => handleVerticalArrow(view, 'ArrowLeft'),
    },
    {
      key: 'ArrowRight',
      run: (view: EditorView) => handleVerticalArrow(view, 'ArrowRight'),
    },
  ])
);

/**
 * Keymap handler to trap Tab and Shift-Tab inside the editor,
 * preventing focus loss to side panes and optionally inserting full-width space for Japanese novel indent.
 */
import { keymap } from '@codemirror/view';

export const tabIndentKeymap = keymap.of([
  {
    key: 'Tab',
    run: (view: EditorView) => {
      if (!isAutoIndentEnabled) return false;
      view.dispatch(view.state.replaceSelection('　'));
      return true;
    },
    shift: (view: EditorView) => {
      if (!isAutoIndentEnabled) return false;
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.from);
      if (line.text.startsWith('　') || line.text.startsWith(' ') || line.text.startsWith('\t')) {
        view.dispatch({
          changes: { from: line.from, to: line.from + 1, insert: '' },
        });
        return true;
      }
      return false;
    },
  },
]);

/**
 * Ensures visible horizontal scrollbar and styling in vertical-rl mode.
 */
export const verticalScrollTheme = EditorView.theme({
  '&.cm-vertical-rl, .vertical-rl &': {
    overflowX: 'auto !important',
    overflowY: 'hidden !important',
  },
  '&.cm-vertical-rl .cm-scroller, .vertical-rl & .cm-scroller': {
    overflowX: 'auto !important',
    overflowY: 'hidden !important',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--accent-gold, #cfa85c) transparent',
  },
  '&.cm-vertical-rl .cm-scroller::-webkit-scrollbar, .vertical-rl & .cm-scroller::-webkit-scrollbar': {
    height: '8px',
  },
  '&.cm-vertical-rl .cm-scroller::-webkit-scrollbar-thumb, .vertical-rl & .cm-scroller::-webkit-scrollbar-thumb': {
    background: 'var(--accent-gold, #cfa85c)',
    borderRadius: '4px',
  },
});

export function verticalWritingExtension(): Extension {
  return [
    verticalWritingPlugin,
    verticalMouseHandler,
    verticalWheelHandler,
    verticalArrowNavigationKeymap,
    tabIndentKeymap,
    verticalScrollTheme,
  ];
}
