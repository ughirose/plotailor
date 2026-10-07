import { VirtualFileSystem } from '../fs/VirtualFileSystem.js';

export type PrhRuleScope = 'character' | 'lore' | 'general' | 'style' | 'exception' | 'dialogue' | 'narration' | 'ruby' | 'all';
export type PrhRuleAction = 'replace' | 'warn' | 'ignore' | 'suggest';
export type PrhSyntaxType = 'plain' | 'regex' | 'vocative' | 'referential' | 'general';

export interface PlotailorPrhRule {
  id: string;
  expected: string;
  patterns: string[];
  scope?: PrhRuleScope;
  action?: PrhRuleAction;
  syntaxType?: PrhSyntaxType;
  characterId?: string;
  description?: string;
  enabled?: boolean;
  updatedAt?: number;
}

export const DEFAULT_PRH_RULES: PlotailorPrhRule[] = [
  {
    id: 'prh-seed-001',
    expected: 'ヴァレリウス',
    patterns: ['バレリウス', 'ヴァレリウス将軍'],
    scope: 'character',
    action: 'replace',
    syntaxType: 'plain',
    characterId: 'char-valerius',
    description: '主要人物「ヴァレリウス」の作中表記統一',
    enabled: true,
    updatedAt: 1700000000000,
  },
  {
    id: 'prh-seed-002',
    expected: '気づく',
    patterns: ['気付く', 'きづく'],
    scope: 'general',
    action: 'warn',
    syntaxType: 'plain',
    description: '常用漢字・文芸揺れ（気付く→気づく）の判定',
    enabled: true,
    updatedAt: 1700000000000,
  },
  {
    id: 'prh-seed-003',
    expected: '星辰の盟約',
    patterns: ['星神の盟約', '星辰の契約'],
    scope: 'lore',
    action: 'replace',
    syntaxType: 'plain',
    description: '作中重要固有名詞（星辰の盟約）の誤記ガード',
    enabled: true,
    updatedAt: 1700000000000,
  },
];

function cleanYamlValue(val: string): string {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Serializes PlotailorPrhRule array to standard PRH YAML format with literary metadata.
 */
export function exportToPrhYaml(rules: PlotailorPrhRule[]): string {
  const lines: string[] = ['version: 1', 'rules:'];

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    lines.push(`  - expected: ${rule.expected}`);

    if (rule.patterns && rule.patterns.length > 0) {
      lines.push('    patterns:');
      for (const p of rule.patterns) {
        lines.push(`      - ${p}`);
      }
    }

    if (rule.scope) {
      lines.push(`    scope: ${rule.scope}`);
    }
    if (rule.action) {
      lines.push(`    action: ${rule.action}`);
    }
    if (rule.syntaxType) {
      lines.push(`    syntaxType: ${rule.syntaxType}`);
    }
    if (rule.characterId) {
      lines.push(`    characterId: ${rule.characterId}`);
    }
    if (rule.description) {
      lines.push(`    description: ${rule.description}`);
    }
    if (rule.id) {
      lines.push(`    id: ${rule.id}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Robust defensive parser for PRH YAML string that converts lines into PlotailorPrhRule array.
 * Handles missing fields, bad indentation, or malformed YAML without throwing exceptions.
 */
export function parsePrhYaml(yamlStr: string): PlotailorPrhRule[] {
  if (!yamlStr || typeof yamlStr !== 'string') return [];

  const rules: PlotailorPrhRule[] = [];
  const lines = yamlStr.split(/\r?\n/);

  let currentRule: Partial<PlotailorPrhRule> | null = null;
  let inPatterns = false;

  const flushCurrent = () => {
    if (currentRule && currentRule.expected) {
      const id = currentRule.id || `prh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      rules.push({
        id,
        expected: cleanYamlValue(String(currentRule.expected)),
        patterns: Array.isArray(currentRule.patterns)
          ? currentRule.patterns.map((p) => cleanYamlValue(String(p))).filter(Boolean)
          : [],
        scope: (currentRule.scope as PrhRuleScope) || 'general',
        action: (currentRule.action as PrhRuleAction) || 'replace',
        syntaxType: (currentRule.syntaxType as PrhSyntaxType) || 'plain',
        characterId: currentRule.characterId ? cleanYamlValue(String(currentRule.characterId)) : undefined,
        description: currentRule.description ? cleanYamlValue(String(currentRule.description)) : '',
        enabled: currentRule.enabled !== false,
        updatedAt: currentRule.updatedAt || Date.now(),
      });
    }
    currentRule = null;
    inPatterns = false;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- expected:') || trimmed.startsWith('expected:')) {
      flushCurrent();
      const val = cleanYamlValue(trimmed.replace(/^-?\s*expected:\s*/, ''));
      currentRule = {
        expected: val,
        patterns: [],
        enabled: true,
      };
      inPatterns = false;
    } else if (trimmed.startsWith('patterns:')) {
      if (currentRule) inPatterns = true;
    } else if (inPatterns && trimmed.startsWith('-')) {
      const p = cleanYamlValue(trimmed.replace(/^-\s*/, ''));
      if (currentRule && currentRule.patterns && p) {
        currentRule.patterns.push(p);
      }
    } else if (currentRule) {
      inPatterns = false;
      if (trimmed.startsWith('scope:')) {
        const val = cleanYamlValue(trimmed.replace(/^scope:\s*/, '')) as PrhRuleScope;
        currentRule.scope = val;
      } else if (trimmed.startsWith('action:')) {
        const val = cleanYamlValue(trimmed.replace(/^action:\s*/, '')) as PrhRuleAction;
        currentRule.action = val;
      } else if (trimmed.startsWith('syntaxType:')) {
        const val = cleanYamlValue(trimmed.replace(/^syntaxType:\s*/, '')) as PrhSyntaxType;
        currentRule.syntaxType = val;
      } else if (trimmed.startsWith('characterId:')) {
        currentRule.characterId = cleanYamlValue(trimmed.replace(/^characterId:\s*/, ''));
      } else if (trimmed.startsWith('description:')) {
        currentRule.description = cleanYamlValue(trimmed.replace(/^description:\s*/, ''));
      } else if (trimmed.startsWith('id:')) {
        currentRule.id = cleanYamlValue(trimmed.replace(/^id:\s*/, ''));
      }
    }
  }

  flushCurrent();

  return rules;
}

/**
 * Serializes PlotailorPrhRule array to formatted JSON string.
 */
export function exportToPrhJson(rules: PlotailorPrhRule[]): string {
  return JSON.stringify(rules, null, 2);
}

/**
 * Parses PRH JSON string to PlotailorPrhRule array with defensive validation.
 */
export function parsePrhJson(jsonStr: string): PlotailorPrhRule[] {
  if (!jsonStr || typeof jsonStr !== 'string') return [];

  try {
    const raw = JSON.parse(jsonStr);
    const array = Array.isArray(raw) ? raw : raw?.rules && Array.isArray(raw.rules) ? raw.rules : [];
    const validRules: PlotailorPrhRule[] = [];

    for (const item of array) {
      if (!item || typeof item !== 'object' || !item.expected) continue;
      validRules.push({
        id: typeof item.id === 'string' ? item.id : `prh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        expected: String(item.expected),
        patterns: Array.isArray(item.patterns) ? item.patterns.map(String) : [],
        scope: item.scope || 'general',
        action: item.action || 'replace',
        syntaxType: item.syntaxType || 'plain',
        characterId: item.characterId ? String(item.characterId) : undefined,
        description: item.description ? String(item.description) : '',
        enabled: item.enabled !== false,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      });
    }

    return validRules;
  } catch {
    return [];
  }
}

export class PrhPersistenceManager {
  private vfs?: VirtualFileSystem;
  private storage?: Storage;
  private projectRulesMap: Map<string, PlotailorPrhRule[]> = new Map();

  constructor(vfs?: VirtualFileSystem, storage?: Storage) {
    this.vfs = vfs;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : undefined);
  }

  public getStorageKey(projectId: string): string {
    return `plotailor_prh_rules_${projectId}`;
  }

  public getLegacyStorageKey(projectId: string): string {
    return `plotailor_project_${projectId}_prh_rules`;
  }

  public getVfsJsonPath(projectId: string): string {
    return `/projects/${projectId}/prh/rules.json`;
  }

  public getVfsYamlPath(projectId: string): string {
    return `/projects/${projectId}/prh/plotailor-prh.yml`;
  }

  public getRules(projectId: string = 'default'): PlotailorPrhRule[] {
    if (!this.projectRulesMap.has(projectId)) {
      this.loadFromStorage(projectId);
    }
    const list = this.projectRulesMap.get(projectId) || [];
    return list.map((r) => ({ ...r, patterns: [...r.patterns] }));
  }

  public setRules(rules: PlotailorPrhRule[], projectId: string = 'default'): void {
    this.projectRulesMap.set(
      projectId,
      rules.map((r) => ({ ...r, patterns: [...r.patterns] }))
    );
    this.saveToStorage(projectId);
  }

  public resetToDefaults(projectId: string = 'default'): PlotailorPrhRule[] {
    const seedRules = DEFAULT_PRH_RULES.map((r) => ({
      ...r,
      patterns: [...r.patterns],
      updatedAt: Date.now(),
    }));
    this.setRules(seedRules, projectId);
    return seedRules;
  }

  public addRule(
    ruleData: Omit<PlotailorPrhRule, 'id'> & { id?: string },
    projectId: string = 'default'
  ): PlotailorPrhRule {
    const current = this.getRules(projectId);
    const newRule: PlotailorPrhRule = {
      ...ruleData,
      id: ruleData.id || `prh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      patterns: ruleData.patterns ? [...ruleData.patterns] : [],
      scope: ruleData.scope || 'general',
      action: ruleData.action || 'replace',
      syntaxType: ruleData.syntaxType || 'plain',
      enabled: ruleData.enabled !== false,
      updatedAt: Date.now(),
    };
    current.push(newRule);
    this.setRules(current, projectId);
    return newRule;
  }

  public updateRule(
    id: string,
    patch: Partial<Omit<PlotailorPrhRule, 'id'>>,
    projectId: string = 'default'
  ): PlotailorPrhRule | null {
    const current = this.getRules(projectId);
    const idx = current.findIndex((r) => r.id === id);
    if (idx === -1) return null;

    current[idx] = {
      ...current[idx],
      ...patch,
      patterns: patch.patterns ? [...patch.patterns] : current[idx].patterns,
      updatedAt: Date.now(),
    };

    this.setRules(current, projectId);
    return current[idx];
  }

  public deleteRule(id: string, projectId: string = 'default'): boolean {
    const current = this.getRules(projectId);
    const initialLen = current.length;
    const filtered = current.filter((r) => r.id !== id);
    if (filtered.length < initialLen) {
      this.setRules(filtered, projectId);
      return true;
    }
    return false;
  }

  public loadFromStorage(projectId: string = 'default'): PlotailorPrhRule[] {
    if (!this.storage) {
      if (!this.projectRulesMap.has(projectId)) {
        return this.resetToDefaults(projectId);
      }
      return this.projectRulesMap.get(projectId) || [];
    }

    const key = this.getStorageKey(projectId);
    let raw = this.storage.getItem(key);
    if (!raw) {
      raw = this.storage.getItem(this.getLegacyStorageKey(projectId));
    }
    if (!raw) {
      return this.resetToDefaults(projectId);
    }

    const parsed = parsePrhJson(raw);
    if (parsed.length === 0) {
      return this.resetToDefaults(projectId);
    }

    this.projectRulesMap.set(projectId, parsed);
    return parsed;
  }

  public saveToStorage(projectId: string = 'default'): void {
    if (!this.storage) return;
    const rules = this.projectRulesMap.get(projectId) || [];
    const key = this.getStorageKey(projectId);
    const legacyKey = this.getLegacyStorageKey(projectId);
    const serialized = exportToPrhJson(rules);
    this.storage.setItem(key, serialized);
    this.storage.setItem(legacyKey, serialized);
  }

  public async loadFromVFS(projectId: string = 'default'): Promise<PlotailorPrhRule[]> {
    if (!this.vfs) return this.getRules(projectId);

    const jsonPath = this.getVfsJsonPath(projectId);
    const yamlPath = this.getVfsYamlPath(projectId);
    const editorJsonPath = `/projects/${projectId}/editor/prh_rules.json`;

    if (await this.vfs.exists(jsonPath)) {
      try {
        const content = await this.vfs.readText(jsonPath);
        const rules = parsePrhJson(content);
        if (rules.length > 0) {
          this.setRules(rules, projectId);
          return rules;
        }
      } catch (err) {
        console.warn('Failed to load PRH rules JSON from VFS:', err);
      }
    }

    if (await this.vfs.exists(editorJsonPath)) {
      try {
        const content = await this.vfs.readText(editorJsonPath);
        const rules = parsePrhJson(content);
        if (rules.length > 0) {
          this.setRules(rules, projectId);
          return rules;
        }
      } catch (err) {
        console.warn('Failed to load PRH rules editor JSON from VFS:', err);
      }
    }

    if (await this.vfs.exists(yamlPath)) {
      try {
        const content = await this.vfs.readText(yamlPath);
        const rules = parsePrhYaml(content);
        if (rules.length > 0) {
          this.setRules(rules, projectId);
          return rules;
        }
      } catch (err) {
        console.warn('Failed to load PRH rules YAML from VFS:', err);
      }
    }

    return this.getRules(projectId);
  }

  public async saveToVFS(projectId: string = 'default'): Promise<void> {
    if (!this.vfs) return;
    const dirPrh = `/projects/${projectId}/prh`;
    if (!(await this.vfs.exists(dirPrh))) {
      await this.vfs.mkdir(dirPrh, true);
    }
    const dirEditor = `/projects/${projectId}/editor`;
    if (!(await this.vfs.exists(dirEditor))) {
      await this.vfs.mkdir(dirEditor, true);
    }

    const rules = this.getRules(projectId);
    const jsonStr = exportToPrhJson(rules);
    const yamlStr = exportToPrhYaml(rules);

    await this.vfs.writeText(this.getVfsJsonPath(projectId), jsonStr);
    await this.vfs.writeText(this.getVfsYamlPath(projectId), yamlStr);
    await this.vfs.writeText(`/projects/${projectId}/editor/prh_rules.json`, jsonStr);
  }

  public exportYaml(projectId: string = 'default'): string {
    return exportToPrhYaml(this.getRules(projectId));
  }

  public importYaml(yamlStr: string, projectId: string = 'default'): PlotailorPrhRule[] {
    const imported = parsePrhYaml(yamlStr);
    if (imported.length > 0) {
      const current = this.getRules(projectId);
      const combined = [...current, ...imported];
      this.setRules(combined, projectId);
    }
    return this.getRules(projectId);
  }

  public exportJson(projectId: string = 'default'): string {
    return exportToPrhJson(this.getRules(projectId));
  }

  public importJson(jsonStr: string, projectId: string = 'default'): PlotailorPrhRule[] {
    const imported = parsePrhJson(jsonStr);
    if (imported.length > 0) {
      const current = this.getRules(projectId);
      const combined = [...current, ...imported];
      this.setRules(combined, projectId);
    }
    return this.getRules(projectId);
  }

  // Static backward compatibility helpers
  public static getDefaultRules(): PlotailorPrhRule[] {
    return DEFAULT_PRH_RULES.map((r) => ({ ...r, patterns: [...r.patterns] }));
  }

  public static serializeToYaml(rules: PlotailorPrhRule[]): string {
    return exportToPrhYaml(rules);
  }

  public static parseFromYaml(yamlStr: string): PlotailorPrhRule[] {
    return parsePrhYaml(yamlStr);
  }

  public static serializeToJson(rules: PlotailorPrhRule[]): string {
    return exportToPrhJson(rules);
  }

  public static parseFromJson(jsonStr: string): PlotailorPrhRule[] {
    return parsePrhJson(jsonStr);
  }

  public static saveToStorage(projectId: string, rules: PlotailorPrhRule[], storage?: Storage): void {
    const mgr = new PrhPersistenceManager(undefined, storage);
    mgr.setRules(rules, projectId);
  }

  public static loadFromStorage(projectId: string, storage?: Storage): PlotailorPrhRule[] {
    const mgr = new PrhPersistenceManager(undefined, storage);
    return mgr.getRules(projectId);
  }
}
