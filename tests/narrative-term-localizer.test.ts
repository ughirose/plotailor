import { describe, it, expect } from 'vitest';
import {
  NarrativeTermLocalizer,
  LITERARY_TERM_MAP,
  TECHNICAL_TERM_MAP,
  DEFAULT_UI_KEY_MAP,
} from '../src/core/editor/NarrativeTermLocalizer.js';

describe('NarrativeTermLocalizer', () => {
  const localizer = new NarrativeTermLocalizer();

  describe('Literary theory terms translation', () => {
    it('translates Sjuzhet to 語り順', () => {
      expect(localizer.translateLiteraryTerm('Sjuzhet')).toBe('語り順');
      expect(localizer.translateLiteraryTerm('sjuzhet')).toBe('語り順');
      expect(localizer.translateLiteraryTerm('Syuzhet')).toBe('語り順');
      expect(localizer.translateLiteraryTerm('syuzhet')).toBe('語り順');
    });

    it('translates Fabula to 作中時系列', () => {
      expect(localizer.translateLiteraryTerm('Fabula')).toBe('作中時系列');
      expect(localizer.translateLiteraryTerm('fabula')).toBe('作中時系列');
    });

    it('returns unknown terms as-is', () => {
      expect(localizer.translateLiteraryTerm('Mimesis')).toBe('Mimesis');
    });
  });

  describe('Technical terms translation', () => {
    it('translates VFS to 作品ファイル管理', () => {
      expect(localizer.translateTechnicalTerm('VFS')).toBe('作品ファイル管理');
      expect(localizer.translateTechnicalTerm('vfs')).toBe('作品ファイル管理');
    });

    it('translates PoP to 執筆プロセス証明', () => {
      expect(localizer.translateTechnicalTerm('PoP')).toBe('執筆プロセス証明');
      expect(localizer.translateTechnicalTerm('pop')).toBe('執筆プロセス証明');
    });

    it('translates DAG to 因果相関図', () => {
      expect(localizer.translateTechnicalTerm('DAG')).toBe('因果相関図');
      expect(localizer.translateTechnicalTerm('dag')).toBe('因果相関図');
    });

    it('returns unknown technical terms as-is', () => {
      expect(localizer.translateTechnicalTerm('HTTP')).toBe('HTTP');
    });
  });

  describe('Bidirectional UI string mapping', () => {
    it('translates UI key to user display label', () => {
      expect(localizer.getUILabel('workspace.explorer')).toBe('作品ファイル');
      expect(localizer.getUILabel('editor.timeline')).toBe('作中時系列');
      expect(localizer.getUILabel('editor.narrative_order')).toBe('語り順');
      expect(localizer.getUILabel('action.save')).toBe('保存');
    });

    it('translates user display label back to internal UI key', () => {
      expect(localizer.getUIKey('作品ファイル')).toBe('workspace.explorer');
      expect(localizer.getUIKey('作中時系列')).toBe('editor.timeline');
      expect(localizer.getUIKey('語り順')).toBe('editor.narrative_order');
      expect(localizer.getUIKey('保存')).toBe('action.save');
    });

    it('supports custom UI mappings via constructor and registerUIMapping', () => {
      const customLocalizer = new NarrativeTermLocalizer({
        'custom.key': 'カスタム項目',
      });

      expect(customLocalizer.getUILabel('custom.key')).toBe('カスタム項目');
      expect(customLocalizer.getUIKey('カスタム項目')).toBe('custom.key');

      customLocalizer.registerUIMapping('another.key', '別の項目');
      expect(customLocalizer.getUILabel('another.key')).toBe('別の項目');
      expect(customLocalizer.getUIKey('別の項目')).toBe('another.key');
    });

    it('returns fallback or original key/label when mapping is missing', () => {
      expect(localizer.getUILabel('missing.key')).toBe('missing.key');
      expect(localizer.getUILabel('missing.key', 'デフォルト')).toBe('デフォルト');

      expect(localizer.getUIKey('未登録ラベル')).toBe('未登録ラベル');
      expect(localizer.getUIKey('未登録ラベル', 'default.key')).toBe('default.key');
    });
  });

  describe('General translateTerm method', () => {
    it('translates literary, technical, or UI keys uniformly', () => {
      expect(localizer.translateTerm('Sjuzhet')).toBe('語り順');
      expect(localizer.translateTerm('Fabula')).toBe('作中時系列');
      expect(localizer.translateTerm('VFS')).toBe('作品ファイル管理');
      expect(localizer.translateTerm('PoP')).toBe('執筆プロセス証明');
      expect(localizer.translateTerm('DAG')).toBe('因果相関図');
      expect(localizer.translateTerm('workspace.editor')).toBe('執筆エディタ');
    });
  });

  describe('Text localization and reverse-localization', () => {
    it('localizes technical/literary terms within prose or UI text', () => {
      const rawText = 'VFSに保存された原稿のSjuzhetとFabulaを確認し、PoPとDAGを出力する。';
      const localized = localizer.localizeText(rawText);

      expect(localized).toBe(
        '作品ファイル管理に保存された原稿の語り順と作中時系列を確認し、執筆プロセス証明と因果相関図を出力する。'
      );
    });

    it('reverse localizes text from display labels to internal keys', () => {
      const displayLabelText = '作品ファイルを開いて、保存を実行します。';
      const reversed = localizer.reverseLocalizeText(displayLabelText);

      expect(reversed).toBe('workspace.explorerを開いて、action.saveを実行します。');
    });
  });

  describe('Term entries dictionary inspection', () => {
    it('returns all term entries with category labels', () => {
      const entries = localizer.getAllTermEntries();
      expect(entries.length).toBeGreaterThan(10);

      const literaryEntries = entries.filter((e) => e.category === 'literary');
      const technicalEntries = entries.filter((e) => e.category === 'technical');
      const uiEntries = entries.filter((e) => e.category === 'ui');

      expect(literaryEntries.some((e) => e.term === 'Sjuzhet' && e.translated === '語り順')).toBe(true);
      expect(technicalEntries.some((e) => e.term === 'VFS' && e.translated === '作品ファイル管理')).toBe(true);
      expect(uiEntries.some((e) => e.term === 'workspace.explorer' && e.translated === '作品ファイル')).toBe(true);
    });
  });
});
