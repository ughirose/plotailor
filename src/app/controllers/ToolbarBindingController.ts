import type { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { wrapSelectionWithRuby } from '../../core/editor/RubyShortcutExtension.js';
import { setAutoIndentEnabled } from '../../core/editor/VerticalWritingExtension.js';
import type { ColumnGuideline } from '../../ui/ColumnGuideline.js';

export interface ToolbarBindingDependencies {
  getEditorView: () => EditorView | null;
  updateHistoryUI: () => void;
  showToast: (msg: string) => void;
  isAutoIndent: () => boolean;
  setAutoIndent: (enabled: boolean) => void;
  getColumnGuideline: () => ColumnGuideline | null;
  getKinsokuHanging: () => boolean;
  setKinsokuHanging: (hanging: boolean) => void;
  setActiveRightTab: (tab: string) => void;
  renderRightPane: () => void;
}

export class ToolbarBindingController {
  private deps: ToolbarBindingDependencies;

  constructor(deps: ToolbarBindingDependencies) {
    this.deps = deps;
  }

  public bindToolbarButtons(): void {
    // 1. Undo & Redo Handlers
    const handleUndo = () => {
      const cm = this.deps.getEditorView();
      if (cm) {
        undo(cm);
        this.deps.updateHistoryUI();
        cm.focus();
      }
    };
    const handleRedo = () => {
      const cm = this.deps.getEditorView();
      if (cm) {
        redo(cm);
        this.deps.updateHistoryUI();
        cm.focus();
      }
    };
    document.getElementById('btnToolbarUndo')?.addEventListener('click', handleUndo);
    document.getElementById('btnToolbarRedo')?.addEventListener('click', handleRedo);
    document.getElementById('btnHeaderUndo')?.addEventListener('click', handleUndo);
    document.getElementById('btnHeaderRedo')?.addEventListener('click', handleRedo);

    // 2. Ruby & Bouten Quick Handlers
    document.getElementById('btnQuickRuby')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (cm) {
        wrapSelectionWithRuby(cm);
        cm.focus();
      }
    });

    document.getElementById('btnQuickBouten')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (!cm) return;
      const sel = cm.state.selection.main;
      if (sel.from === sel.to) {
        this.deps.showToast('ℹ️ 傍点を振るテキストを選択してください');
        return;
      }
      const text = cm.state.doc.sliceString(sel.from, sel.to);
      const replacement = `《《${text}》》`;
      cm.dispatch({
        changes: { from: sel.from, to: sel.to, insert: replacement },
        selection: { anchor: sel.from + replacement.length },
      });
      cm.focus();
      this.deps.showToast('︙ 傍点を付与しました');
    });

    // 3. Heading Toolbar Handler (Aozora & Markdown Heading Cycling)
    document.getElementById('btnQuickHeading')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (!cm) return;
      const sel = cm.state.selection.main;
      const line = cm.state.doc.lineAt(sel.from);
      const lineText = line.text;
      const trimmed = lineText.trim();

      // Check current heading type and cycle: None -> 大見出し (#) -> 中見出し (##) -> 小見出し (###) -> None
      if (trimmed.startsWith('［＃大見出し］') && trimmed.endsWith('［＃大見出し終わり］')) {
        const inner = trimmed.slice('［＃大見出し］'.length, -'［＃大見出し終わり］'.length);
        const replacement = `［＃中見出し］${inner}［＃中見出し終わり］`;
        cm.dispatch({
          changes: { from: line.from, to: line.to, insert: replacement },
          selection: { anchor: line.from + replacement.length },
        });
        this.deps.showToast('🔖 中見出し（レベル2）に変更しました');
      } else if (trimmed.startsWith('［＃中見出し］') && trimmed.endsWith('［＃中見出し終わり］')) {
        const inner = trimmed.slice('［＃中見出し］'.length, -'［＃中見出し終わり］'.length);
        const replacement = `［＃小見出し］${inner}［＃小見出し終わり］`;
        cm.dispatch({
          changes: { from: line.from, to: line.to, insert: replacement },
          selection: { anchor: line.from + replacement.length },
        });
        this.deps.showToast('🔖 小見出し（レベル3）に変更しました');
      } else if (trimmed.startsWith('［＃小見出し］') && trimmed.endsWith('［＃小見出し終わり］')) {
        const inner = trimmed.slice('［＃小見出し］'.length, -'［＃小見出し終わり］'.length);
        cm.dispatch({
          changes: { from: line.from, to: line.to, insert: inner },
          selection: { anchor: line.from + inner.length },
        });
        this.deps.showToast('🔖 見出しを解除しました');
      } else if (/^#\s+/.test(trimmed)) {
        const inner = trimmed.replace(/^#\s+/, '');
        const replacement = `## ${inner}`;
        cm.dispatch({
          changes: { from: line.from, to: line.to, insert: replacement },
          selection: { anchor: line.from + replacement.length },
        });
        this.deps.showToast('🔖 Markdown ##（レベル2）に変更しました');
      } else if (/^##\s+/.test(trimmed)) {
        const inner = trimmed.replace(/^##\s+/, '');
        const replacement = `### ${inner}`;
        cm.dispatch({
          changes: { from: line.from, to: line.to, insert: replacement },
          selection: { anchor: line.from + replacement.length },
        });
        this.deps.showToast('🔖 Markdown ###（レベル3）に変更しました');
      } else if (/^###\s+/.test(trimmed)) {
        const inner = trimmed.replace(/^###\s+/, '');
        cm.dispatch({
          changes: { from: line.from, to: line.to, insert: inner },
          selection: { anchor: line.from + inner.length },
        });
        this.deps.showToast('🔖 Markdown 見出しを解除しました');
      } else {
        const content = (sel.from === sel.to ? trimmed : cm.state.doc.sliceString(sel.from, sel.to)) || '大見出し';
        const replacement = `［＃大見出し］${content}［＃大見出し終わり］`;
        cm.dispatch({
          changes: { from: line.from, to: line.to, insert: replacement },
          selection: { anchor: line.from + replacement.length },
        });
        this.deps.showToast('🔖 大見出し（レベル1）を設定しました');
      }
      cm.focus();
    });

    // 4. Bold Handler
    document.getElementById('btnQuickBold')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (!cm) return;
      const sel = cm.state.selection.main;
      if (sel.from === sel.to) {
        this.deps.showToast('ℹ️ 太字にするテキストを選択してください');
        return;
      }
      const text = cm.state.doc.sliceString(sel.from, sel.to);
      const replacement = `**${text}**`;
      cm.dispatch({
        changes: { from: sel.from, to: sel.to, insert: replacement },
        selection: { anchor: sel.from + replacement.length },
      });
      cm.focus();
      this.deps.showToast('B 太字を付与しました');
    });

    // 5. Automatic Indent Mode Toggle
    const updateIndentButtonUI = () => {
      const btn = document.getElementById('btnQuickIndent');
      if (btn) {
        const active = this.deps.isAutoIndent();
        btn.classList.toggle('active', active);
        btn.title = `段落字下げ: ${active ? 'ON (改行時自動一字下げ)' : 'OFF'}`;
        const lbl = btn.querySelector('.btn-label');
        if (lbl) lbl.textContent = `字下げ: ${active ? 'ON' : 'OFF'}`;
      }
    };
    updateIndentButtonUI();

    document.getElementById('btnQuickIndent')?.addEventListener('click', () => {
      const cm = this.deps.getEditorView();
      if (!cm) return;
      const sel = cm.state.selection.main;
      if (sel.from !== sel.to) {
        const line = cm.state.doc.lineAt(sel.from);
        if (line.text.startsWith('　')) {
          cm.dispatch({ changes: { from: line.from, to: line.from + 1, insert: '' } });
          this.deps.showToast('⇥ 字下げを解除しました');
        } else {
          cm.dispatch({ changes: { from: line.from, to: line.from, insert: '　' } });
          this.deps.showToast('⇥ 字下げ（全角空白）を挿入しました');
        }
      } else {
        const next = !this.deps.isAutoIndent();
        this.deps.setAutoIndent(next);
        setAutoIndentEnabled(next);
        try { localStorage.setItem('plotailor_auto_indent', next.toString()); } catch {}
        updateIndentButtonUI();
        this.deps.showToast(`⇥ 自動字下げを ${next ? '有効' : '無効'} にしました`);
      }
      cm.focus();
    });

    // 6. Guideline Toggle
    const updateGuidelineButtonUI = () => {
      const btn = document.getElementById('btnToggleGuideline');
      const guideline = this.deps.getColumnGuideline();
      if (btn && guideline) {
        const vis = guideline.isVisible();
        btn.classList.toggle('active', vis);
        btn.title = `40字ガイドライン: ${vis ? '表示中 (クリックで非表示)' : '非表示 (クリックで表示)'}`;
        btn.textContent = `📐 40字: ${vis ? 'ON' : 'OFF'}`;
      }
    };
    updateGuidelineButtonUI();

    const toggleGuidelineAction = () => {
      const guideline = this.deps.getColumnGuideline();
      if (!guideline) return;
      const next = !guideline.isVisible();
      guideline.setVisible(next);
      updateGuidelineButtonUI();
      this.deps.showToast(`📐 40字ガイドラインを ${next ? '表示' : '非表示'} にしました`);
    };

    document.getElementById('btnToggleGuideline')?.addEventListener('click', toggleGuidelineAction);
    document.getElementById('cursorPosBadge')?.addEventListener('click', toggleGuidelineAction);

    // 7. Hanging Punctuation Toggle
    const updateHangingButtonUI = () => {
      const btn = document.getElementById('btnToggleHanging');
      if (btn) {
        const active = this.deps.getKinsokuHanging();
        btn.classList.toggle('active', active);
        btn.title = `句読点・閉じ括弧のぶら下げ表示: ${active ? 'ON (行末+1字許容)' : 'OFF'}`;
        btn.textContent = `⤵ ぶら下げ: ${active ? 'ON' : 'OFF'}`;
      }
    };
    updateHangingButtonUI();

    document.getElementById('btnToggleHanging')?.addEventListener('click', () => {
      const next = !this.deps.getKinsokuHanging();
      this.deps.setKinsokuHanging(next);
      updateHangingButtonUI();
      this.deps.showToast(`⤵ ぶら下げ表示を ${next ? 'ON' : 'OFF'} にしました`);
    });

    // 8. History depth badge -> right pane tab switch
    document.getElementById('historyDepthBadge')?.addEventListener('click', () => {
      this.deps.setActiveRightTab('history');
      const paneRight = document.getElementById('paneRight');
      if (paneRight && paneRight.style.display === 'none') {
        paneRight.style.display = '';
      }
      this.deps.renderRightPane();
    });
  }
}
