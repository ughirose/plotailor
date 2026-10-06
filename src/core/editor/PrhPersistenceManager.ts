/**
 * PrhPersistenceManager - Proofreading Helper (PRH) project persistence and YAML/JSON exporter.
 *
 * Provides:
 * - Roundtrip serialization and deserialization between PlotailorPrhRule[] and standard PRH YAML / JSON formats.
 * - Project-isolated storage persistence (localStorage / VFS).
 * - Default seed rules initialization.
 * - Defensive fault-tolerant parsing against corrupt input.
 */

import { PlotailorPrhRuleSchema, type PlotailorPrhRule } from '@worldcraft/schema';

export const DEFAULT_PRH_RULES: PlotailorPrhRule[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    expected: 'ヴァレリウス',
    patterns: ['バレリウス'],
    scope: 'all',
    action: 'suggest',
    syntaxType: 'general',
    description: '人名正規化（ヴァレリウス将軍）',
  },
];

export class PrhPersistenceManager {
  private static readonly STORAGE_PREFIX = 'plotailor_project_';
  private static readonly STORAGE_SUFFIX = '_prh_rules';

  /**
   * Returns default seed rules for a new project.
   */
  public static getDefaultRules(): PlotailorPrhRule[] {
    return JSON.parse(JSON.stringify(DEFAULT_PRH_RULES));
  }

  /**
   * Formats PRH rules into standard Proofreading Helper YAML string (version: 1).
   */
  public static serializeToYaml(rules: PlotailorPrhRule[]): string {
    const lines: string[] = ['version: 1', 'rules:'];

    for (const rule of rules) {
      lines.push(`  - expected: ${rule.expected}`);
      if (rule.id) {
        lines.push(`    id: ${rule.id}`);
      }
      if (rule.patterns && rule.patterns.length > 0) {
        lines.push('    patterns:');
        for (const p of rule.patterns) {
          lines.push(`      - ${p}`);
        }
      }
      if (rule.scope && rule.scope !== 'all') {
        lines.push(`    scope: ${rule.scope}`);
      }
      if (rule.action && rule.action !== 'suggest') {
        lines.push(`    action: ${rule.action}`);
      }
      if (rule.syntaxType && rule.syntaxType !== 'general') {
        lines.push(`    syntaxType: ${rule.syntaxType}`);
      }
      if (rule.characterId) {
        lines.push(`    characterId: ${rule.characterId}`);
      }
      if (rule.description) {
        lines.push(`    description: ${rule.description}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Parses standard PRH YAML string into validated PlotailorPrhRule array.
   */
  public static parseFromYaml(yamlStr: string): PlotailorPrhRule[] {
    if (!yamlStr || typeof yamlStr !== 'string') {
      return [];
    }

    const rules: PlotailorPrhRule[] = [];
    const lines = yamlStr.split(/\r?\n/);

    let current: Partial<PlotailorPrhRule> | null = null;
    let inPatterns = false;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('version:')) {
        continue;
      }

      if (trimmed.startsWith('- expected:')) {
        if (current && current.expected) {
          const validated = this.validateAndFinalizeRule(current);
          if (validated) rules.push(validated);
        }
        inPatterns = false;
        current = {
          expected: trimmed.replace('- expected:', '').trim(),
          patterns: [],
        };
      } else if (trimmed === 'patterns:') {
        inPatterns = true;
      } else if (inPatterns && trimmed.startsWith('-')) {
        const pattern = trimmed.replace(/^-/, '').trim();
        if (current) {
          current.patterns = current.patterns || [];
          current.patterns.push(pattern);
        }
      } else if (trimmed.startsWith('id:')) {
        inPatterns = false;
        if (current) current.id = trimmed.replace('id:', '').trim();
      } else if (trimmed.startsWith('description:')) {
        inPatterns = false;
        if (current) current.description = trimmed.replace('description:', '').trim();
      } else if (trimmed.startsWith('scope:')) {
        inPatterns = false;
        if (current) current.scope = trimmed.replace('scope:', '').trim() as any;
      } else if (trimmed.startsWith('action:')) {
        inPatterns = false;
        if (current) current.action = trimmed.replace('action:', '').trim() as any;
      } else if (trimmed.startsWith('syntaxType:')) {
        inPatterns = false;
        if (current) current.syntaxType = trimmed.replace('syntaxType:', '').trim() as any;
      } else if (trimmed.startsWith('characterId:')) {
        inPatterns = false;
        if (current) current.characterId = trimmed.replace('characterId:', '').trim();
      }
    }

    if (current && current.expected) {
      const validated = this.validateAndFinalizeRule(current);
      if (validated) rules.push(validated);
    }

    return rules;
  }

  /**
   * Serializes PRH rules into formatted JSON string.
   */
  public static serializeToJson(rules: PlotailorPrhRule[]): string {
    return JSON.stringify(rules, null, 2);
  }

  /**
   * Parses JSON string into validated PlotailorPrhRule array.
   */
  public static parseFromJson(jsonStr: string): PlotailorPrhRule[] {
    if (!jsonStr || typeof jsonStr !== 'string') {
      return [];
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const results: PlotailorPrhRule[] = [];
      for (const item of parsed) {
        const validated = this.validateAndFinalizeRule(item);
        if (validated) results.push(validated);
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Saves rules for a specific project into storage.
   */
  public static saveToStorage(projectId: string, rules: PlotailorPrhRule[], storage?: Storage): void {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return;

    const key = `${this.STORAGE_PREFIX}${projectId}${this.STORAGE_SUFFIX}`;
    s.setItem(key, this.serializeToJson(rules));
  }

  /**
   * Loads rules for a specific project from storage.
   * If not found, returns default seed rules.
   */
  public static loadFromStorage(projectId: string, storage?: Storage): PlotailorPrhRule[] {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return this.getDefaultRules();

    const key = `${this.STORAGE_PREFIX}${projectId}${this.STORAGE_SUFFIX}`;
    const raw = s.getItem(key);
    if (!raw) {
      return this.getDefaultRules();
    }

    const rules = this.parseFromJson(raw);
    return rules.length > 0 ? rules : this.getDefaultRules();
  }

  private static validateAndFinalizeRule(raw: Partial<PlotailorPrhRule>): PlotailorPrhRule | null {
    try {
      const candidate = {
        id: raw.id || crypto.randomUUID(),
        expected: raw.expected || '',
        patterns: raw.patterns && raw.patterns.length > 0 ? raw.patterns : [raw.expected || ''],
        scope: raw.scope || 'all',
        action: raw.action || 'suggest',
        syntaxType: raw.syntaxType || 'general',
        description: raw.description,
        characterId: raw.characterId,
      };

      const result = PlotailorPrhRuleSchema.safeParse(candidate);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
}
