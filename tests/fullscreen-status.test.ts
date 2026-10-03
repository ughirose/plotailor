import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FullscreenStatusBar } from '../src/ui/FullscreenStatusBar.js';

describe('FullscreenStatusBar (非侵襲全画面ステータスバー)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('リアルタイム文字数・原稿用紙換算枚数', () => {
    it('初期テキストの文字数と原稿用紙換算枚数を正しく算出する', () => {
      // 400文字 = 原稿用紙 1.0枚
      const text = 'あ'.repeat(400);
      const statusBar = new FullscreenStatusBar({ initialText: text });

      const state = statusBar.getState();
      expect(state.characterCount).toBe(400);
      expect(state.manuscriptPages).toBe(1.0);
    });

    it('updateText で文字数と原稿用紙枚数がリアルタイムに更新される', () => {
      const statusBar = new FullscreenStatusBar({ initialText: '吾輩は猫である。' });
      expect(statusBar.getState().characterCount).toBe(8);

      // 1200文字入力
      const newText = 'あ'.repeat(1200);
      statusBar.updateText(newText);

      const state = statusBar.getState();
      expect(state.characterCount).toBe(1200);
      expect(state.manuscriptPages).toBe(3.0); // 1200 / 400 = 3.0
    });
  });

  describe('セッション執筆速度 (文字/分: CPM)', () => {
    it('打鍵数と経過時間からセッション執筆速度(CPM)を正確に算出する', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const statusBar = new FullscreenStatusBar({ autoFadeTimeoutMs: 3000 });

      // 100文字打鍵
      statusBar.onKeystroke(100);

      // 2分経過 (120,000ms)
      const future = now + 120000;
      statusBar.recalculateWritingSpeed(future);

      const state = statusBar.getState();
      expect(state.sessionTypedCount).toBe(100);
      // 100文字 / 2分 = 50 文字/分
      expect(state.writingSpeedCpm).toBe(50);
    });
  });

  describe('目標文字数進捗ゲージ (Progress Gauge)', () => {
    it('目標文字数に対する進捗率を正確に算出する', () => {
      const statusBar = new FullscreenStatusBar({
        initialText: 'あ'.repeat(2500),
        targetWordCount: 5000,
      });

      const state = statusBar.getState();
      expect(state.targetWordCount).toBe(5000);
      expect(state.progressPercent).toBe(50.0); // 2500 / 5000 = 50%
    });

    it('setTargetWordCount で目標文字数を動的に変更できる', () => {
      const statusBar = new FullscreenStatusBar({
        initialText: 'あ'.repeat(1000),
        targetWordCount: 5000,
      });

      expect(statusBar.getState().progressPercent).toBe(20.0);

      statusBar.setTargetWordCount(2000);
      expect(statusBar.getState().targetWordCount).toBe(2000);
      expect(statusBar.getState().progressPercent).toBe(50.0); // 1000 / 2000 = 50%
    });

    it('目標文字数を超えた場合は 100% にキャップされる', () => {
      const statusBar = new FullscreenStatusBar({
        initialText: 'あ'.repeat(6000),
        targetWordCount: 5000,
      });

      expect(statusBar.getState().progressPercent).toBe(100.0);
    });
  });

  describe('自動フェードアウト・非侵襲UI制御', () => {
    it('一定時間（デフォルト3秒）ユーザー操作がないと自動でフェードアウトする', () => {
      const statusBar = new FullscreenStatusBar({ autoFadeTimeoutMs: 3000 });

      expect(statusBar.getState().isVisible).toBe(true);

      // 3秒経過
      vi.advanceTimersByTime(3000);

      expect(statusBar.getState().isVisible).toBe(false);
    });

    it('打鍵(onKeystroke)またはユーザー操作(onUserActivity)で再表示されタイマーがリセットされる', () => {
      const statusBar = new FullscreenStatusBar({ autoFadeTimeoutMs: 3000 });

      // 3秒経過してフェードアウト
      vi.advanceTimersByTime(3000);
      expect(statusBar.getState().isVisible).toBe(false);

      // 打鍵発生で再表示
      statusBar.onKeystroke(1);
      expect(statusBar.getState().isVisible).toBe(true);

      // 2秒経過時点ではまだ表示中
      vi.advanceTimersByTime(2000);
      expect(statusBar.getState().isVisible).toBe(true);

      // さらに1秒（計3秒）経過でフェードアウト
      vi.advanceTimersByTime(1000);
      expect(statusBar.getState().isVisible).toBe(false);
    });

    it('マウスホバー中(onMouseEnter)はフェードアウトが一時停止する', () => {
      const statusBar = new FullscreenStatusBar({ autoFadeTimeoutMs: 3000 });

      // マウスホバー開始
      statusBar.onMouseEnter();
      expect(statusBar.getState().isHovered).toBe(true);

      // 5秒経過してもフェードアウトしない
      vi.advanceTimersByTime(5000);
      expect(statusBar.getState().isVisible).toBe(true);

      // マウスホバー解除
      statusBar.onMouseLeave();
      expect(statusBar.getState().isHovered).toBe(false);

      // 解除後3秒でフェードアウト
      vi.advanceTimersByTime(3000);
      expect(statusBar.getState().isVisible).toBe(false);
    });
  });

  describe('全画面モードおよびUIモデルレンダリング', () => {
    it('全画面モード(setFullscreen)の切り替えが正しく反映される', () => {
      const statusBar = new FullscreenStatusBar();
      expect(statusBar.getState().isFullscreen).toBe(false);

      statusBar.setFullscreen(true);
      expect(statusBar.getState().isFullscreen).toBe(true);

      const model = statusBar.renderModel();
      expect(model.classes).toContain('mode-fullscreen');
    });

    it('renderModel が必須のインラインステータス要素をすべて含んだモデルを生成する', () => {
      const statusBar = new FullscreenStatusBar({
        initialText: 'あ'.repeat(800),
        targetWordCount: 4000,
      });

      const model = statusBar.renderModel();
      expect(model.wordCountLabel).toBe('800字');
      expect(model.manuscriptLabel).toContain('原稿用紙 約2.0枚');
      expect(model.progressLabel).toContain('目標 4,000字 (20%)');
      expect(model.html).toContain('800字');
      expect(model.html).toContain('progress-gauge-fill');
      expect(model.html).toContain('width: 20%;');
    });
  });

  describe('ライフサイクル・クリーンアップ', () => {
    it('destroy メソッドでタイマーが破棄される', () => {
      const statusBar = new FullscreenStatusBar({ autoFadeTimeoutMs: 3000 });
      statusBar.destroy();

      // タイマー前進しても例外発生しない
      vi.advanceTimersByTime(5000);
      expect(statusBar.getState().isVisible).toBe(true);
    });
  });
});
