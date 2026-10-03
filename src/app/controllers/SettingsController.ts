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
  isAutoTcy: boolean;
  isAutoBouten: boolean;
  isJapaneseBeautify: boolean;
  manuscriptPreset: '400' | '200' | 'bunko' | 'custom';
}

export interface SettingsControllerDependencies {
  getEditorBody: () => HTMLDivElement | null;
  getEditorView: () => EditorView | null;
  getRubyCompartment: () => Compartment;
  setRubyMode: (mode: RubyDisplayMode) => void;
  showToast: (msg: string) => void;
  isVerticalUpright?: () => boolean;
  setVerticalUpright?: (enabled: boolean) => void;
  getSnapshotFrequency?: () => 'minimal' | 'low' | 'standard' | 'high' | 'custom';
  setSnapshotFrequency?: (val: 'minimal' | 'low' | 'standard' | 'high' | 'custom') => void;
  getSnapshotCustomChars?: () => number;
  setSnapshotCustomChars?: (val: number) => void;
  getSnapshotCustomSeconds?: () => number;
  setSnapshotCustomSeconds?: (val: number) => void;
  getKinsokuColumns?: () => number;
  setKinsokuColumns?: (val: number) => void;
  getKinsokuHanging?: () => boolean;
  setKinsokuHanging?: (val: boolean) => void;
  getColumnGuidelineVisible?: () => boolean;
  setColumnGuidelineVisible?: (val: boolean) => void;
  getTargetWordCount?: () => number;
  setTargetWordCount?: (val: number) => void;
  getIdleThresholdMs?: () => number;
  setIdleThresholdMs?: (val: number) => void;
  onFontSizeChanged?: (fontSize: string) => void;
  onFontFamilyChanged?: (fontFamily: string) => void;
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
    isAutoTcy: true,
    isAutoBouten: true,
    isJapaneseBeautify: true,
    manuscriptPreset: '400',
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

    const chkUpright = document.getElementById('settingVerticalUpright') as HTMLInputElement | null;
    if (chkUpright && this.deps.isVerticalUpright) chkUpright.checked = this.deps.isVerticalUpright();

    const selSize = document.getElementById('settingFontSize') as HTMLSelectElement | null;
    if (selSize) selSize.value = this.state.fontSize;

    const selFamily = document.getElementById('settingFontFamily') as HTMLSelectElement | null;
    if (selFamily) selFamily.value = this.state.fontFamily;

    if (this.deps.getSnapshotFrequency) {
      const freq = this.deps.getSnapshotFrequency();
      const selFreq = document.getElementById('settingSnapshotFrequency') as HTMLSelectElement | null;
      if (selFreq) selFreq.value = freq;
      const customGrp = document.getElementById('settingCustomSnapshotGroup');
      if (customGrp) customGrp.style.display = freq === 'custom' ? 'block' : 'none';
    }

    if (this.deps.getSnapshotCustomChars) {
      const inpChars = document.getElementById('settingSnapshotCustomChars') as HTMLInputElement | null;
      if (inpChars) inpChars.value = this.deps.getSnapshotCustomChars().toString();
    }

    if (this.deps.getSnapshotCustomSeconds) {
      const inpSecs = document.getElementById('settingSnapshotCustomSeconds') as HTMLInputElement | null;
      if (inpSecs) inpSecs.value = this.deps.getSnapshotCustomSeconds().toString();
    }

    if (this.deps.getKinsokuColumns) {
      const cols = this.deps.getKinsokuColumns();
      const rngKinsokuCols = document.getElementById('settingKinsokuColumns') as HTMLInputElement | null;
      if (rngKinsokuCols) rngKinsokuCols.value = cols.toString();
      const spanKinsokuColsVal = document.getElementById('settingKinsokuColumnsVal');
      if (spanKinsokuColsVal) spanKinsokuColsVal.textContent = `${cols}字`;
    }

    if (this.deps.getKinsokuHanging) {
      const chkKinsokuHanging = document.getElementById('settingKinsokuHanging') as HTMLInputElement | null;
      if (chkKinsokuHanging) chkKinsokuHanging.checked = this.deps.getKinsokuHanging();
    }

    if (this.deps.getColumnGuidelineVisible) {
      const chkColumnGuideline = document.getElementById('settingColumnGuideline') as HTMLInputElement | null;
      if (chkColumnGuideline) chkColumnGuideline.checked = this.deps.getColumnGuidelineVisible();
    }

    if (this.deps.getTargetWordCount) {
      const inpTargetWordCount = document.getElementById('settingTargetWordCount') as HTMLInputElement | null;
      if (inpTargetWordCount) inpTargetWordCount.value = this.deps.getTargetWordCount().toString();
    }

    if (this.deps.getIdleThresholdMs) {
      const selIdleThreshold = document.getElementById('settingIdleThreshold') as HTMLSelectElement | null;
      if (selIdleThreshold) selIdleThreshold.value = this.deps.getIdleThresholdMs().toString();
    }
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

    document.getElementById('settingVerticalUpright')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.deps.setVerticalUpright?.(checked);
    });

    const selectFontSize = document.getElementById('settingFontSize') as HTMLSelectElement | null;
    const inputCustomFontSize = document.getElementById('settingCustomFontSize') as HTMLInputElement | null;

    const updateFontSizeUI = () => {
      const pxNum = parseInt(this.state.fontSize, 10) || 16;
      if (inputCustomFontSize) inputCustomFontSize.value = pxNum.toString();
      if (selectFontSize) {
        const matchingOpt = Array.from(selectFontSize.options).find((opt) => opt.value === this.state.fontSize);
        if (matchingOpt) {
          selectFontSize.value = this.state.fontSize;
        } else {
          selectFontSize.value = 'custom';
        }
      }
    };

    updateFontSizeUI();

    selectFontSize?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (val === 'custom') {
        const num = inputCustomFontSize ? parseInt(inputCustomFontSize.value, 10) || 16 : 16;
        this.state.fontSize = `${num}px`;
      } else {
        this.state.fontSize = val;
        if (inputCustomFontSize) {
          inputCustomFontSize.value = (parseInt(val, 10) || 16).toString();
        }
      }
      try {
        localStorage.setItem('plotailor_font_size', this.state.fontSize);
      } catch {}
      this.applyFontPreferences();
      this.deps.onFontSizeChanged?.(this.state.fontSize);
      this.notifyListeners('fontSize', this.state.fontSize);
      this.deps.showToast(`文字サイズを「${this.state.fontSize}」に変更しました`);
    });

    inputCustomFontSize?.addEventListener('input', (e) => {
      const num = Math.max(8, Math.min(72, parseInt((e.target as HTMLInputElement).value, 10) || 16));
      this.state.fontSize = `${num}px`;
      if (selectFontSize) {
        const matchingOpt = Array.from(selectFontSize.options).find((opt) => opt.value === this.state.fontSize);
        selectFontSize.value = matchingOpt ? this.state.fontSize : 'custom';
      }
      try {
        localStorage.setItem('plotailor_font_size', this.state.fontSize);
      } catch {}
      this.applyFontPreferences();
      this.deps.onFontSizeChanged?.(this.state.fontSize);
      this.notifyListeners('fontSize', this.state.fontSize);
    });

    document.getElementById('settingFontFamily')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.state.fontFamily = val;
      try {
        localStorage.setItem('plotailor_font_family', val);
      } catch {}
      this.applyFontPreferences();
      this.deps.onFontFamilyChanged?.(val);
      this.notifyListeners('fontFamily', val);
      this.deps.showToast(`本文フォントを変更しました`);
    });

    document.getElementById('settingSnapshotFrequency')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value as any;
      this.deps.setSnapshotFrequency?.(val);
    });

    document.getElementById('settingSnapshotCustomChars')?.addEventListener('input', (e) => {
      const num = Math.max(5, Math.min(2000, parseInt((e.target as HTMLInputElement).value, 10) || 25));
      this.deps.setSnapshotCustomChars?.(num);
    });

    document.getElementById('settingSnapshotCustomSeconds')?.addEventListener('input', (e) => {
      const num = Math.max(2, Math.min(600, parseInt((e.target as HTMLInputElement).value, 10) || 15));
      this.deps.setSnapshotCustomSeconds?.(num);
    });

    const inputKinsokuCols = document.getElementById('settingKinsokuColumns') as HTMLInputElement | null;
    const spanKinsokuColsVal = document.getElementById('settingKinsokuColumnsVal');
    const onKinsokuColsChange = (e: Event) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) || 40;
      if (spanKinsokuColsVal) spanKinsokuColsVal.textContent = `${val}字`;
      this.deps.setKinsokuColumns?.(val);
    };
    inputKinsokuCols?.addEventListener('input', onKinsokuColsChange);
    inputKinsokuCols?.addEventListener('change', onKinsokuColsChange);

    document.getElementById('settingKinsokuHanging')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.deps.setKinsokuHanging?.(checked);
    });

    const chkColumnGuideline = document.getElementById('settingColumnGuideline') as HTMLInputElement | null;
    chkColumnGuideline?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.deps.setColumnGuidelineVisible?.(checked);
    });

    const inputTargetWordCount = document.getElementById('settingTargetWordCount') as HTMLInputElement | null;
    const onTargetWordCountChange = (e: Event) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) || 5000;
      if (val <= 0) return;
      this.deps.setTargetWordCount?.(val);
    };
    inputTargetWordCount?.addEventListener('input', onTargetWordCountChange);
    inputTargetWordCount?.addEventListener('change', onTargetWordCountChange);

    document.getElementById('settingIdleThreshold')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLSelectElement).value, 10) || 60000;
      this.deps.setIdleThresholdMs?.(val);
    });

    document.getElementById('settingAutoTcy')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.state.isAutoTcy = checked;
      try {
        localStorage.setItem('plotailor_auto_tcy', checked.toString());
      } catch {}
      this.notifyListeners('isAutoTcy', checked);
      this.deps.showToast(`縦中横（TCY）自動検出を ${checked ? 'ON' : 'OFF'} に設定しました`);
    });

    document.getElementById('settingAutoBouten')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.state.isAutoBouten = checked;
      try {
        localStorage.setItem('plotailor_auto_bouten', checked.toString());
      } catch {}
      this.notifyListeners('isAutoBouten', checked);
      this.deps.showToast(`傍点強調レンダリングを ${checked ? 'ON' : 'OFF'} に設定しました`);
    });

    document.getElementById('settingJapaneseBeautify')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.state.isJapaneseBeautify = checked;
      try {
        localStorage.setItem('plotailor_japanese_beautify', checked.toString());
      } catch {}
      this.notifyListeners('isJapaneseBeautify', checked);
      this.deps.showToast(`約物自動補正・括弧自動閉じを ${checked ? 'ON' : 'OFF'} に設定しました`);
    });
  }
}
