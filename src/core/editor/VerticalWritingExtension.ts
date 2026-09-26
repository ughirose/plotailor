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

class VerticalWritingPlugin {
  constructor(view: EditorView) {
    this.patchViewState(view);
  }

  update(update: ViewUpdate) {
    this.patchViewState(update.view);
  }

  private patchViewState(view: EditorView) {
    const vs = (view as any).viewState;
    if (!vs || vs._verticalWritingPatched) return;
    vs._verticalWritingPatched = true;

    const originalGetViewport = vs.getViewport;
    const originalViewportIsAppropriate = vs.viewportIsAppropriate;

    vs.getViewport = function (bias: any, scrollTarget: any) {
      const isVertical =
        view.dom.closest('.vertical-rl') !== null ||
        view.dom.classList.contains('cm-vertical-rl') ||
        view.scrollDOM.classList.contains('cm-vertical-rl');

      if (isVertical) {
        // Return full document range as a single viewport to prevent BlockGapWidget creation
        const ViewportClass = this.viewport.constructor;
        return new ViewportClass(0, this.state.doc.length);
      }
      return originalGetViewport.call(this, bias, scrollTarget);
    };

    vs.viewportIsAppropriate = function (vp: any, bias: any) {
      const isVertical =
        view.dom.closest('.vertical-rl') !== null ||
        view.dom.classList.contains('cm-vertical-rl') ||
        view.scrollDOM.classList.contains('cm-vertical-rl');

      if (isVertical) {
        return vp.from === 0 && vp.to === this.state.doc.length;
      }
      return originalViewportIsAppropriate.call(this, vp, bias);
    };
  }
}

export const verticalWritingPlugin = ViewPlugin.fromClass(VerticalWritingPlugin);

export function verticalWritingExtension(): Extension {
  return [verticalWritingPlugin];
}
