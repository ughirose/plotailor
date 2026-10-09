/**
 * InlineDialog - Non-blocking inline dialog replacements for window.confirm/prompt/alert.
 *
 * Strict 3-Pane Constitution compliance: Zero browser-native modal dialogs.
 * All confirmations and prompts render as inline overlays within the app container.
 */

export interface InlineDialogOptions {
  /** Dialog message text */
  message: string;
  /** Optional subtitle/detail text */
  detail?: string;
  /** Confirm button text (default: 'OK') */
  confirmText?: string;
  /** Cancel button text (default: 'キャンセル') */
  cancelText?: string;
  /** Whether this is a destructive action (styles confirm button red) */
  destructive?: boolean;
  /** Optional required text verification for 2-step destructive confirmation (e.g. 'RESET') */
  requiredInput?: string;
}

export interface InlinePromptOptions extends InlineDialogOptions {
  /** Placeholder text for input */
  placeholder?: string;
  /** Default input value */
  defaultValue?: string;
}

/**
 * Show an inline confirmation dialog (replaces window.confirm).
 * Returns a Promise that resolves to true (confirmed) or false (cancelled).
 */
export function showInlineConfirm(options: InlineDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const dialog = createDialogBox(options.message, options.detail);

    let inputEl: HTMLInputElement | null = null;
    if (options.requiredInput) {
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'inline-dialog-input';
      inputEl.placeholder = `実行するには「${options.requiredInput}」と入力してください`;
      inputEl.style.marginTop = '8px';
      inputEl.style.marginBottom = '12px';
      dialog.append(inputEl);
    }

    const btnRow = document.createElement('div');
    btnRow.className = 'inline-dialog-buttons';

    const btnCancel = createButton(options.cancelText ?? 'キャンセル', 'cancel');
    const btnConfirm = createButton(
      options.confirmText ?? 'OK',
      options.destructive ? 'destructive' : 'confirm'
    );

    if (options.requiredInput && inputEl) {
      btnConfirm.disabled = true;
      btnConfirm.style.opacity = '0.4';
      btnConfirm.style.cursor = 'not-allowed';

      inputEl.addEventListener('input', () => {
        const matches = inputEl!.value.trim() === options.requiredInput;
        btnConfirm.disabled = !matches;
        btnConfirm.style.opacity = matches ? '1' : '0.4';
        btnConfirm.style.cursor = matches ? 'pointer' : 'not-allowed';
      });

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !btnConfirm.disabled) {
          overlay.remove();
          resolve(true);
        } else if (e.key === 'Escape') {
          overlay.remove();
          resolve(false);
        }
      });
    }

    btnCancel.addEventListener('click', () => { overlay.remove(); resolve(false); });
    btnConfirm.addEventListener('click', () => {
      if (options.requiredInput && inputEl && inputEl.value.trim() !== options.requiredInput) {
        return;
      }
      overlay.remove();
      resolve(true);
    });

    btnRow.append(btnCancel, btnConfirm);
    dialog.append(btnRow);
    overlay.append(dialog);
    document.querySelector('.app-container')?.append(overlay) ?? document.body.append(overlay);
    if (inputEl) {
      inputEl.focus();
    } else {
      btnConfirm.focus();
    }
  });
}

/**
 * Show an inline prompt dialog (replaces window.prompt).
 * Returns a Promise that resolves to the input string or null if cancelled.
 */
export function showInlinePrompt(options: InlinePromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const dialog = createDialogBox(options.message, options.detail);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-dialog-input';
    input.placeholder = options.placeholder ?? '';
    input.value = options.defaultValue ?? '';

    const btnRow = document.createElement('div');
    btnRow.className = 'inline-dialog-buttons';

    const btnCancel = createButton(options.cancelText ?? 'キャンセル', 'cancel');
    const btnConfirm = createButton(options.confirmText ?? 'OK', 'confirm');

    btnCancel.addEventListener('click', () => { overlay.remove(); resolve(null); });
    btnConfirm.addEventListener('click', () => { overlay.remove(); resolve(input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { overlay.remove(); resolve(input.value); }
      if (e.key === 'Escape') { overlay.remove(); resolve(null); }
    });

    dialog.append(input, btnRow);
    btnRow.append(btnCancel, btnConfirm);
    overlay.append(dialog);
    document.querySelector('.app-container')?.append(overlay) ?? document.body.append(overlay);
    input.focus();
    input.select();
  });
}

/**
 * Show an inline alert (replaces window.alert).
 * Returns a Promise that resolves when dismissed.
 */
export function showInlineAlert(options: InlineDialogOptions): Promise<void> {
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const dialog = createDialogBox(options.message, options.detail);

    const btnRow = document.createElement('div');
    btnRow.className = 'inline-dialog-buttons';

    const btnOk = createButton(options.confirmText ?? 'OK', 'confirm');
    btnOk.addEventListener('click', () => { overlay.remove(); resolve(); });

    btnRow.append(btnOk);
    dialog.append(btnRow);
    overlay.append(dialog);
    document.querySelector('.app-container')?.append(overlay) ?? document.body.append(overlay);
    btnOk.focus();
  });
}

// --- Internal helpers ---

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'inline-dialog-overlay';
  return overlay;
}

function createDialogBox(message: string, detail?: string): HTMLDivElement {
  const box = document.createElement('div');
  box.className = 'inline-dialog-box';

  const msg = document.createElement('p');
  msg.className = 'inline-dialog-message';
  msg.textContent = message;
  box.append(msg);

  if (detail) {
    const sub = document.createElement('p');
    sub.className = 'inline-dialog-detail';
    sub.textContent = detail;
    box.append(sub);
  }

  return box;
}

function createButton(text: string, variant: 'confirm' | 'cancel' | 'destructive'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.className = `inline-dialog-btn inline-dialog-btn--${variant}`;
  return btn;
}
