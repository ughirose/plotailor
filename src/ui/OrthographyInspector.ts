/**
 * OrthographyInspector - Inline Right-Drawer Orthography & PRH Rule Manager
 *
 * Complies with 3-Pane Non-Modal Constitution:
 * - Inline table view within details drawer (no pop-up modals)
 * - Manages orthography consistency rules, character name variants, and exceptions
 * - Supports bidirectional YAML import/export with plotailor-prh.yml
 */

import {
  VerticalInspectorGeometryBridge,
  type BridgeLayoutOptions,
  type TierDecorationPlacement,
} from '../core/editor/VerticalInspectorGeometryBridge.js';

export interface OrthographyRuleEntry {
  id: string;
  expected: string;
  patterns: string[];
  category?: 'character' | 'lore' | 'general' | 'exception';
  description?: string;
  enabled?: boolean;
}

export interface RuleGeometryPlacement {
  ruleId: string;
  rule: OrthographyRuleEntry;
  matchText: string;
  from: number;
  to: number;
  placement: TierDecorationPlacement;
}

export interface OrthographyInspectorOptions {
  rules?: OrthographyRuleEntry[];
  geometryBridge?: VerticalInspectorGeometryBridge | BridgeLayoutOptions;
  onChange?: (rules: OrthographyRuleEntry[]) => void;
  onExportPrh?: (yamlContent: string) => void;
}

/**
 * Serializes rules into standard PRH (Proofreading Helper) YAML format.
 */
export function exportToPrhYaml(rules: OrthographyRuleEntry[]): string {
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
    if (rule.description) {
      lines.push(`    description: ${rule.description}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Parses standard PRH YAML string into OrthographyRuleEntry array.
 */
export function importFromPrhYaml(yamlStr: string): OrthographyRuleEntry[] {
  const rules: OrthographyRuleEntry[] = [];
  const lines = yamlStr.split(/\r?\n/);

  let currentRule: Partial<OrthographyRuleEntry> | null = null;
  let inPatterns = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- expected:') || trimmed.startsWith('expected:')) {
      if (currentRule && currentRule.expected) {
        rules.push({
          id: currentRule.id || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          expected: currentRule.expected,
          patterns: currentRule.patterns || [],
          category: currentRule.category || 'general',
          description: currentRule.description || '',
          enabled: true,
        });
      }
      const val = trimmed.replace(/^-?\s*expected:\s*/, '').trim();
      currentRule = {
        id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        expected: val,
        patterns: [],
        enabled: true,
      };
      inPatterns = false;
    } else if (trimmed.startsWith('patterns:')) {
      inPatterns = true;
    } else if (inPatterns && trimmed.startsWith('-')) {
      const p = trimmed.replace(/^-\s*/, '').trim();
      if (currentRule && currentRule.patterns) {
        currentRule.patterns.push(p);
      }
    } else if (trimmed.startsWith('description:')) {
      inPatterns = false;
      const desc = trimmed.replace(/^description:\s*/, '').trim();
      if (currentRule) {
        currentRule.description = desc;
      }
    }
  }

  if (currentRule && currentRule.expected) {
    rules.push({
      id: currentRule.id || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      expected: currentRule.expected,
      patterns: currentRule.patterns || [],
      category: currentRule.category || 'general',
      description: currentRule.description || '',
      enabled: true,
    });
  }

  return rules;
}

export class OrthographyInspector {
  private rules: OrthographyRuleEntry[] = [];
  private container: HTMLElement;
  private onChange?: (rules: OrthographyRuleEntry[]) => void;
  private onExportPrh?: (yamlContent: string) => void;
  private filterQuery = '';
  private filterCategory = 'all';
  private geometryBridge: VerticalInspectorGeometryBridge;

  constructor(options: OrthographyInspectorOptions = {}) {
    this.rules = options.rules ? [...options.rules] : [];
    this.onChange = options.onChange;
    this.onExportPrh = options.onExportPrh;

    if (options.geometryBridge instanceof VerticalInspectorGeometryBridge) {
      this.geometryBridge = options.geometryBridge;
    } else {
      this.geometryBridge = new VerticalInspectorGeometryBridge(options.geometryBridge);
    }

    if (typeof document !== 'undefined') {
      this.container = document.createElement('div');
      this.container.className = 'orthography-inspector';
      this.render();
    } else {
      this.container = {} as HTMLElement;
    }
  }

  public getGeometryBridge(): VerticalInspectorGeometryBridge {
    return this.geometryBridge;
  }

  public setGeometryBridge(bridge: VerticalInspectorGeometryBridge | BridgeLayoutOptions): void {
    if (bridge instanceof VerticalInspectorGeometryBridge) {
      this.geometryBridge = bridge;
    } else {
      this.geometryBridge = new VerticalInspectorGeometryBridge(bridge);
    }
  }

  /**
   * Scans document text for active orthography rule violations and calculates
   * vertical-rl bounding box and tooltip coordinates via VerticalInspectorGeometryBridge.
   */
  public calculateRulePlacements(
    text: string,
    isVertical: boolean = true
  ): RuleGeometryPlacement[] {
    if (!text) return [];

    const placements: RuleGeometryPlacement[] = [];
    const activeRules = this.rules.filter((r) => r.enabled !== false);

    // If horizontal mode, update bridge options temporarily or keep default
    if (!isVertical) {
      this.geometryBridge.setOptions({ writingMode: 'horizontal-tb' });
    } else {
      this.geometryBridge.setOptions({ writingMode: 'vertical-rl' });
    }

    for (const rule of activeRules) {
      const patterns = rule.patterns && rule.patterns.length > 0 ? rule.patterns : [];
      for (const pattern of patterns) {
        if (!pattern) continue;
        let searchIndex = 0;
        while (searchIndex < text.length) {
          const foundIdx = text.indexOf(pattern, searchIndex);
          if (foundIdx === -1) break;

          const toIdx = foundIdx + pattern.length;
          const placement = this.geometryBridge.calculateTierDecorationPlacement(
            {
              id: `rule-${rule.id}-${foundIdx}`,
              tier: 1,
              type: 'wavy_line',
              from: foundIdx,
              to: toIdx,
              label: `表記ゆれ: ${pattern} → ${rule.expected}`,
              badgeText: rule.expected,
            },
            text
          );

          placements.push({
            ruleId: rule.id,
            rule,
            matchText: pattern,
            from: foundIdx,
            to: toIdx,
            placement,
          });

          searchIndex = toIdx;
        }
      }
    }

    return placements;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public getRules(): OrthographyRuleEntry[] {
    return [...this.rules];
  }

  public setRules(rules: OrthographyRuleEntry[]): void {
    this.rules = [...rules];
    this.notifyChange();
    this.render();
  }

  public addRule(ruleData: Omit<OrthographyRuleEntry, 'id'>): OrthographyRuleEntry {
    const newRule: OrthographyRuleEntry = {
      ...ruleData,
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      enabled: ruleData.enabled !== false,
      patterns: ruleData.patterns || [],
      category: ruleData.category || 'general',
    };
    this.rules.push(newRule);
    this.notifyChange();
    this.render();
    return newRule;
  }

  public removeRule(id: string): boolean {
    const prevLen = this.rules.length;
    this.rules = this.rules.filter((r) => r.id !== id);
    if (this.rules.length !== prevLen) {
      this.notifyChange();
      this.render();
      return true;
    }
    return false;
  }

  public toggleRule(id: string, enabled?: boolean): boolean {
    const rule = this.rules.find((r) => r.id !== id ? false : true);
    if (rule) {
      rule.enabled = enabled !== undefined ? enabled : !rule.enabled;
      this.notifyChange();
      this.render();
      return true;
    }
    return false;
  }

  public exportPrhYaml(): string {
    const yaml = exportToPrhYaml(this.rules);
    if (this.onExportPrh) {
      this.onExportPrh(yaml);
    }
    return yaml;
  }

  public importPrhYaml(yamlStr: string): number {
    const imported = importFromPrhYaml(yamlStr);
    this.rules = [...this.rules, ...imported];
    this.notifyChange();
    this.render();
    return imported.length;
  }

  private notifyChange(): void {
    if (this.onChange) {
      this.onChange(this.getRules());
    }
  }

  public render(): void {
    if (typeof document === 'undefined' || !this.container) return;
    this.container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'orthography-header';
    const activeCount = this.rules.filter((r) => r.enabled !== false).length;
    header.innerHTML = `
      <div class="orthography-title-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: bold; font-size: 13px;">作中表記・辞書ルール (Orthography)</span>
        <span class="badge" style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.06);">${activeCount} / ${this.rules.length} 有効</span>
      </div>
      <div class="orthography-controls" style="display: flex; gap: 6px; margin-bottom: 8px;">
        <input type="text" class="orthography-search" placeholder="表記を検索..." value="${this.filterQuery}" style="flex: 1; padding: 4px 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px;" />
        <select class="orthography-category-filter" style="font-size: 12px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;">
          <option value="all" ${this.filterCategory === 'all' ? 'selected' : ''}>すべて</option>
          <option value="character" ${this.filterCategory === 'character' ? 'selected' : ''}>人物</option>
          <option value="lore" ${this.filterCategory === 'lore' ? 'selected' : ''}>用語</option>
          <option value="general" ${this.filterCategory === 'general' ? 'selected' : ''}>一般</option>
          <option value="exception" ${this.filterCategory === 'exception' ? 'selected' : ''}>例外</option>
        </select>
      </div>
    `;

    const searchInput = header.querySelector('.orthography-search') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.filterQuery = (e.target as HTMLInputElement).value;
      this.render();
    });

    const categorySelect = header.querySelector('.orthography-category-filter') as HTMLSelectElement;
    categorySelect?.addEventListener('change', (e) => {
      this.filterCategory = (e.target as HTMLSelectElement).value;
      this.render();
    });

    this.container.appendChild(header);

    // Filter rules
    const filteredRules = this.rules.filter((r) => {
      if (this.filterCategory !== 'all' && r.category !== this.filterCategory) {
        return false;
      }
      if (this.filterQuery) {
        const q = this.filterQuery.toLowerCase();
        const matchExp = r.expected.toLowerCase().includes(q);
        const matchPat = r.patterns.some((p) => p.toLowerCase().includes(q));
        const matchDesc = r.description ? r.description.toLowerCase().includes(q) : false;
        return matchExp || matchPat || matchDesc;
      }
      return true;
    });

    // Rule List Table
    const tableContainer = document.createElement('div');
    tableContainer.className = 'orthography-table-container';
    tableContainer.style.cssText = 'max-height: 240px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 4px; margin-bottom: 10px; font-size: 12px;';

    if (filteredRules.length === 0) {
      tableContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #888;">登録されたルールはありません</div>';
    } else {
      const table = document.createElement('table');
      table.style.cssText = 'width: 100%; border-collapse: collapse;';
      table.innerHTML = `
        <thead>
          <tr style="background: rgba(0,0,0,0.03); border-bottom: 1px solid #e0e0e0; text-align: left;">
            <th style="padding: 4px 6px; width: 24px;"></th>
            <th style="padding: 4px 6px;">正（統一）</th>
            <th style="padding: 4px 6px;">誤・揺れ（検出）</th>
            <th style="padding: 4px 6px; width: 40px;"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody')!;

      filteredRules.forEach((rule) => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #f0f0f0';
        row.innerHTML = `
          <td style="padding: 4px 6px; text-align: center;">
            <input type="checkbox" class="rule-toggle" ${rule.enabled !== false ? 'checked' : ''} />
          </td>
          <td style="padding: 4px 6px; font-weight: bold;">
            ${rule.expected}
            ${rule.description ? `<div style="font-size: 10px; color: #888; font-weight: normal;">${rule.description}</div>` : ''}
          </td>
          <td style="padding: 4px 6px; color: #666;">
            ${rule.patterns.join(', ') || '-'}
          </td>
          <td style="padding: 4px 6px; text-align: right;">
            <button class="rule-delete-btn" style="background: none; border: none; cursor: pointer; color: #d32f2f; font-size: 13px;" title="削除">&times;</button>
          </td>
        `;

        row.querySelector('.rule-toggle')?.addEventListener('change', (e) => {
          this.toggleRule(rule.id, (e.target as HTMLInputElement).checked);
        });

        row.querySelector('.rule-delete-btn')?.addEventListener('click', () => {
          this.removeRule(rule.id);
        });

        tbody.appendChild(row);
      });

      tableContainer.appendChild(table);
    }
    this.container.appendChild(tableContainer);

    // Inline Add Form (Non-Modal Constitution)
    const addForm = document.createElement('div');
    addForm.className = 'orthography-add-form';
    addForm.style.cssText = 'padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; background: rgba(0,0,0,0.02); font-size: 12px;';
    addForm.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 6px;">新規ルール追加 (Inline)</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
        <input type="text" class="add-expected" placeholder="正式表記 (例: 気づく)" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px;" />
        <input type="text" class="add-patterns" placeholder="揺れ (カンマ区切り)" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px;" />
      </div>
      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 6px; margin-bottom: 6px;">
        <select class="add-category" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px;">
          <option value="general">一般</option>
          <option value="character">人物</option>
          <option value="lore">用語</option>
          <option value="exception">例外</option>
        </select>
        <input type="text" class="add-description" placeholder="説明/備考 (任意)" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px;" />
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 6px;">
        <button class="add-submit-btn" style="padding: 4px 10px; font-size: 12px; background: #1976d2; color: #fff; border: none; border-radius: 4px; cursor: pointer;">追加</button>
      </div>
    `;

    const addBtn = addForm.querySelector('.add-submit-btn') as HTMLButtonElement;
    addBtn?.addEventListener('click', () => {
      const expInput = addForm.querySelector('.add-expected') as HTMLInputElement;
      const patInput = addForm.querySelector('.add-patterns') as HTMLInputElement;
      const catSelect = addForm.querySelector('.add-category') as HTMLSelectElement;
      const descInput = addForm.querySelector('.add-description') as HTMLInputElement;

      const expected = expInput?.value.trim();
      if (!expected) return;

      const patterns = patInput?.value
        ? patInput.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean)
        : [];
      const category = (catSelect?.value as OrthographyRuleEntry['category']) || 'general';
      const description = descInput?.value.trim() || '';

      this.addRule({
        expected,
        patterns,
        category,
        description,
        enabled: true,
      });
    });

    this.container.appendChild(addForm);
  }
}
