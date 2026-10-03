import { EditorView } from '@codemirror/view';
import type { Compartment } from '@codemirror/state';
import { rubyDecorationExtension, setRubyDisplayMode, type RubyDisplayMode } from '../../core/editor/RubyDecorationExtension.js';
import { setAutoIndentEnabled } from '../../core/editor/VerticalWritingExtension.js';

export interface SettingsState {
  fontSize: string;
  fontFamily: string;
  isAutoIndent: boolean;
  isAutoRuby: boolean;
  isRealtimeLinter: boolean;
  rubyMode: RubyDisplayMode;
}

export interface SettingsControllerDependencies {
  getEditorBody: () => HTMLDivElement | null;
  getEditorView: () => EditorView | null;
  getRubyCompartment: () => Compartment;
  setRubyMode: (mode: RubyDisplayMode) => void;
  showToast: (msg: string) => void;
}

export type SettingChangeListener = (key: keyof SettingsState, value: any) => void;

export class SettingsController {
  private deps: SettingsControllerDependencies;
  private state: SettingsState = {
    fontSize: '16px',
    fontFamily: 'mincho',
    isAutoIndent: true,
    isAutoRuby: true,
    isRealtimeLinter: true,
    rubyMode: 'normal',
  };
  private listeners: SettingChangeListener[] = [];

  constructor(deps: SettingsControllerDependencies) {
    this.deps = deps;
  }

  public registerSettingListener(listener: SettingChangeListener): void {
    this.listeners.push(listener);
  }

  private notifyListeners(key: keyof SettingsState, value: any): void {
    for (const listener of this.listeners) {
      listener(key, value);
    }
  }

  public getState(): SettingsState {
    return { ...this.state };
  }

  public setState(partial: Partial<SettingsState>): void {
    Object.assign(this.state, partial);
  }

  public applyFontPreferences(): void {
    const body = this.deps.getEditorBody();
    if (!body) return;
    body.style.fontSize = this.state.fontSize;
    if (this.state.fontFamily === 'mincho') {
      body.style.fontFamily = "'Shippori Mincho', 'Noto Serif JP', serif";
    } else if (this.state.fontFamily === 'gothic') {
      body.style.fontFamily = "'BIZ UDPGothic', 'Yu Gothic', sans-serif";
    } else {
      body.style.fontFamily = "system-ui, -apple-system, sans-serif";
    }
  }

  public openSettingsModal(): void {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const chkIndent = document.getElementById('settingAutoIndent') as HTMLInputElement | null;
    if (chkIndent) chkIndent.checked = this.state.isAutoIndent;

    const chkRuby = document.getElementById('settingAutoRuby') as HTMLInputElement | null;
    if (chkRuby) chkRuby.checked = this.state.isAutoRuby;

    const chkLinter = document.getElementById('settingRealtimeLinter') as HTMLInputElement | null;
    if (chkLinter) chkLinter.checked = this.state.isRealtimeLinter;

    const selSize = document.getElementById('settingFontSize') as HTMLSelectElement | null;
    if (selSize) selSize.value = this.state.fontSize;

    const selFamily = document.getElementById('settingFontFamily') as HTMLSelectElement | null;
    if (selFamily) selFamily.value = this.state.fontFamily;
  }

  public initSettingsModal(): void {
    const modal = document.getElementById('settingsModal');
    document.getElementById('btnCloseSettingsModal')?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('settingAutoIndent')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.state.isAutoIndent = checked;
      setAutoIndentEnabled(checked);
      try {
        localStorage.setItem('plotailor_auto_indent', checked.toString());
      } catch {}
      this.notifyListeners('isAutoIndent', checked);
      this.deps.showToast(`段落自動字下げを ${checked ? 'ON' : 'OFF'} に設定しました`);
    });

    document.getElementById('settingAutoRuby')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.state.isAutoRuby = checked;
      this.state.rubyMode = checked ? 'normal' : 'raw';
      this.deps.setRubyMode(this.state.rubyMode);
      try {
        localStorage.setItem('plotailor_auto_ruby', checked.toString());
        localStorage.setItem('plotailor_ruby_mode', this.state.rubyMode);
      } catch {}
      const cm = this.deps.getEditorView();
      if (cm) {
        cm.dispatch({
          effects: [
            this.deps.getRubyCompartment().reconfigure(
              this.state.rubyMode === 'raw'
                ? []
                : rubyDecorationExtension({ mode: this.state.rubyMode, expandOnCursor: true })
            ),
            setRubyDisplayMode.of(this.state.rubyMode),
          ],
        });
      }
      this.notifyListeners('isAutoRuby', checked);
      this.deps.showToast(`ルビ展開を ${checked ? 'ON' : 'OFF'} に設定しました`);
    });

    document.getElementById('settingRealtimeLinter')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.state.isRealtimeLinter = checked;
      try {
        localStorage.setItem('plotailor_realtime_linter', checked.toString());
      } catch {}
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('linter-hidden', !checked);
      }
      this.notifyListeners('isRealtimeLinter', checked);
      this.deps.showToast(`推敲リント装飾表示を ${checked ? 'ON' : 'OFF'} に設定しました`);
    });

    document.getElementById('settingFontSize')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.state.fontSize = val;
      try {
        localStorage.setItem('plotailor_font_size', val);
      } catch {}
      this.applyFontPreferences();
      this.notifyListeners('fontSize', val);
      this.deps.showToast(`文字サイズを「${val}」に変更しました`);
    });

    document.getElementById('settingFontFamily')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.state.fontFamily = val;
      try {
        localStorage.setItem('plotailor_font_family', val);
      } catch {}
      this.applyFontPreferences();
      this.notifyListeners('fontFamily', val);
      this.deps.showToast(`本文フォントを変更しました`);
    });
  }
}
