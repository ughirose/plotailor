// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WritingVelocityWidget } from '../src/core/editor/WritingVelocityWidget.js';
import { EditorView } from '../src/web/EditorView.js';

describe('Settings Regulation Integration & LocalStorage Persistence', () => {
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

  describe('WritingVelocityWidget Idle Threshold API', () => {
    it('sets and gets idle threshold via dedicated methods and updateConfig', () => {
      const widget = new WritingVelocityWidget();
      expect(widget.getIdleThreshold()).toBe(60_000);

      widget.setIdleThreshold(30_000);
      expect(widget.getIdleThreshold()).toBe(30_000);

      widget.updateConfig({ idleThresholdMs: 180_000 });
      expect(widget.getIdleThreshold()).toBe(180_000);
    });
  });

  describe('EditorView Regulation API Support', () => {
    it('updates kinsoku columns, hanging, target word count, and idle threshold', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const editorView = new EditorView(container);
      editorView.render();

      // Kinsoku columns
      editorView.setKinsokuColumns(35);
      expect(editorView.getKinsokuEngine().getConfig().columnsPerLine).toBe(35);

      // Hanging
      editorView.setAllowHanging(false);
      expect(editorView.getKinsokuEngine().getConfig().allowHanging).toBe(false);

      // Target word count
      editorView.setTargetWordCount(8000);
      expect(editorView.getFullscreenStatusBar()?.getState().targetWordCount).toBe(8000);

      // Idle threshold
      editorView.setIdleThreshold(30000);
      expect(editorView.getVelocityWidget().getIdleThreshold()).toBe(30000);
    });
  });

  describe('Settings Modal DOM Structure in app.html', () => {
    it('contains all 4 regulation and velocity inputs in settingsModal', () => {
      const colsInput = document.getElementById('settingKinsokuColumns') as HTMLInputElement | null;
      const colsVal = document.getElementById('settingKinsokuColumnsVal');
      const hangingInput = document.getElementById('settingKinsokuHanging') as HTMLInputElement | null;
      const targetInput = document.getElementById('settingTargetWordCount') as HTMLInputElement | null;
      const idleSelect = document.getElementById('settingIdleThreshold') as HTMLSelectElement | null;

      expect(colsInput).not.toBeNull();
      expect(colsInput?.getAttribute('type')).toBe('range');
      expect(colsInput?.getAttribute('min')).toBe('30');
      expect(colsInput?.getAttribute('max')).toBe('50');
      expect(colsInput?.value).toBe('40');

      expect(colsVal).not.toBeNull();
      expect(colsVal?.textContent).toBe('40字');

      expect(hangingInput).not.toBeNull();
      expect(hangingInput?.getAttribute('type')).toBe('checkbox');
      expect(hangingInput?.checked).toBe(true);

      expect(targetInput).not.toBeNull();
      expect(targetInput?.getAttribute('type')).toBe('number');
      expect(targetInput?.getAttribute('min')).toBe('1000');
      expect(targetInput?.getAttribute('max')).toBe('50000');
      expect(targetInput?.value).toBe('5000');

      expect(idleSelect).not.toBeNull();
      expect(idleSelect?.value).toBe('60000');
      const options = Array.from(idleSelect?.options ?? []).map((o) => o.value);
      expect(options).toEqual(['30000', '60000', '180000']);
    });
  });

  describe('PlotailorApp Integration & LocalStorage Persistence', () => {
    it('initializes with default values when LocalStorage is empty', async () => {
      const { PlotailorApp } = await import('../src/app/main.js');
      const app = new PlotailorApp();

      expect(app.getKinsokuColumns()).toBe(40);
      expect(app.getKinsokuHanging()).toBe(false);
      expect(app.getTargetWordCount()).toBe(5000);
      expect(app.getIdleThresholdMs()).toBe(60000);

      expect(app.getKinsokuEngine().getConfig().columnsPerLine).toBe(40);
      expect(app.getKinsokuEngine().getConfig().allowHanging).toBe(false);
      expect(app.getFullscreenStatusBar()?.getState().targetWordCount).toBe(5000);
      expect(app.getVelocityWidget().getIdleThreshold()).toBe(60000);
    });

    it('restores regulation settings from LocalStorage on initialization', async () => {
      localStorage.setItem('plotailor_kinsoku_columns', '36');
      localStorage.setItem('plotailor_kinsoku_hanging', 'false');
      localStorage.setItem('plotailor_target_word_count', '12000');
      localStorage.setItem('plotailor_idle_threshold_ms', '180000');

      const { PlotailorApp } = await import('../src/app/main.js');
      const app = new PlotailorApp();

      expect(app.getKinsokuColumns()).toBe(36);
      expect(app.getKinsokuHanging()).toBe(false);
      expect(app.getTargetWordCount()).toBe(12000);
      expect(app.getIdleThresholdMs()).toBe(180000);

      expect(app.getKinsokuEngine().getConfig().columnsPerLine).toBe(36);
      expect(app.getKinsokuEngine().getConfig().allowHanging).toBe(false);
      expect(app.getFullscreenStatusBar()?.getState().targetWordCount).toBe(12000);
      expect(app.getVelocityWidget().getIdleThreshold()).toBe(180000);

      // Verify UI elements updated when openSettingsModal is called
      app.openSettingsModal();
      const colsInput = document.getElementById('settingKinsokuColumns') as HTMLInputElement;
      const colsVal = document.getElementById('settingKinsokuColumnsVal');
      const hangingInput = document.getElementById('settingKinsokuHanging') as HTMLInputElement;
      const targetInput = document.getElementById('settingTargetWordCount') as HTMLInputElement;
      const idleSelect = document.getElementById('settingIdleThreshold') as HTMLSelectElement;

      expect(colsInput.value).toBe('36');
      expect(colsVal?.textContent).toBe('36字');
      expect(hangingInput.checked).toBe(false);
      expect(targetInput.value).toBe('12000');
      expect(idleSelect.value).toBe('180000');
    });

    it('persists to LocalStorage and updates engines when UI settings are modified', async () => {
      const { PlotailorApp } = await import('../src/app/main.js');
      const app = new PlotailorApp();

      const colsInput = document.getElementById('settingKinsokuColumns') as HTMLInputElement;
      const colsVal = document.getElementById('settingKinsokuColumnsVal');
      const hangingInput = document.getElementById('settingKinsokuHanging') as HTMLInputElement;
      const targetInput = document.getElementById('settingTargetWordCount') as HTMLInputElement;
      const idleSelect = document.getElementById('settingIdleThreshold') as HTMLSelectElement;

      // 1. Change columns to 45
      colsInput.value = '45';
      colsInput.dispatchEvent(new Event('input'));
      expect(colsVal?.textContent).toBe('45字');
      expect(app.getKinsokuColumns()).toBe(45);
      expect(app.getKinsokuEngine().getConfig().columnsPerLine).toBe(45);
      expect(localStorage.getItem('plotailor_kinsoku_columns')).toBe('45');

      // 2. Change hanging to false
      hangingInput.checked = false;
      hangingInput.dispatchEvent(new Event('change'));
      expect(app.getKinsokuHanging()).toBe(false);
      expect(app.getKinsokuEngine().getConfig().allowHanging).toBe(false);
      expect(localStorage.getItem('plotailor_kinsoku_hanging')).toBe('false');

      // 3. Change target word count to 15000
      targetInput.value = '15000';
      targetInput.dispatchEvent(new Event('change'));
      expect(app.getTargetWordCount()).toBe(15000);
      expect(app.getFullscreenStatusBar()?.getState().targetWordCount).toBe(15000);
      expect(localStorage.getItem('plotailor_target_word_count')).toBe('15000');

      // 4. Change idle threshold to 30000
      idleSelect.value = '30000';
      idleSelect.dispatchEvent(new Event('change'));
      expect(app.getIdleThresholdMs()).toBe(30000);
      expect(app.getVelocityWidget().getIdleThreshold()).toBe(30000);
      expect(localStorage.getItem('plotailor_idle_threshold_ms')).toBe('30000');
    });
  });
});
