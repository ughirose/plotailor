// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Editor Writing Indicators & Column Guideline Dynamic Integration (Phase 1)', () => {
  let html: string;

  beforeEach(() => {
    localStorage.clear();
    html = fs.readFileSync(path.resolve(__dirname, '../app.html'), 'utf-8');
    document.documentElement.innerHTML = html;

    if (!document.createRange) {
      document.createRange = () => ({
        setStart: () => {},
        setEnd: () => {},
        commonAncestorContainer: document.body,
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        getClientRects: () => [],
      } as any);
    }
  });

  describe('DOM Structure Specification', () => {
    it('contains all required caret position and overflow elements in the footer', () => {
      const badge = document.getElementById('cursorPosBadge');
      const line = document.getElementById('cursorLine');
      const col = document.getElementById('cursorCol');
      const maxCol = document.getElementById('cursorMaxCol');
      const overflow = document.getElementById('cursorOverflowBadge');
      const footerChar = document.getElementById('charCountFooter');

      expect(badge).not.toBeNull();
      expect(badge?.classList.contains('cursor-pos-badge')).toBe(true);
      expect(line).not.toBeNull();
      expect(col).not.toBeNull();
      expect(maxCol).not.toBeNull();
      expect(overflow).not.toBeNull();
      expect(footerChar).not.toBeNull();

      expect(maxCol?.textContent).toBe('40');
    });
  });

  describe('PlotailorApp Live Synchronization', () => {
    it('initializes with default L1 C1/40 and synchronized footer/fullscreen metrics', async () => {
      const { PlotailorApp } = await import('../src/app/main.js');
      const app = new PlotailorApp();

      const line = document.getElementById('cursorLine');
      const col = document.getElementById('cursorCol');
      const maxCol = document.getElementById('cursorMaxCol');
      const badge = document.getElementById('cursorPosBadge');
      const overflow = document.getElementById('cursorOverflowBadge');

      expect(line?.textContent).toBe('1');
      expect(col?.textContent).toBe('1');
      expect(maxCol?.textContent).toBe('40');
      expect(badge?.classList.contains('is-overflow')).toBe(false);
      expect(overflow?.style.display).toBe('none');

      // Guideline sync
      const guideline = app.getColumnGuideline();
      expect(guideline).not.toBeNull();
      expect(guideline?.getColumns()).toBe(40);
      expect(guideline?.getIsOverflow()).toBe(false);

      // FullscreenStatusBar sync
      const statusBar = app.getFullscreenStatusBar();
      expect(statusBar).not.toBeNull();
      const statusState = statusBar?.getState();
      expect(statusState?.characterCount).toBeGreaterThan(0);
      expect(statusState?.manuscriptPages).toBeGreaterThan(0);
    });

    it('dynamically syncs slider changes with cursor max columns and recalculates indicators', async () => {
      const { PlotailorApp } = await import('../src/app/main.js');
      const app = new PlotailorApp();

      const inputCols = document.getElementById('settingKinsokuColumns') as HTMLInputElement;
      const maxCol = document.getElementById('cursorMaxCol');
      const guideline = app.getColumnGuideline();

      // Change columns to 35
      inputCols.value = '35';
      inputCols.dispatchEvent(new Event('input'));

      expect(app.getKinsokuColumns()).toBe(35);
      expect(maxCol?.textContent).toBe('35');
      expect(guideline?.getColumns()).toBe(35);

      // Change columns to 45
      inputCols.value = '45';
      inputCols.dispatchEvent(new Event('input'));

      expect(app.getKinsokuColumns()).toBe(45);
      expect(maxCol?.textContent).toBe('45');
      expect(guideline?.getColumns()).toBe(45);
    });

    it('provides visual warning feedback when line exceeds setting columns', async () => {
      const { PlotailorApp } = await import('../src/app/main.js');
      const app = new PlotailorApp();

      const badge = document.getElementById('cursorPosBadge');
      const overflowBadge = document.getElementById('cursorOverflowBadge');
      const guideline = app.getColumnGuideline();
      const editor = (app as any).cmEditor;

      // Insert line with 45 chars (columns = 40)
      const longLine = 'あ'.repeat(45);
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: longLine },
        selection: { anchor: 45, head: 45 },
      });

      expect(badge?.classList.contains('is-overflow')).toBe(true);
      expect(badge?.classList.contains('is-hanging')).toBe(false);
      expect(overflowBadge?.style.display).toBe('inline-flex');
      expect(overflowBadge?.textContent).toBe('+5字超過');
      expect(guideline?.getIsOverflow()).toBe(true);

      // Test hanging tolerance (41 chars, hanging allowed)
      app.setKinsokuHanging(true);
      const hangingLine = 'あ'.repeat(41);
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: hangingLine },
        selection: { anchor: 41, head: 41 },
      });

      expect(badge?.classList.contains('is-hanging')).toBe(true);
      expect(badge?.classList.contains('is-overflow')).toBe(false);
      expect(overflowBadge?.style.display).toBe('inline-flex');
      expect(overflowBadge?.textContent).toBe('ぶら下げ(+1)');
      expect(guideline?.getIsHanging()).toBe(true);

      // Test normal within bounds (30 chars)
      const normalLine = 'あ'.repeat(30);
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: normalLine },
        selection: { anchor: 30, head: 30 },
      });

      expect(badge?.classList.contains('is-overflow')).toBe(false);
      expect(badge?.classList.contains('is-hanging')).toBe(false);
      expect(overflowBadge?.style.display).toBe('none');
      expect(guideline?.getIsOverflow()).toBe(false);
      expect(guideline?.getIsHanging()).toBe(false);
    });

    it('dynamically harmonizes character count and manuscript pages between footer and FullscreenStatusBar', async () => {
      const { PlotailorApp } = await import('../src/app/main.js');
      const app = new PlotailorApp();

      const editor = (app as any).cmEditor;
      const statusBar = app.getFullscreenStatusBar();
      const footerChar = document.getElementById('charCountFooter');

      // Set exactly 800 Japanese characters (= exactly 2.0 manuscript sheets)
      const sampleContent = '星'.repeat(800);
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: sampleContent },
      });

      const state = statusBar?.getState();
      expect(state?.characterCount).toBe(800);
      expect(state?.manuscriptPages).toBe(2.0);

      expect(footerChar?.innerHTML).toContain('800');
      expect(footerChar?.innerHTML).toContain('2.0');
      expect(footerChar?.innerHTML).toContain('実字換算');
    });
  });
});
