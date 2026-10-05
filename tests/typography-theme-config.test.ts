// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TypographyThemeConfig,
  WASHI_LIGHT_THEME,
  NIGHT_DARK_THEME,
  DEFAULT_CHARS_PER_LINE,
  MIN_CHARS_PER_LINE,
  MAX_CHARS_PER_LINE,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from '../src/core/editor/TypographyThemeConfig.js';

describe('TypographyThemeConfig Model & CSS Variable Mapping', () => {
  let config: TypographyThemeConfig;

  beforeEach(() => {
    config = new TypographyThemeConfig();
  });

  describe('Initialization & Default Options', () => {
    it('initializes with default settings', () => {
      expect(config.getTheme()).toBe('washi');
      expect(config.getShowHangingBadge()).toBe(true);
      expect(config.getShowColumnGuideline()).toBe(true);
      expect(config.getShowRuler()).toBe(true);
      expect(config.getShowGridLines()).toBe(true);
      expect(config.getCharsPerLine()).toBe(DEFAULT_CHARS_PER_LINE);
      expect(config.getLinesPerPage()).toBe(20);
      expect(config.getFontSize()).toBe(DEFAULT_FONT_SIZE);
      expect(config.getIsVertical()).toBe(false);
    });

    it('accepts custom initialization options', () => {
      const custom = new TypographyThemeConfig({
        theme: 'night',
        showHangingBadge: false,
        showColumnGuideline: false,
        showRuler: false,
        showGridLines: false,
        charsPerLine: 35,
        linesPerPage: 17,
        fontSize: 20,
        isVertical: true,
      });

      expect(custom.getTheme()).toBe('night');
      expect(custom.getShowHangingBadge()).toBe(false);
      expect(custom.getShowColumnGuideline()).toBe(false);
      expect(custom.getShowRuler()).toBe(false);
      expect(custom.getShowGridLines()).toBe(false);
      expect(custom.getCharsPerLine()).toBe(35);
      expect(custom.getLinesPerPage()).toBe(17);
      expect(custom.getFontSize()).toBe(20);
      expect(custom.getIsVertical()).toBe(true);
    });
  });

  describe('Theme Color Tokens & CSS Variable Mappings', () => {
    it('returns WASHI_LIGHT_THEME tokens for washi theme', () => {
      const tokens = config.getTokens('washi');
      expect(tokens.background).toBe(WASHI_LIGHT_THEME.background);
      expect(tokens.text).toBe(WASHI_LIGHT_THEME.text);
      expect(tokens.ruler).toBe(WASHI_LIGHT_THEME.ruler);
      expect(tokens.guidelineBorder).toBe(WASHI_LIGHT_THEME.guidelineBorder);
      expect(tokens.gridLine).toBe(WASHI_LIGHT_THEME.gridLine);
      expect(tokens.hangingBadgeBg).toBe(WASHI_LIGHT_THEME.hangingBadgeBg);
      expect(tokens.hangingBadgeText).toBe(WASHI_LIGHT_THEME.hangingBadgeText);
    });

    it('returns NIGHT_DARK_THEME tokens for night theme', () => {
      const tokens = config.getTokens('night');
      expect(tokens.background).toBe(NIGHT_DARK_THEME.background);
      expect(tokens.text).toBe(NIGHT_DARK_THEME.text);
      expect(tokens.ruler).toBe(NIGHT_DARK_THEME.ruler);
      expect(tokens.guidelineBorder).toBe(NIGHT_DARK_THEME.guidelineBorder);
      expect(tokens.gridLine).toBe(NIGHT_DARK_THEME.gridLine);
      expect(tokens.hangingBadgeBg).toBe(NIGHT_DARK_THEME.hangingBadgeBg);
      expect(tokens.hangingBadgeText).toBe(NIGHT_DARK_THEME.hangingBadgeText);
    });

    it('generates complete CSS variables dictionary including primary, washi, and plotailor namespaces', () => {
      const cssVars = config.getCssVariables('washi');
      expect(cssVars['--theme-bg']).toBe('#fbf7ee');
      expect(cssVars['--theme-text']).toBe('#2b2b2b');
      expect(cssVars['--theme-ruler']).toBe('#d4c5b0');
      expect(cssVars['--theme-guideline-border']).toBe('#c86850');
      expect(cssVars['--washi-bg']).toBe('#fbf7ee');
      expect(cssVars['--plotailor-bg']).toBe('#fbf7ee');

      const nightCssVars = config.getCssVariables('night');
      expect(nightCssVars['--theme-bg']).toBe('#181820');
      expect(nightCssVars['--theme-text']).toBe('#d8d8d8');
      expect(nightCssVars['--theme-ruler']).toBe('#3a3a4c');
      expect(nightCssVars['--theme-guideline-border']).toBe('#6088a0');
    });

    it('generates valid CSS variable style string', () => {
      const cssStr = config.toCssVariablesString('washi');
      expect(cssStr).toContain('--theme-bg: #fbf7ee;');
      expect(cssStr).toContain('--theme-text: #2b2b2b;');
      expect(cssStr).toContain('--theme-guideline-border: #c86850;');
    });

    it('applies CSS variables to DOM element inline style', () => {
      const el = document.createElement('div');
      config.applyToElement(el, 'washi');

      expect(el.style.getPropertyValue('--theme-bg')).toBe('#fbf7ee');
      expect(el.style.getPropertyValue('--theme-text')).toBe('#2b2b2b');
      expect(el.style.getPropertyValue('--theme-guideline-border')).toBe('#c86850');

      config.applyToElement(el, 'night');
      expect(el.style.getPropertyValue('--theme-bg')).toBe('#181820');
      expect(el.style.getPropertyValue('--theme-guideline-border')).toBe('#6088a0');
    });

    it('supports custom token overrides per theme', () => {
      config.setCustomTokens('washi', {
        background: '#ffffff',
        guidelineBorder: '#ff0000',
      });

      const tokens = config.getTokens('washi');
      expect(tokens.background).toBe('#ffffff');
      expect(tokens.guidelineBorder).toBe('#ff0000');
      expect(tokens.text).toBe(WASHI_LIGHT_THEME.text); // unchanged base preset

      const cssVars = config.getCssVariables('washi');
      expect(cssVars['--theme-bg']).toBe('#ffffff');
      expect(cssVars['--theme-guideline-border']).toBe('#ff0000');
    });
  });

  describe('Typesetting Indicator Controls & Badge Toggles', () => {
    it('toggles "ぶら下げ+1" badge visibility', () => {
      expect(config.getShowHangingBadge()).toBe(true);

      config.setShowHangingBadge(false);
      expect(config.getShowHangingBadge()).toBe(false);

      const nextState = config.toggleHangingBadge();
      expect(nextState).toBe(true);
      expect(config.getShowHangingBadge()).toBe(true);
    });

    it('toggles column guideline, ruler, and grid lines visibility', () => {
      config.setShowColumnGuideline(false);
      expect(config.getShowColumnGuideline()).toBe(false);
      expect(config.toggleColumnGuideline()).toBe(true);

      config.setShowRuler(false);
      expect(config.getShowRuler()).toBe(false);
      expect(config.toggleRuler()).toBe(true);

      config.setShowGridLines(false);
      expect(config.getShowGridLines()).toBe(false);
      expect(config.toggleGridLines()).toBe(true);
    });

    it('clamps charsPerLine strictly within [30, 50]', () => {
      config.setCharsPerLine(15);
      expect(config.getCharsPerLine()).toBe(MIN_CHARS_PER_LINE);

      config.setCharsPerLine(70);
      expect(config.getCharsPerLine()).toBe(MAX_CHARS_PER_LINE);

      config.setCharsPerLine(42);
      expect(config.getCharsPerLine()).toBe(42);
    });

    it('clamps fontSize strictly within [10, 72]', () => {
      config.setFontSize(5);
      expect(config.getFontSize()).toBe(MIN_FONT_SIZE);

      config.setFontSize(100);
      expect(config.getFontSize()).toBe(MAX_FONT_SIZE);

      config.setFontSize(24);
      expect(config.getFontSize()).toBe(24);
    });
  });

  describe('Serialization, Deserialization & Fallback Verification', () => {
    it('serializes to JSON object and string correctly', () => {
      config.setTheme('night');
      config.setShowHangingBadge(false);
      config.setCharsPerLine(38);

      const json = config.toJSON();
      expect(json).toEqual({
        theme: 'night',
        showHangingBadge: false,
        showColumnGuideline: true,
        showRuler: true,
        showGridLines: true,
        charsPerLine: 38,
        linesPerPage: 20,
        fontSize: 17,
        isVertical: false,
        customTokens: {},
      });

      const str = config.serialize();
      expect(typeof str).toBe('string');
      expect(str).toContain('"theme":"night"');
      expect(str).toContain('"showHangingBadge":false');
      expect(str).toContain('"charsPerLine":38');
    });

    it('deserializes roundtrip correctly', () => {
      config.setTheme('night');
      config.setShowHangingBadge(false);
      config.setCustomTokens('night', { background: '#0a0a0f' });

      const serialized = config.serialize();
      const restored = TypographyThemeConfig.deserialize(serialized);

      expect(restored.getTheme()).toBe('night');
      expect(restored.getShowHangingBadge()).toBe(false);
      expect(restored.getTokens('night').background).toBe('#0a0a0f');
    });

    it('handles corrupt, null, undefined, or empty inputs gracefully with fallbacks', () => {
      const fromNull = TypographyThemeConfig.fromJSON(null);
      expect(fromNull.getTheme()).toBe('washi');
      expect(fromNull.getShowHangingBadge()).toBe(true);
      expect(fromNull.getCharsPerLine()).toBe(DEFAULT_CHARS_PER_LINE);

      const fromEmptyObj = TypographyThemeConfig.fromJSON({});
      expect(fromEmptyObj.getTheme()).toBe('washi');
      expect(fromEmptyObj.getShowHangingBadge()).toBe(true);
      expect(fromEmptyObj.getCharsPerLine()).toBe(DEFAULT_CHARS_PER_LINE);

      const fromCorruptStr = TypographyThemeConfig.deserialize('invalid json {{{');
      expect(fromCorruptStr.getTheme()).toBe('washi');
      expect(fromCorruptStr.getShowHangingBadge()).toBe(true);
    });

    it('validates and falls back on invalid property types and out-of-range numeric values', () => {
      const invalidData = {
        theme: 12345, // invalid type
        showHangingBadge: 'not-a-boolean', // invalid type
        charsPerLine: 'NaN_value', // invalid number
        linesPerPage: -10, // out of range
        fontSize: 999, // out of range
        customTokens: 'invalid_tokens', // invalid type
      };

      const restored = TypographyThemeConfig.fromJSON(invalidData);
      expect(restored.getTheme()).toBe('washi'); // fallback
      expect(restored.getShowHangingBadge()).toBe(true); // fallback
      expect(restored.getCharsPerLine()).toBe(DEFAULT_CHARS_PER_LINE); // fallback
      expect(restored.getLinesPerPage()).toBe(20); // fallback
      expect(restored.getFontSize()).toBe(MAX_FONT_SIZE); // clamped
      expect(restored.getCustomTokens()).toEqual({});
    });
  });
});
