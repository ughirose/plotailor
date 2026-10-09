// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { showInlineConfirm } from '../src/app/InlineDialog.js';

describe('InlineDialog - Two-Step Verification Confirmation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="app-container"></div>';
  });

  it('resolves true immediately when requiredInput is omitted and confirm is clicked', async () => {
    const promise = showInlineConfirm({
      message: '通常確認テスト',
      confirmText: 'OK',
    });

    const confirmBtn = document.querySelector('.inline-dialog-btn--confirm') as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn.disabled).toBe(false);

    confirmBtn.click();
    const result = await promise;
    expect(result).toBe(true);
  });

  it('disables confirm button until requiredInput matches exactly', async () => {
    const promise = showInlineConfirm({
      message: '全データ初期化の確認',
      destructive: true,
      confirmText: '初期化',
      requiredInput: 'RESET',
    });

    const confirmBtn = document.querySelector('.inline-dialog-btn--destructive') as HTMLButtonElement;
    const inputEl = document.querySelector('.inline-dialog-input') as HTMLInputElement;

    expect(confirmBtn).not.toBeNull();
    expect(inputEl).not.toBeNull();
    expect(confirmBtn.disabled).toBe(true);

    // Typing wrong input
    inputEl.value = 'res';
    inputEl.dispatchEvent(new Event('input'));
    expect(confirmBtn.disabled).toBe(true);

    // Typing exact requiredInput
    inputEl.value = 'RESET';
    inputEl.dispatchEvent(new Event('input'));
    expect(confirmBtn.disabled).toBe(false);

    confirmBtn.click();
    const result = await promise;
    expect(result).toBe(true);
  });

  it('resolves false when cancel is clicked even if requiredInput is specified', async () => {
    const promise = showInlineConfirm({
      message: '初期化キャンセル確認',
      requiredInput: 'RESET',
    });

    const cancelBtn = document.querySelector('.inline-dialog-btn--cancel') as HTMLButtonElement;
    expect(cancelBtn).not.toBeNull();

    cancelBtn.click();
    const result = await promise;
    expect(result).toBe(false);
  });
});
