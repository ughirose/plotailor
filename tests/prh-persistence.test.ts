import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrhPersistenceManager,
  DEFAULT_PRH_RULES,
} from '../src/core/editor/PrhPersistenceManager.js';
import type { PlotailorPrhRule } from '@worldcraft/schema';

describe('PrhPersistenceManager - 表記ゆれ辞書永続化＆PRH YAML/JSONエクスポート', () => {
  const sampleRules: PlotailorPrhRule[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      expected: 'ヴァレリウス',
      patterns: ['バレリウス', 'ばれりうす'],
      scope: 'all',
      action: 'suggest',
      syntaxType: 'general',
      description: '人名正規化（ヴァレリウス将軍）',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      expected: 'お兄様',
      patterns: ['兄さん', '兄貴'],
      scope: 'dialogue',
      action: 'suggest',
      syntaxType: 'vocative',
      characterId: 'char-alice',
      description: 'アリスの兄に対する一貫呼称',
    },
  ];

  describe('YAML Serialization & Parsing (標準PRH仕様)', () => {
    it('serializes rules to standard PRH YAML format', () => {
      const yaml = PrhPersistenceManager.serializeToYaml(sampleRules);
      expect(yaml).toContain('version: 1');
      expect(yaml).toContain('rules:');
      expect(yaml).toContain('- expected: ヴァレリウス');
      expect(yaml).toContain('- バレリウス');
      expect(yaml).toContain('- ばれりうす');
      expect(yaml).toContain('- expected: お兄様');
      expect(yaml).toContain('scope: dialogue');
      expect(yaml).toContain('syntaxType: vocative');
      expect(yaml).toContain('characterId: char-alice');
    });

    it('roundtrips rules through YAML serialization and parsing', () => {
      const yaml = PrhPersistenceManager.serializeToYaml(sampleRules);
      const parsed = PrhPersistenceManager.parseFromYaml(yaml);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].expected).toBe('ヴァレリウス');
      expect(parsed[0].patterns).toEqual(['バレリウス', 'ばれりうす']);
      expect(parsed[1].expected).toBe('お兄様');
      expect(parsed[1].characterId).toBe('char-alice');
      expect(parsed[1].syntaxType).toBe('vocative');
    });

    it('handles empty or corrupt YAML gracefully without throwing', () => {
      expect(PrhPersistenceManager.parseFromYaml('')).toEqual([]);
      expect(PrhPersistenceManager.parseFromYaml('not a valid yaml: !!!')).toEqual([]);
    });
  });

  describe('JSON Serialization & Parsing', () => {
    it('serializes and parses rules to/from JSON cleanly', () => {
      const jsonStr = PrhPersistenceManager.serializeToJson(sampleRules);
      const parsed = PrhPersistenceManager.parseFromJson(jsonStr);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe(sampleRules[0].id);
      expect(parsed[1].expected).toBe('お兄様');
    });

    it('handles corrupt JSON gracefully', () => {
      expect(PrhPersistenceManager.parseFromJson('{ broken json')).toEqual([]);
      expect(PrhPersistenceManager.parseFromJson('')).toEqual([]);
    });
  });

  describe('Storage Persistence (LocalStorage & Project Isolation)', () => {
    let mockStorage: Record<string, string>;
    let fakeStorage: Storage;

    beforeEach(() => {
      mockStorage = {};
      fakeStorage = {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
        removeItem: (k: string) => { delete mockStorage[k]; },
        clear: () => { mockStorage = {}; },
        key: (i: number) => Object.keys(mockStorage)[i] ?? null,
        length: 0,
      };
    });

    it('returns default rules when loading from empty storage', () => {
      const loaded = PrhPersistenceManager.loadFromStorage('proj-1', fakeStorage);
      expect(loaded).toEqual(DEFAULT_PRH_RULES);
    });

    it('saves and reloads rules isolated by project ID', () => {
      const proj1Rules: PlotailorPrhRule[] = [sampleRules[0]];
      const proj2Rules: PlotailorPrhRule[] = [sampleRules[1]];

      PrhPersistenceManager.saveToStorage('proj-1', proj1Rules, fakeStorage);
      PrhPersistenceManager.saveToStorage('proj-2', proj2Rules, fakeStorage);

      const loaded1 = PrhPersistenceManager.loadFromStorage('proj-1', fakeStorage);
      const loaded2 = PrhPersistenceManager.loadFromStorage('proj-2', fakeStorage);

      expect(loaded1).toHaveLength(1);
      expect(loaded1[0].expected).toBe('ヴァレリウス');

      expect(loaded2).toHaveLength(1);
      expect(loaded2[0].expected).toBe('お兄様');
    });
  });
});
