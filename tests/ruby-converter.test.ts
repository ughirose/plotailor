import { describe, it, expect } from 'vitest';
import {
  RubyBatchConverter,
  SourceToDisplayMap,
  ThreePaneWorkspace,
  PlotailorIDE,
} from '../src/index.js';

describe('RubyBatchConverter - Batch Normalization & Format Conversion', () => {
  describe('Batch Normalization (Variant Syntax -> Standard Aozora)', () => {
    it('normalizes variant angle bracket ruby <<るび>> and ＜＜るび＞＞', () => {
      const raw = '彼は｜青空<<あおぞら>>を、彼女は漢字＜＜かんじ＞＞を見つめた。';
      const result = RubyBatchConverter.normalizeText(raw);

      expect(result.convertedText).toBe('彼は｜青空《あおぞら》を、彼女は漢字《かんじ》を見つめた。');
      expect(result.stats.rubyCount).toBe(2);
      expect(result.stats.normalizedCount).toBe(2);
      expect(result.verificationReport.isConsistent).toBe(true);
    });

    it('normalizes variant bouten <<<<傍点>>>>, ＜＜＜＜傍点＞＞＞＞, and ［＃...に傍点］', () => {
      const raw = 'これは<<<<極めて重要>>>>で、＜＜＜＜至急＞＞＞＞対応が［＃「必要」に傍点］である。';
      const result = RubyBatchConverter.normalizeText(raw);

      expect(result.convertedText).toBe('これは《《極めて重要》》で、《《至急》》対応が《《必要》》である。');
      expect(result.stats.boutenCount).toBe(3);
      expect(result.stats.normalizedCount).toBe(3);
      expect(result.verificationReport.isConsistent).toBe(true);
    });

    it('normalizes halfwidth pipe and parentheses ruby variants |親文字(るび) and 漢字（るび）', () => {
      const raw = '|魔法(まほう)の発動と漢字（かんじ）の解読。';
      const result = RubyBatchConverter.normalizeText(raw);

      expect(result.convertedText).toBe('｜魔法《まほう》の発動と漢字《かんじ》の解読。');
      expect(result.stats.rubyCount).toBe(2);
      expect(result.verificationReport.isConsistent).toBe(true);
    });
  });

  describe('Format Auto-Detection & Cross-Format Conversion Engine', () => {
    it('detects Narou format signatures with parentheses ruby', () => {
      const narouText = '彼は｜夜神月(やがみらいと)であり、漢字(かんじ)を書く。';
      const detected = RubyBatchConverter.detectFormat(narouText);
      expect(detected).toBe('narou');
    });

    it('converts Aozora/Kakuyomu format to Narou format', () => {
      const aozoraText = '｜青空《あおぞら》の読書と漢字《かんじ》の学習。';
      const result = RubyBatchConverter.convertFormat(aozoraText, {
        sourceFormat: 'aozora',
        targetFormat: 'narou',
      });

      expect(result.convertedText).toBe('｜青空(あおぞら)の読書と漢字(かんじ)の学習。');
      expect(result.targetFormat).toBe('narou');
      expect(result.verificationReport.isConsistent).toBe(true);
    });

    it('converts Narou format back to Aozora format', () => {
      const narouText = '｜青空(あおぞら)の読書と漢字(かんじ)の学習。';
      const result = RubyBatchConverter.convertFormat(narouText, {
        sourceFormat: 'narou',
        targetFormat: 'aozora',
      });

      expect(result.convertedText).toBe('｜青空《あおぞら》の読書と漢字《かんじ》の学習。');
      expect(result.targetFormat).toBe('aozora');
      expect(result.verificationReport.isConsistent).toBe(true);
    });

    it('converts bouten emphasis to Narou dot rubies when enabled', () => {
      const textWithBouten = 'これは《《重要》》な指示だ。';
      const result = RubyBatchConverter.convertFormat(textWithBouten, {
        sourceFormat: 'aozora',
        targetFormat: 'narou',
        convertBoutenToNarouDots: true,
      });

      expect(result.convertedText).toBe('これは｜重(・)｜要(・)な指示だ。');
      expect(result.verificationReport.isConsistent).toBe(true);
    });
  });

  describe('Text Import & Export Pipeline', () => {
    it('imports raw text with variant markup into standard normalized format', () => {
      const rawImport = '<<IMPORT>> テスト |要塞(ようさい)の<<<<決戦>>>>';
      const result = RubyBatchConverter.importText(rawImport);

      expect(result.convertedText).toBe('<<IMPORT>> テスト ｜要塞《ようさい》の《《決戦》》');
      expect(result.map).toBeInstanceOf(SourceToDisplayMap);
      expect(result.verificationReport.isConsistent).toBe(true);
    });

    it('exports normalized text to Kakuyomu and Narou formats', () => {
      const normalized = '｜要塞《ようさい》の《《決戦》》';

      const kakuyomuExport = RubyBatchConverter.exportText(normalized, 'kakuyomu');
      expect(kakuyomuExport.convertedText).toBe('｜要塞《ようさい》の《《決戦》》');

      const narouExport = RubyBatchConverter.exportText(normalized, 'narou');
      expect(narouExport.convertedText).toBe('｜要塞(ようさい)の《《決戦》》');
    });
  });

  describe('SourceToDisplayMap & Offset Consistency Verification', () => {
    it('generates exact bidirectional offset mapping and verifies monotonicity and boundary limits', () => {
      const source = '本文前 |親文字<<るび>> 本文後 <<<<傍点>>>>';
      const result = RubyBatchConverter.normalizeText(source);

      const map = result.map;
      const report = result.verificationReport;

      expect(report.isConsistent).toBe(true);
      expect(report.errors.length).toBe(0);
      expect(report.totalCheckPoints).toBeGreaterThan(0);

      // Verify mapping bounds
      const displayOffset0 = map.toDisplayOffset(0);
      expect(displayOffset0).toBe(0);

      const endRawOffset = source.length;
      const endDisplayOffset = map.toDisplayOffset(endRawOffset);
      expect(endDisplayOffset).toBe(result.convertedText.length);
    });

    it('returns consistency report for complex mixed conversions', () => {
      const text = '［＃「第一話」に傍点］: ｜主人公<<しゅじんこう>>の漢字（かんじ）アドベンチャー。';
      const report = RubyBatchConverter.verifyOffsetMappingConsistency(
        text,
        RubyBatchConverter.normalizeText(text).convertedText,
        RubyBatchConverter.normalizeText(text).map
      );

      expect(report.isConsistent).toBe(true);
      expect(report.errors).toEqual([]);
    });
  });

  describe('3-Pane IDE Workspace Integration', () => {
    it('integrates batch normalization seamlessly into ThreePaneWorkspace without modals', () => {
      const workspace = new ThreePaneWorkspace({
        initialText: '｜主人公<<しゅじんこう>>の<<<<冒険>>>>。',
      });

      const result = workspace.batchNormalizeRuby();
      expect(result.convertedText).toBe('｜主人公《しゅじんこう》の《《冒険》》。');
      expect(workspace.getState().rawText).toBe('｜主人公《しゅじんこう》の《《冒険》》。');
    });

    it('integrates import and export pipelines into ThreePaneWorkspace and PlotailorIDE', () => {
      const ide = new PlotailorIDE();

      const importRes = ide.importText('|魔法(まほう)の<<杖>>');
      expect(importRes.convertedText).toBe('｜魔法《まほう》の《杖》');

      const exportRes = ide.exportText(importRes.convertedText, 'narou');
      expect(exportRes.convertedText).toBe('｜魔法(まほう)の《杖》');
    });
  });
});
