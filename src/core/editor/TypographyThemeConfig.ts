/**
 * TypographyThemeConfig.ts
 *
 * CSS Variable Mapping & Typesetting Guideline Indicator Configuration Model
 * for Japanese Manuscript (原稿用紙) and Washi (和紙) / Night (夜) themes.
 */

export type ThemeType = 'washi' | 'night' | string;

export interface ThemeColorTokens {
  /** Canvas & manuscript paper background color */
  background: string;
  /** Primary body prose text color */
  text: string;
  /** Ruler & tick mark indicator color */
  ruler: string;
  /** Primary column guideline border color */
  guidelineBorder: string;
  /** Grid line / cell border color for manuscript paper */
  gridLine: string;
  /** "ぶら下げ+1" hanging badge background color */
  hangingBadgeBg: string;
  /** "ぶら下げ+1" hanging badge text color */
  hangingBadgeText: string;
  /** Accent gold / highlight color */
  accent: string;
}

/** Built-in theme preset for Washi Light (和紙 - ライト) */
export const WASHI_LIGHT_THEME: Readonly<ThemeColorTokens> = Object.freeze({
  background: '#fbf7ee',
  text: '#2b2b2b',
  ruler: '#d4c5b0',
  guidelineBorder: '#c86850',
  gridLine: '#e6dccb',
  hangingBadgeBg: '#c86850',
  hangingBadgeText: '#ffffff',
  accent: '#cfa85c',
});

/** Built-in theme preset for Night Dark (夜 - ダーク) */
export const NIGHT_DARK_THEME: Readonly<ThemeColorTokens> = Object.freeze({
  background: '#181820',
  text: '#d8d8d8',
  ruler: '#3a3a4c',
  guidelineBorder: '#6088a0',
  gridLine: '#282836',
  hangingBadgeBg: '#4a6880',
  hangingBadgeText: '#ffffff',
  accent: '#cfa85c',
});

export const DEFAULT_THEME_PRESETS: Record<string, ThemeColorTokens> = {
  washi: WASHI_LIGHT_THEME,
  night: NIGHT_DARK_THEME,
};

export interface TypographyThemeConfigOptions {
  /** Selected active theme key (default: 'washi') */
  theme?: ThemeType;
  /** Toggle visibility of "ぶら下げ+1" hanging punctuation badge (default: true) */
  showHangingBadge?: boolean;
  /** Toggle visibility of primary column guideline border (default: true) */
  showColumnGuideline?: boolean;
  /** Toggle visibility of ruler & tick marks (default: true) */
  showRuler?: boolean;
  /** Toggle visibility of manuscript paper grid lines (default: true) */
  showGridLines?: boolean;
  /** Number of characters per line [30..50] (default: 40) */
  charsPerLine?: number;
  /** Number of lines per manuscript sheet / page (default: 20) */
  linesPerPage?: number;
  /** Font size in pixels [10..72] (default: 17) */
  fontSize?: number;
  /** Vertical writing mode flag (default: false) */
  isVertical?: boolean;
  /** Custom theme token overrides mapped by theme name */
  customTokens?: Record<string, Partial<ThemeColorTokens>>;
}

export interface TypographyThemeConfigData {
  theme: ThemeType;
  showHangingBadge: boolean;
  showColumnGuideline: boolean;
  showRuler: boolean;
  showGridLines: boolean;
  charsPerLine: number;
  linesPerPage: number;
  fontSize: number;
  isVertical: boolean;
  customTokens: Record<string, Partial<ThemeColorTokens>>;
}

export const MIN_CHARS_PER_LINE = 30;
export const MAX_CHARS_PER_LINE = 50;
export const DEFAULT_CHARS_PER_LINE = 40;

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 72;
export const DEFAULT_FONT_SIZE = 17;

export class TypographyThemeConfig {
  private theme: ThemeType;
  private showHangingBadge: boolean;
  private showColumnGuideline: boolean;
  private showRuler: boolean;
  private showGridLines: boolean;
  private charsPerLine: number;
  private linesPerPage: number;
  private fontSize: number;
  private isVertical: boolean;
  private customTokensMap: Map<string, Partial<ThemeColorTokens>> = new Map();

  constructor(options?: TypographyThemeConfigOptions) {
    const validated = TypographyThemeConfig.validateAndNormalize(options);
    this.theme = validated.theme;
    this.showHangingBadge = validated.showHangingBadge;
    this.showColumnGuideline = validated.showColumnGuideline;
    this.showRuler = validated.showRuler;
    this.showGridLines = validated.showGridLines;
    this.charsPerLine = validated.charsPerLine;
    this.linesPerPage = validated.linesPerPage;
    this.fontSize = validated.fontSize;
    this.isVertical = validated.isVertical;

    if (validated.customTokens) {
      for (const [key, tokens] of Object.entries(validated.customTokens)) {
        this.customTokensMap.set(key, { ...tokens });
      }
    }
  }

  // --- Static Validation & Normalization ---

  /**
   * Safely validates and normalizes arbitrary input data, applying robust defaults
   * and fallback verification for corrupt, missing, or out-of-range fields.
   */
  public static validateAndNormalize(input: unknown): TypographyThemeConfigData {
    const obj = (typeof input === 'object' && input !== null) ? (input as Record<string, unknown>) : {};

    // Theme validation
    let themeStr = typeof obj.theme === 'string' ? obj.theme.trim().toLowerCase() : 'washi';
    if (!themeStr) {
      themeStr = 'washi';
    }

    // Indicator boolean toggles with fallback validation
    const showHangingBadge = typeof obj.showHangingBadge === 'boolean' ? obj.showHangingBadge : true;
    const showColumnGuideline = typeof obj.showColumnGuideline === 'boolean' ? obj.showColumnGuideline : true;
    const showRuler = typeof obj.showRuler === 'boolean' ? obj.showRuler : true;
    const showGridLines = typeof obj.showGridLines === 'boolean' ? obj.showGridLines : true;
    const isVertical = typeof obj.isVertical === 'boolean' ? obj.isVertical : false;

    // Numeric parameters with clamping & fallback validation
    const rawCols = typeof obj.charsPerLine === 'number' ? obj.charsPerLine : Number(obj.charsPerLine);
    const charsPerLine = isNaN(rawCols)
      ? DEFAULT_CHARS_PER_LINE
      : Math.max(MIN_CHARS_PER_LINE, Math.min(MAX_CHARS_PER_LINE, Math.round(rawCols)));

    const rawLines = typeof obj.linesPerPage === 'number' ? obj.linesPerPage : Number(obj.linesPerPage);
    const linesPerPage = (isNaN(rawLines) || rawLines <= 0)
      ? 20
      : Math.max(1, Math.min(100, Math.round(rawLines)));

    const rawFontSize = typeof obj.fontSize === 'number' ? obj.fontSize : Number(obj.fontSize);
    const fontSize = isNaN(rawFontSize)
      ? DEFAULT_FONT_SIZE
      : Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(rawFontSize)));

    // Custom tokens validation
    const customTokens: Record<string, Partial<ThemeColorTokens>> = {};
    if (typeof obj.customTokens === 'object' && obj.customTokens !== null) {
      for (const [tKey, tVal] of Object.entries(obj.customTokens as Record<string, unknown>)) {
        if (typeof tVal === 'object' && tVal !== null) {
          const validTokens: Partial<ThemeColorTokens> = {};
          const tokenObj = tVal as Record<string, unknown>;
          const keys: (keyof ThemeColorTokens)[] = [
            'background', 'text', 'ruler', 'guidelineBorder',
            'gridLine', 'hangingBadgeBg', 'hangingBadgeText', 'accent'
          ];
          for (const k of keys) {
            if (typeof tokenObj[k] === 'string' && (tokenObj[k] as string).trim() !== '') {
              validTokens[k] = (tokenObj[k] as string).trim();
            }
          }
          if (Object.keys(validTokens).length > 0) {
            customTokens[tKey] = validTokens;
          }
        }
      }
    }

    return {
      theme: themeStr,
      showHangingBadge,
      showColumnGuideline,
      showRuler,
      showGridLines,
      charsPerLine,
      linesPerPage,
      fontSize,
      isVertical,
      customTokens,
    };
  }

  // --- Theme Token Resolution & CSS Variables Mapping ---

  /**
   * Resolves effective color tokens for the specified or currently active theme.
   */
  public getTokens(themeName?: ThemeType): ThemeColorTokens {
    const activeTheme = themeName || this.theme;
    const basePreset = DEFAULT_THEME_PRESETS[activeTheme] || WASHI_LIGHT_THEME;
    const overrides = this.customTokensMap.get(activeTheme) || {};

    return {
      ...basePreset,
      ...overrides,
    };
  }

  /**
   * Returns standard CSS variable mappings for the current or specified theme.
   */
  public getCssVariables(themeName?: ThemeType): Record<string, string> {
    const tokens = this.getTokens(themeName);
    return {
      '--theme-bg': tokens.background,
      '--theme-text': tokens.text,
      '--theme-ruler': tokens.ruler,
      '--theme-guideline-border': tokens.guidelineBorder,
      '--theme-grid-line': tokens.gridLine,
      '--theme-hanging-badge-bg': tokens.hangingBadgeBg,
      '--theme-hanging-badge-text': tokens.hangingBadgeText,
      '--theme-accent': tokens.accent,
      // Alias mappings for Washi and Plotailor namespaces
      '--washi-bg': tokens.background,
      '--washi-text': tokens.text,
      '--washi-ruler': tokens.ruler,
      '--washi-guideline-border': tokens.guidelineBorder,
      '--plotailor-bg': tokens.background,
      '--plotailor-text': tokens.text,
      '--plotailor-ruler': tokens.ruler,
      '--plotailor-guideline-border': tokens.guidelineBorder,
    };
  }

  /**
   * Generates a CSS style declaration string (e.g., `--theme-bg: #fbf7ee; ...`).
   */
  public toCssVariablesString(themeName?: ThemeType): string {
    const vars = this.getCssVariables(themeName);
    return Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join(' ');
  }

  /**
   * Applies CSS variables to an HTMLElement's inline styles.
   */
  public applyToElement(element: HTMLElement, themeName?: ThemeType): void {
    if (!element || !element.style) return;
    const vars = this.getCssVariables(themeName);
    for (const [key, val] of Object.entries(vars)) {
      element.style.setProperty(key, val);
    }
  }

  // --- Indicator Options & Getters / Setters ---

  public getTheme(): ThemeType {
    return this.theme;
  }

  public setTheme(theme: ThemeType): void {
    const validated = TypographyThemeConfig.validateAndNormalize({ ...this.toJSON(), theme });
    this.theme = validated.theme;
  }

  public getShowHangingBadge(): boolean {
    return this.showHangingBadge;
  }

  public setShowHangingBadge(show: boolean): void {
    this.showHangingBadge = Boolean(show);
  }

  public toggleHangingBadge(): boolean {
    this.showHangingBadge = !this.showHangingBadge;
    return this.showHangingBadge;
  }

  public getShowColumnGuideline(): boolean {
    return this.showColumnGuideline;
  }

  public setShowColumnGuideline(show: boolean): void {
    this.showColumnGuideline = Boolean(show);
  }

  public toggleColumnGuideline(): boolean {
    this.showColumnGuideline = !this.showColumnGuideline;
    return this.showColumnGuideline;
  }

  public getShowRuler(): boolean {
    return this.showRuler;
  }

  public setShowRuler(show: boolean): void {
    this.showRuler = Boolean(show);
  }

  public toggleRuler(): boolean {
    this.showRuler = !this.showRuler;
    return this.showRuler;
  }

  public getShowGridLines(): boolean {
    return this.showGridLines;
  }

  public setShowGridLines(show: boolean): void {
    this.showGridLines = Boolean(show);
  }

  public toggleGridLines(): boolean {
    this.showGridLines = !this.showGridLines;
    return this.showGridLines;
  }

  public getCharsPerLine(): number {
    return this.charsPerLine;
  }

  public setCharsPerLine(val: number): void {
    const validated = TypographyThemeConfig.validateAndNormalize({ ...this.toJSON(), charsPerLine: val });
    this.charsPerLine = validated.charsPerLine;
  }

  public getLinesPerPage(): number {
    return this.linesPerPage;
  }

  public setLinesPerPage(val: number): void {
    const validated = TypographyThemeConfig.validateAndNormalize({ ...this.toJSON(), linesPerPage: val });
    this.linesPerPage = validated.linesPerPage;
  }

  public getFontSize(): number {
    return this.fontSize;
  }

  public setFontSize(val: number): void {
    const validated = TypographyThemeConfig.validateAndNormalize({ ...this.toJSON(), fontSize: val });
    this.fontSize = validated.fontSize;
  }

  public getIsVertical(): boolean {
    return this.isVertical;
  }

  public setIsVertical(isVertical: boolean): void {
    this.isVertical = Boolean(isVertical);
  }

  public setCustomTokens(themeName: string, tokens: Partial<ThemeColorTokens>): void {
    if (!themeName) return;
    const existing = this.customTokensMap.get(themeName) || {};
    this.customTokensMap.set(themeName, { ...existing, ...tokens });
  }

  public getCustomTokens(): Record<string, Partial<ThemeColorTokens>> {
    const res: Record<string, Partial<ThemeColorTokens>> = {};
    for (const [k, v] of this.customTokensMap.entries()) {
      res[k] = { ...v };
    }
    return res;
  }

  // --- Serialization & Deserialization ---

  public toJSON(): TypographyThemeConfigData {
    return {
      theme: this.theme,
      showHangingBadge: this.showHangingBadge,
      showColumnGuideline: this.showColumnGuideline,
      showRuler: this.showRuler,
      showGridLines: this.showGridLines,
      charsPerLine: this.charsPerLine,
      linesPerPage: this.linesPerPage,
      fontSize: this.fontSize,
      isVertical: this.isVertical,
      customTokens: this.getCustomTokens(),
    };
  }

  public serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  public static fromJSON(data: unknown): TypographyThemeConfig {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return new TypographyThemeConfig(parsed);
      } catch {
        return new TypographyThemeConfig();
      }
    }
    return new TypographyThemeConfig(data as TypographyThemeConfigOptions);
  }

  public static deserialize(serializedStr: string): TypographyThemeConfig {
    return TypographyThemeConfig.fromJSON(serializedStr);
  }
}
