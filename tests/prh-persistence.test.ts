// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrhPersistenceManager,
  exportToPrhYaml,
  parsePrhYaml,
  exportToPrhJson,
  parsePrhJson,
  DEFAULT_PRH_RULES,
  type PlotailorPrhRule,
} from '../src/core/editor/PrhPersistenceManager.js';
import { VirtualFileSystem } from '../src/core/fs/VirtualFileSystem.js';

class MockStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('PrhPersistenceManager & Serializers', () => {
  let mockStorage: MockStorage;
  let vfs: VirtualFileSystem;
  let manager: PrhPersistenceManager;

  beforeEach(() => {
    mockStorage = new MockStorage();
    vfs = new VirtualFileSystem();
    manager = new PrhPersistenceManager(vfs, mockStorage);
  });

  describe('Default Seed Logic', () => {
    it('initializes new projects with DEFAULT_PRH_RULES seed', () => {
      const rules = manager.getRules('proj-alpha');
      expect(rules.length).toBe(DEFAULT_PRH_RULES.length);
      expect(rules[0].expected).toBe('ヴァレリウス');
      expect(rules[0].scope).toBe('character');
      expect(rules[0].characterId).toBe('char-valerius');
    });

    it('isolates seed rules across different project IDs', () => {
      manager.getRules('proj-A');
      manager.addRule({ expected: '独白', patterns: ['モノローグ'], scope: 'style' }, 'proj-A');

      const rulesA = manager.getRules('proj-A');
      const rulesB = manager.getRules('proj-B');
      expect(rulesA.length).toBe(4);
      expect(rulesB.length).toBe(3);
    });
  });

  describe('CRUD Operations', () => {
    it('adds, updates, and deletes rules correctly', () => {
      const added = manager.addRule(
        {
          expected: 'セレネ',
          patterns: ['セレーネ'],
          scope: 'character',
          action: 'replace',
          syntaxType: 'plain',
          characterId: 'char-selene',
          description: '巫女セレネの表記統一',
        },
        'proj-crud'
      );

      expect(added.id).toBeDefined();
      expect(manager.getRules('proj-crud').length).toBe(4);

      const updated = manager.updateRule(
        added.id,
        { description: '更新された説明', action: 'warn' },
        'proj-crud'
      );

      expect(updated?.description).toBe('更新された説明');
      expect(updated?.action).toBe('warn');

      const deleted = manager.deleteRule(added.id, 'proj-crud');
      expect(deleted).toBe(true);
      expect(manager.getRules('proj-crud').length).toBe(3);
    });
  });

  describe('YAML Serialization & Parsing (Bidirectional with Literary Metadata)', () => {
    it('serializes rules to valid PRH YAML with metadata', () => {
      const rules: PlotailorPrhRule[] = [
        {
          id: 'rule-01',
          expected: '忘却の砦',
          patterns: ['北の砦', '北方の砦'],
          scope: 'lore',
          action: 'replace',
          syntaxType: 'plain',
          description: '要塞名称の統一',
          enabled: true,
        },
      ];

      const yaml = exportToPrhYaml(rules);
      expect(yaml).toContain('version: 1');
      expect(yaml).toContain('expected: 忘却の砦');
      expect(yaml).toContain('- 北の砦');
      expect(yaml).toContain('scope: lore');
      expect(yaml).toContain('action: replace');
      expect(yaml).toContain('syntaxType: plain');
      expect(yaml).toContain('description: 要塞名称の統一');
    });

    it('parses PRH YAML preserving standard and literary metadata fields', () => {
      const yamlStr = `
version: 1
rules:
  - expected: ヴァレリウス
    patterns:
      - バレリウス
      - ヴァレリウス将軍
    scope: character
    action: replace
    syntaxType: plain
    characterId: char-valerius
    description: 主人公の表記統一
    id: prh-custom-01
`;

      const parsed = parsePrhYaml(yamlStr);
      expect(parsed.length).toBe(1);
      const r = parsed[0];
      expect(r.id).toBe('prh-custom-01');
      expect(r.expected).toBe('ヴァレリウス');
      expect(r.patterns).toEqual(['バレリウス', 'ヴァレリウス将軍']);
      expect(r.scope).toBe('character');
      expect(r.action).toBe('replace');
      expect(r.syntaxType).toBe('plain');
      expect(r.characterId).toBe('char-valerius');
      expect(r.description).toBe('主人公の表記統一');
    });

    it('handles quotes in YAML string gracefully', () => {
      const yamlStr = `
version: 1
rules:
  - expected: "気づく"
    patterns:
      - '気付く'
    description: "常用漢字の統一"
`;
      const parsed = parsePrhYaml(yamlStr);
      expect(parsed.length).toBe(1);
      expect(parsed[0].expected).toBe('気づく');
      expect(parsed[0].patterns).toEqual(['気付く']);
      expect(parsed[0].description).toBe('常用漢字の統一');
    });

    it('defensively handles corrupt or malformed YAML syntax', () => {
      const badYaml = `
version: 1
rules:
  broken_line_without_expected
  - invalid_key: test
  patterns:
    - orphan
  - expected: 正常ルール
    patterns:
      - 揺れ
`;
      const parsed = parsePrhYaml(badYaml);
      expect(parsed.length).toBe(1);
      expect(parsed[0].expected).toBe('正常ルール');
      expect(parsed[0].patterns).toEqual(['揺れ']);
    });
  });

  describe('JSON Serialization & Parsing', () => {
    it('serializes and parses JSON preserving full data structures', () => {
      const rules: PlotailorPrhRule[] = [
        {
          id: 'json-01',
          expected: '双月の凶兆',
          patterns: ['双月合'],
          scope: 'lore',
          action: 'warn',
          syntaxType: 'regex',
          description: '伏線フレーズ検知',
          enabled: true,
          updatedAt: 123456789,
        },
      ];

      const jsonStr = exportToPrhJson(rules);
      const parsed = parsePrhJson(jsonStr);

      expect(parsed.length).toBe(1);
      expect(parsed[0]).toEqual(rules[0]);
    });

    it('defensively handles invalid JSON without throwing errors', () => {
      expect(parsePrhJson('invalid json string {[{')).toEqual([]);
      expect(parsePrhJson('')).toEqual([]);
    });
  });

  describe('LocalStorage Persistence', () => {
    it('saves rules to LocalStorage with project ID key isolation', () => {
      manager.addRule({ expected: '試作', patterns: ['プロトタイプ'] }, 'proj-1');
      manager.saveToStorage('proj-1');

      const raw = mockStorage.getItem('plotailor_prh_rules_proj-1');
      expect(raw).toBeDefined();
      expect(raw).toContain('試作');

      const newManager = new PrhPersistenceManager(vfs, mockStorage);
      const loaded = newManager.loadFromStorage('proj-1');
      expect(loaded.length).toBe(4);
      expect(loaded.some((r) => r.expected === '試作')).toBe(true);
    });
  });

  describe('VirtualFileSystem (VFS) Persistence', () => {
    it('saves and loads PRH rules to/from VFS paths', async () => {
      manager.addRule({ expected: '帝国', patterns: ['インペリウム'] }, 'vfs-proj');
      await manager.saveToVFS('vfs-proj');

      expect(await vfs.exists('/projects/vfs-proj/prh/rules.json')).toBe(true);
      expect(await vfs.exists('/projects/vfs-proj/prh/plotailor-prh.yml')).toBe(true);

      const freshManager = new PrhPersistenceManager(vfs, mockStorage);
      const loaded = await freshManager.loadFromVFS('vfs-proj');

      expect(loaded.length).toBe(4);
      expect(loaded.some((r) => r.expected === '帝国')).toBe(true);
    });
  });
});
