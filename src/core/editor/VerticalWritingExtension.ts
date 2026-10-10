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
import { VerticalKeyNavigationEngine } from './VerticalKeyNavigationEngine.js';
import { verticalImeGeometryFollower } from './VerticalImeGeometryFollower.js';

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

    if (targetNode && view.dom.contains(targetNode) && targetNode !== view.contentDOM && targetNode !== view.dom) {
      try {
        const el = targetNode instanceof Element ? targetNode : targetNode.parentElement;
        if (el) {
          const bRect = el.getBoundingClientRect();
          // Verify that targetNode is actually within plausible distance of coords.x and coords.y
          const xTolerance = Math.max(36, (bRect.width || 24) * 1.5);
          if (coords.x >= bRect.left - xTolerance && coords.x <= bRect.right + xTolerance) {
            const docPos = view.posAtDOM(targetNode, targetOffset);
            if (typeof docPos === 'number') {
              return docPos;
            }
          }
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

  if (lineBoxes.length === 0) return view.state.selection.main.head;

  // Check if click is beyond the leftmost column (past end of document in vertical-rl)
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const b of lineBoxes) {
    if (b.rect.left < minLeft) minLeft = b.rect.left;
    if (b.rect.right > maxRight) maxRight = b.rect.right;
  }

  if (coords.x < minLeft) {
    // Clicked in empty space to the left of the last column: project onto last column according to Y coordinate
    const lastBox = lineBoxes.reduce((prev, curr) => (curr.rect.left < prev.rect.left ? curr : prev), lineBoxes[0]);
    const lastLine = view.state.doc.lineAt(lastBox.pos);
    if (coords.y <= lastBox.rect.top) return lastLine.from;
    if (coords.y >= lastBox.rect.bottom) return lastLine.to;
    const height = lastBox.rect.height || 1;
    const progress = Math.max(0, Math.min(1, (coords.y - lastBox.rect.top) / height));
    const charOffset = Math.round(progress * lastLine.length);
    return Math.min(lastLine.to, lastLine.from + charOffset);
  }
  if (coords.x > maxRight) {
    // Clicked to the right of the first column: project onto first column according to Y coordinate
    const firstBox = lineBoxes.reduce((prev, curr) => (curr.rect.right > prev.rect.right ? curr : prev), lineBoxes[0]);
    const firstLine = view.state.doc.lineAt(firstBox.pos);
    if (coords.y <= firstBox.rect.top) return firstLine.from;
    if (coords.y >= firstBox.rect.bottom) return firstLine.to;
    const height = firstBox.rect.height || 1;
    const progress = Math.max(0, Math.min(1, (coords.y - firstBox.rect.top) / height));
    const charOffset = Math.round(progress * firstLine.length);
    return Math.min(firstLine.to, firstLine.from + charOffset);
  }

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

let activeDragAnchor: number | null = null;
let dragMoveListener: ((e: MouseEvent) => void) | null = null;
let dragUpListener: (() => void) | null = null;

function cleanupDragListeners() {
  if (typeof window !== 'undefined') {
    if (dragMoveListener) window.removeEventListener('mousemove', dragMoveListener);
    if (dragUpListener) window.removeEventListener('mouseup', dragUpListener);
  }
  activeDragAnchor = null;
  dragMoveListener = null;
  dragUpListener = null;
}

/**
 * Event handler for mouse/pointer clicks and drag selection in vertical writing mode.
 * Accurately sets selection anchor and tracks mouse drag without horizontal coordinate misalignment.
 */
const verticalMouseHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    if (!isVerticalMode(view) || event.button !== 0) return false;
    const coords = { x: event.clientX, y: event.clientY };
    const pos = getVerticalPosAtCoords(view, coords);
    if (pos !== null) {
      const anchor = event.shiftKey ? view.state.selection.main.anchor : pos;
      view.dispatch({
        selection: { anchor, head: pos },
        userEvent: 'select.pointer',
      });
      view.focus();

      cleanupDragListeners();
      activeDragAnchor = anchor;

      if (typeof window !== 'undefined') {
        dragMoveListener = (moveEvent: MouseEvent) => {
          if (activeDragAnchor === null) return;
          if ((moveEvent.buttons & 1) === 0) {
            cleanupDragListeners();
            return;
          }

          // Auto-scroll canvas wrapper when dragging near edges
          const canvasWrapper = view.dom.closest('.canvas-wrapper') as HTMLElement | null;
          if (canvasWrapper) {
            const rect = canvasWrapper.getBoundingClientRect();
            const edgeThreshold = 50;
            const scrollSpeed = 15;
            if (moveEvent.clientX < rect.left + edgeThreshold) {
              canvasWrapper.scrollLeft -= scrollSpeed;
            } else if (moveEvent.clientX > rect.right - edgeThreshold) {
              canvasWrapper.scrollLeft += scrollSpeed;
            }
          }

          const movePos = getVerticalPosAtCoords(view, { x: moveEvent.clientX, y: moveEvent.clientY });
          if (movePos !== null) {
            view.dispatch({
              selection: { anchor: activeDragAnchor, head: movePos },
              userEvent: 'select.pointer',
            });
          }
        };

        dragUpListener = () => {
          cleanupDragListeners();
        };

        window.addEventListener('mousemove', dragMoveListener);
        window.addEventListener('mouseup', dragUpListener);
      }

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
    // canvasWrapper が存在する場合は main.ts の ScrollNormalizer が正規化処理を行うため二重発火を抑止
    const canvasWrapper = (view.dom.closest('.canvas-wrapper') || document.getElementById('canvasWrapper')) as HTMLElement | null;
    if (canvasWrapper) {
      return false;
    }
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
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  select: boolean = false
): boolean {
  if (!isVerticalMode(view)) return false;
  const doc = view.state.doc;
  const sel = view.state.selection.main;
  const currentPos = sel.head;
  const currentAnchor = sel.anchor;

  let targetPos = currentPos;

  if (key === 'ArrowUp') {
    // 視覚的な上＝直前の文字へ移動
    if (currentPos > 0) {
      targetPos = currentPos - 1;
    }
  } else if (key === 'ArrowDown') {
    // 視覚的な下＝直後の文字へ移動
    if (currentPos < doc.length) {
      targetPos = currentPos + 1;
    }
  } else if (key === 'ArrowLeft') {
    // 視覚的な左＝左隣の列（次の行/列）の同位置へ幾何学的に移動
    let moved = false;
    const rect = view.coordsAtPos(currentPos);
    if (rect) {
      const charHeight = Math.max(12, rect.bottom - rect.top);
      const columnStep = charHeight * 2.2;
      const targetX = rect.left - columnStep;
      const targetY = (rect.top + rect.bottom) / 2;
      const geoPos = view.posAtCoords({ x: targetX, y: targetY });
      if (geoPos !== null && geoPos !== currentPos) {
        targetPos = geoPos;
        moved = true;
      }
    }
    if (!moved) {
      const nav = VerticalKeyNavigationEngine.calculateNavigation({
        text: doc.toString(),
        cursorOffset: currentPos,
        key: 'ArrowLeft',
      });
      targetPos = nav.newOffset;
    }
  } else if (key === 'ArrowRight') {
    // 視覚的な右＝右隣の列（前の行/列）の同位置へ幾何学的に移動
    let moved = false;
    const rect = view.coordsAtPos(currentPos);
    if (rect) {
      const charHeight = Math.max(12, rect.bottom - rect.top);
      const columnStep = charHeight * 2.2;
      const targetX = rect.right + columnStep;
      const targetY = (rect.top + rect.bottom) / 2;
      const geoPos = view.posAtCoords({ x: targetX, y: targetY });
      if (geoPos !== null && geoPos !== currentPos) {
        targetPos = geoPos;
        moved = true;
      }
    }
    if (!moved) {
      const nav = VerticalKeyNavigationEngine.calculateNavigation({
        text: doc.toString(),
        cursorOffset: currentPos,
        key: 'ArrowRight',
      });
      targetPos = nav.newOffset;
    }
  }

  if (targetPos !== currentPos || (select && currentAnchor !== currentPos)) {
    view.dispatch({
      selection: {
        anchor: select ? currentAnchor : targetPos,
        head: targetPos,
      },
      scrollIntoView: true,
      userEvent: 'select',
    });
  }
  return true;
}

function handleVerticalHome(view: EditorView, select: boolean = false): boolean {
  if (!isVerticalMode(view)) return false;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const targetPos = line.from;
  view.dispatch({
    selection: {
      anchor: select ? sel.anchor : targetPos,
      head: targetPos,
    },
    scrollIntoView: true,
    userEvent: 'select',
  });
  return true;
}

function handleVerticalEnd(view: EditorView, select: boolean = false): boolean {
  if (!isVerticalMode(view)) return false;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const targetPos = line.to;
  view.dispatch({
    selection: {
      anchor: select ? sel.anchor : targetPos,
      head: targetPos,
    },
    scrollIntoView: true,
    userEvent: 'select',
  });
  return true;
}

export const verticalArrowNavigationKeymap = Prec.highest(
  keymap.of([
    {
      key: 'ArrowUp',
      run: (view: EditorView) => handleVerticalArrow(view, 'ArrowUp', false),
      shift: (view: EditorView) => handleVerticalArrow(view, 'ArrowUp', true),
    },
    {
      key: 'ArrowDown',
      run: (view: EditorView) => handleVerticalArrow(view, 'ArrowDown', false),
      shift: (view: EditorView) => handleVerticalArrow(view, 'ArrowDown', true),
    },
    {
      key: 'ArrowLeft',
      run: (view: EditorView) => handleVerticalArrow(view, 'ArrowLeft', false),
      shift: (view: EditorView) => handleVerticalArrow(view, 'ArrowLeft', true),
    },
    {
      key: 'ArrowRight',
      run: (view: EditorView) => handleVerticalArrow(view, 'ArrowRight', false),
      shift: (view: EditorView) => handleVerticalArrow(view, 'ArrowRight', true),
    },
    {
      key: 'Home',
      run: (view: EditorView) => handleVerticalHome(view, false),
      shift: (view: EditorView) => handleVerticalHome(view, true),
    },
    {
      key: 'End',
      run: (view: EditorView) => handleVerticalEnd(view, false),
      shift: (view: EditorView) => handleVerticalEnd(view, true),
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
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.from);

      // If line is empty or already starts with full-width space, just insert space at cursor
      if (line.text.startsWith('　')) {
        view.dispatch(view.state.replaceSelection('　'));
        return true;
      }

      // Check if line is a dialogue line (starts with quotation marks 「, 『, etc.)
      const trimmed = line.text.trimStart();
      const firstChar = trimmed[0] || '';
      const isQuote = ['「', '『', '（', '【', '“', '‘', '《', '〈', '〔', '［', '＜', '«', '"', "'"].includes(firstChar);

      if (isQuote) {
        // Do not force paragraph indent on dialogue lines; normal space insert
        view.dispatch(view.state.replaceSelection('　'));
        return true;
      }

      // Smart indent: prepend full-width space at the start of the line
      view.dispatch({
        changes: { from: line.from, to: line.from, insert: '　' },
        selection: { anchor: sel.from + 1, head: sel.to + 1 },
      });
      return true;
    },
    shift: (view: EditorView) => {
      if (!isAutoIndentEnabled) return false;
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.from);
      if (line.text.startsWith('　') || line.text.startsWith(' ') || line.text.startsWith('\t')) {
        const newAnchor = Math.max(line.from, sel.anchor - 1);
        const newHead = Math.max(line.from, sel.head - 1);
        view.dispatch({
          changes: { from: line.from, to: line.from + 1, insert: '' },
          selection: { anchor: newAnchor, head: newHead },
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
    verticalImeGeometryFollower(),
    verticalMouseHandler,
    verticalWheelHandler,
    verticalArrowNavigationKeymap,
    tabIndentKeymap,
    verticalScrollTheme,
  ];
}
