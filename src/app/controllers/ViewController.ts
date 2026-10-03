import { EditorView } from '@codemirror/view';
import type { Compartment } from '@codemirror/state';
import {
  rubyDecorationExtension,
  setRubyDisplayMode,
  type RubyDisplayMode,
} from '../../core/editor/RubyDecorationExtension.js';
import { wrapSelectionWithRuby } from '../../core/editor/RubyShortcutExtension.js';
import { FontSizeControl } from '../../ui/FontSizeControl.js';
import type { ColumnGuideline } from '../../ui/ColumnGuideline.js';
import type { FullscreenStatusBar } from '../../ui/FullscreenStatusBar.js';

export interface ViewControllerDependencies {
  getEditorView: () => EditorView | null;
  getEditorBody: () => HTMLDivElement | null;
  getWrapCompartment: () => Compartment;
  getRubyCompartment: () => Compartment;
  getColumnGuideline: () => ColumnGuideline | null;
  getFullscreenStatusBar: () => FullscreenStatusBar | null;
  getFontSize: () => string;
  getKinsokuColumns: () => number;
  saveToStorage: () => void;
  showToast: (msg: string) => void;
}

export class ViewController {
  private deps: ViewControllerDependencies;
  private isVertical = true;
  private isNightTheme = false;
  private isFullscreen = false;
  private isLineWrapping = true;
  private rubyMode: RubyDisplayMode = 'normal';

  constructor(deps: ViewControllerDependencies) {
    this.deps = deps;
  }

  public getIsVertical(): boolean {
    return this.isVertical;
  }

  public setIsVertical(vertical: boolean): void {
    this.isVertical = vertical;
  }

  public getIsNightTheme(): boolean {
    return this.isNightTheme;
  }

  public setIsNightTheme(night: boolean): void {
    this.isNightTheme = night;
  }

  public getIsFullscreen(): boolean {
    return this.isFullscreen;
  }

  public getIsLineWrapping(): boolean {
    return this.isLineWrapping;
  }

  public setIsLineWrapping(wrapping: boolean): void {
    this.isLineWrapping = wrapping;
  }

  public getRubyMode(): RubyDisplayMode {
    return this.rubyMode;
  }

  public setRubyMode(mode: RubyDisplayMode): void {
    this.rubyMode = mode;
  }

  public applyOrientation(): void {
    const center = document.getElementById('paneCenter');
    const btn = document.getElementById('btnToggleOrientation');
    const wrapper = document.getElementById('canvasWrapper');
    const editorBody = this.deps.getEditorBody();
    const cm = this.deps.getEditorView();
    const btnIndent = document.getElementById('btnQuickIndent');

    if (this.isVertical) {
      center?.classList.add('vertical-rl');
      if (editorBody) editorBody.classList.add('vertical-rl');
      if (btn) btn.textContent = '横書き';
      if (btnIndent) btnIndent.textContent = '⤓ 字下げ';
      if (cm) {
        cm.dom.classList.add('cm-vertical-rl');
        cm.requestMeasure();
      }
      if (wrapper) {
        requestAnimationFrame(() => {
          wrapper.scrollLeft = wrapper.scrollWidth;
        });
      }
    } else {
      center?.classList.remove('vertical-rl');
      if (editorBody) editorBody.classList.remove('vertical-rl');
      if (btn) btn.textContent = '縦書き';
      if (btnIndent) btnIndent.textContent = '⇥ 字下げ';
      if (cm) {
        cm.dom.classList.remove('cm-vertical-rl');
        cm.requestMeasure();
      }
      if (wrapper) {
        requestAnimationFrame(() => {
          wrapper.scrollLeft = 0;
        });
      }
    }

    const guideline = this.deps.getColumnGuideline();
    if (guideline) {
      guideline.setVertical(this.isVertical);
    }
    this.updateEditorWidth();
  }

  public toggleOrientation(): void {
    this.isVertical = !this.isVertical;
    this.applyOrientation();
    this.deps.saveToStorage();
    this.deps.showToast(`執筆方向を「${this.isVertical ? '縦書き' : '横書き'}」に切り替えました`);
  }

  public updateEditorWidth(): void {
    const editorBody = this.deps.getEditorBody();
    if (!editorBody) return;
    if (this.isVertical) {
      editorBody.style.maxWidth = '';
      editorBody.style.width = 'max-content';
      return;
    }
    const currentSize = FontSizeControl.clampFontSize(this.deps.getFontSize());
    const pitchWidth = currentSize * 1.03;
    const totalWidthPx = Math.ceil(this.deps.getKinsokuColumns() * pitchWidth + 96 + 16);
    editorBody.style.maxWidth = `${totalWidthPx}px`;
    editorBody.style.width = '100%';
  }

  public toggleWrap(): void {
    this.isLineWrapping = !this.isLineWrapping;
    const cm = this.deps.getEditorView();
    if (cm) {
      cm.dispatch({
        effects: this.deps.getWrapCompartment().reconfigure(this.isLineWrapping ? EditorView.lineWrapping : []),
      });
    }

    const editorBody = this.deps.getEditorBody();
    if (editorBody) {
      editorBody.classList.toggle('wrap-active', this.isLineWrapping);
      editorBody.classList.toggle('no-wrap', !this.isLineWrapping);
    }

    const btn = document.getElementById('btnToggleWrap');
    if (btn) {
      btn.textContent = `折り返し: ${this.isLineWrapping ? 'ON' : 'OFF'}`;
    }

    this.deps.saveToStorage();
    this.deps.showToast(`📐 文字折り返しを「${this.isLineWrapping ? 'ON' : 'OFF'}」に設定しました`);
  }

  public getRubyButtonLabel(): string {
    switch (this.rubyMode) {
      case 'normal':
        return 'ルビ: 通常';
      case 'raw':
        return 'ルビ: 記法直接';
      case 'off':
        return 'ルビ: OFF';
    }
  }

  public toggleRuby(): void {
    if (this.rubyMode === 'normal') {
      this.rubyMode = 'raw';
    } else if (this.rubyMode === 'raw') {
      this.rubyMode = 'off';
    } else {
      this.rubyMode = 'normal';
    }

    const cm = this.deps.getEditorView();
    if (cm) {
      cm.dispatch({
        effects: [
          this.deps.getRubyCompartment().reconfigure(
            this.rubyMode === 'raw'
              ? []
              : rubyDecorationExtension({ mode: this.rubyMode, expandOnCursor: true })
          ),
          setRubyDisplayMode.of(this.rubyMode),
        ],
      });
      cm.requestMeasure();
    }

    const btn = document.getElementById('btnToggleRuby');
    if (btn) {
      btn.textContent = this.getRubyButtonLabel();
    }

    this.deps.saveToStorage();

    const desc =
      this.rubyMode === 'normal'
        ? '通常ルビ (リッチ表示)'
        : this.rubyMode === 'raw'
        ? '青空文庫ルビ表記 (直接入力)'
        : 'ルビOFF (隠蔽モード・親文字のみ)';
    this.deps.showToast(`📖 ルビ表示を「${desc}」に設定しました`);
  }

  public applyTheme(): void {
    const center = document.getElementById('paneCenter');
    const btn = document.getElementById('btnToggleTheme');
    const container = document.querySelector('.app-container');

    if (this.isNightTheme) {
      document.body.classList.remove('theme-washi');
      document.body.classList.add('theme-night');
      container?.classList.remove('theme-washi');
      container?.classList.add('theme-night');
      center?.classList.add('theme-night');
      if (btn) btn.textContent = '📜 和紙色';
    } else {
      document.body.classList.remove('theme-night');
      document.body.classList.add('theme-washi');
      container?.classList.remove('theme-night');
      container?.classList.add('theme-washi');
      center?.classList.remove('theme-night');
      if (btn) btn.textContent = '🌙 夜間色';
    }

    const btnWrap = document.getElementById('btnToggleWrap');
    if (btnWrap) {
      btnWrap.textContent = `折り返し: ${this.isLineWrapping ? 'ON' : 'OFF'}`;
    }
  }

  public toggleTheme(): void {
    this.isNightTheme = !this.isNightTheme;
    this.applyTheme();
    this.deps.saveToStorage();
  }

  public toggleFullscreen(enable: boolean): void {
    this.isFullscreen = enable;
    const statusBar = this.deps.getFullscreenStatusBar();
    if (statusBar) {
      statusBar.setFullscreen(enable);
    }
    if (enable) {
      document.body.classList.add('fullscreen-active');
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      document.body.classList.remove('fullscreen-active');
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  public initQuickFormatButtons(): void {
    document.getElementById('btnQuickRuby')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (cm) {
        wrapSelectionWithRuby(cm);
        cm.focus();
      }
    });

    document.getElementById('btnQuickBouten')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (cm) {
        const state = cm.state;
        const sel = state.selection.main;
        const selectedText = state.sliceDoc(sel.from, sel.to) || '';
        if (selectedText) {
          cm.dispatch({
            changes: { from: sel.from, to: sel.to, insert: `《《${selectedText}》》` },
            selection: { anchor: sel.from + selectedText.length + 4 },
          });
        } else {
          cm.dispatch({
            changes: { from: sel.from, to: sel.to, insert: `《《》》` },
            selection: { anchor: sel.from + 2 },
          });
        }
        cm.focus();
      }
    });

    document.getElementById('btnQuickBold')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (cm) {
        const state = cm.state;
        const sel = state.selection.main;
        const selectedText = state.sliceDoc(sel.from, sel.to) || '';
        cm.dispatch({
          changes: { from: sel.from, to: sel.to, insert: `**${selectedText}**` },
          selection: { anchor: sel.from + (selectedText ? selectedText.length + 4 : 2) },
        });
        cm.focus();
      }
    });

    document.getElementById('btnQuickIndent')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (cm) {
        cm.dispatch(cm.state.replaceSelection('　'));
        cm.focus();
      }
    });
  }

  public initDecorationLegend(): void {
    const btnLegend = document.getElementById('btnToggleLegendCard');
    const panel = document.getElementById('decorationLegendPanel');
    if (!btnLegend || !panel) return;

    btnLegend.addEventListener('click', () => {
      const isHidden = panel.style.display === 'none';
      panel.style.display = isHidden ? 'block' : 'none';
      btnLegend.textContent = isHidden ? '凡例 ▴' : '凡例 ▾';
    });
  }
}
