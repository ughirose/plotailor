import {
  CausalTimelineSyncEngine,
  type ConflictDetail,
  type JumpAnchor,
  type SyncAnalysisResult,
} from '../core/editor/CausalTimelineSyncEngine.js';

export interface LoreTermDefinition {
  id: string;
  canonicalName: string;
  aliases?: string[];
  forbiddenNames?: string[];
  category: 'character' | 'term' | 'item' | 'foreshadowing' | 'location' | string;
  description?: string;
  status?: 'active' | 'dangling' | 'shelved' | string;
}

export interface ViewportRange {
  from: number;
  to: number;
  text: string;
  cursorPos?: number;
}

export interface LoreOccurrence {
  termId: string;
  termName: string;
  canonicalName: string;
  category: string;
  position: {
    from: number;
    to: number;
  };
  matchedText: string;
  isExactCanonical: boolean;
  isNearCursor: boolean;
  description?: string;
  status: string;
}

export interface ReplaceTermEvent {
  termId: string;
  from: number;
  to: number;
  replacement: string;
  originalText: string;
}

export interface ShelveTermEvent {
  termId: string;
  newStatus: 'shelved' | 'active';
}

export interface InspectorDockOptions {
  dictionary: LoreTermDefinition[];
  cursorProximityThreshold?: number;
  syncEngine?: CausalTimelineSyncEngine;
  onReplaceTerm?: (event: ReplaceTermEvent) => void;
  onShelveTerm?: (event: ShelveTermEvent) => void;
  onJumpToAnchor?: (anchor: JumpAnchor) => void;
}

export class LoreInspectorDock {
  private dictionary: LoreTermDefinition[] = [];
  private cursorProximityThreshold: number;
  private collapsedPanels: Set<string> = new Set();
  private onReplaceTerm?: (event: ReplaceTermEvent) => void;
  private onShelveTerm?: (event: ShelveTermEvent) => void;
  private onJumpToAnchor?: (anchor: JumpAnchor) => void;
  private syncEngine: CausalTimelineSyncEngine | null = null;

  constructor(options: InspectorDockOptions) {
    this.dictionary = [...options.dictionary];
    this.cursorProximityThreshold = options.cursorProximityThreshold ?? 50;
    this.onReplaceTerm = options.onReplaceTerm;
    this.onShelveTerm = options.onShelveTerm;
    this.onJumpToAnchor = options.onJumpToAnchor;
    this.syncEngine = options.syncEngine ?? null;
  }

  public setSyncEngine(engine: CausalTimelineSyncEngine | null): void {
    this.syncEngine = engine;
  }

  public getSyncEngine(): CausalTimelineSyncEngine | null {
    return this.syncEngine;
  }

  public handleAnchorJump(anchor: JumpAnchor): void {
    if (this.onJumpToAnchor) {
      this.onJumpToAnchor(anchor);
    }
  }

  public updateDictionary(newDictionary: LoreTermDefinition[]): void {
    this.dictionary = [...newDictionary];
  }

  public getDictionary(): readonly LoreTermDefinition[] {
    return this.dictionary;
  }

  public extractOccurrences(viewport: ViewportRange): LoreOccurrence[] {
    const occurrences: LoreOccurrence[] = [];
    const text = viewport.text;

    for (const term of this.dictionary) {
      if (term.status === 'shelved') {
        continue;
      }

      const status = term.status ?? 'active';
      const searchTargets: Array<{ text: string; isCanonical: boolean }> = [];

      if (term.canonicalName) {
        searchTargets.push({ text: term.canonicalName, isCanonical: true });
      }
      if (term.aliases) {
        for (const alias of term.aliases) {
          if (alias && alias !== term.canonicalName) {
            searchTargets.push({ text: alias, isCanonical: false });
          }
        }
      }
      if (term.forbiddenNames) {
        for (const forbidden of term.forbiddenNames) {
          if (forbidden && forbidden !== term.canonicalName) {
            searchTargets.push({ text: forbidden, isCanonical: false });
          }
        }
      }

      for (const target of searchTargets) {
        if (!target.text) continue;
        let searchIdx = 0;
        while (searchIdx < text.length) {
          const foundIdx = text.indexOf(target.text, searchIdx);
          if (foundIdx === -1) break;

          const absFrom = viewport.from + foundIdx;
          const absTo = absFrom + target.text.length;

          let isNearCursor = false;
          if (viewport.cursorPos !== undefined) {
            const distFromStart = Math.abs(viewport.cursorPos - absFrom);
            const distFromEnd = Math.abs(viewport.cursorPos - absTo);
            const isInside = viewport.cursorPos >= absFrom && viewport.cursorPos <= absTo;
            isNearCursor = isInside || distFromStart <= this.cursorProximityThreshold || distFromEnd <= this.cursorProximityThreshold;
          }

          occurrences.push({
            termId: term.id,
            termName: term.canonicalName,
            canonicalName: term.canonicalName,
            category: term.category,
            position: { from: absFrom, to: absTo },
            matchedText: target.text,
            isExactCanonical: target.isCanonical && target.text === term.canonicalName,
            isNearCursor,
            description: term.description,
            status,
          });

          searchIdx = foundIdx + Math.max(1, target.text.length);
        }
      }
    }

    // Sort by position
    occurrences.sort((a, b) => a.position.from - b.position.from);
    return occurrences;
  }

  public togglePanel(panelKey: string): boolean {
    if (this.collapsedPanels.has(panelKey)) {
      this.collapsedPanels.delete(panelKey);
      return false; // now expanded
    } else {
      this.collapsedPanels.add(panelKey);
      return true; // now collapsed
    }
  }

  public isPanelCollapsed(panelKey: string): boolean {
    return this.collapsedPanels.has(panelKey);
  }

  public handleQuickReplace(occurrence: LoreOccurrence): ReplaceTermEvent | null {
    if (occurrence.isExactCanonical) {
      return null;
    }

    const event: ReplaceTermEvent = {
      termId: occurrence.termId,
      from: occurrence.position.from,
      to: occurrence.position.to,
      replacement: occurrence.canonicalName,
      originalText: occurrence.matchedText,
    };

    if (this.onReplaceTerm) {
      this.onReplaceTerm(event);
    }

    return event;
  }

  public handleShelveItem(termId: string): ShelveTermEvent | null {
    const item = this.dictionary.find((d) => d.id === termId);
    if (!item) return null;

    item.status = 'shelved';
    const event: ShelveTermEvent = {
      termId,
      newStatus: 'shelved',
    };

    if (this.onShelveTerm) {
      this.onShelveTerm(event);
    }

    return event;
  }

  public handleUnshelveItem(termId: string): ShelveTermEvent | null {
    const item = this.dictionary.find((d) => d.id === termId);
    if (!item) return null;

    item.status = 'active';
    const event: ShelveTermEvent = {
      termId,
      newStatus: 'active',
    };

    if (this.onShelveTerm) {
      this.onShelveTerm(event);
    }

    return event;
  }

  public renderCausalConflictPanel(conflicts: ConflictDetail[]): string {
    if (!conflicts || conflicts.length === 0) {
      return '';
    }

    const isCollapsed = this.isPanelCollapsed('section:causal-conflicts');
    let html = `<div class="dock-panel causal-conflict-panel" style="border-left: 3px solid #ef4444; margin-bottom: 8px;">`;
    html += `<div class="panel-header" data-action="toggle" data-target="section:causal-conflicts" style="background: rgba(239, 68, 68, 0.08); display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; cursor: pointer;">`;
    html += `<span class="panel-title" style="color: #ef4444; font-weight: bold; font-size: 12px;">🚨 因果DAG矛盾・パラドックス (${conflicts.length})</span>`;
    html += `<span class="panel-toggle-icon" style="color: #ef4444;">${isCollapsed ? '+' : '-'}</span>`;
    html += `</div>`;

    if (!isCollapsed) {
      html += `<div class="panel-body" style="padding: 6px 8px; background: rgba(239, 68, 68, 0.03);">`;
      for (const conf of conflicts) {
        const anchor = conf.anchor;
        let badgeLabel = '矛盾';
        let badgeBg = '#ef4444';
        switch (conf.category) {
          case 'cycle':
            badgeLabel = '循環矛盾';
            break;
          case 'chronological_reversal':
            badgeLabel = '時間逆転';
            break;
          case 'epistemic_fog_violation':
            badgeLabel = '認知フォグ違反';
            badgeBg = '#e11d48';
            break;
          case 'moon_phase_mismatch':
            badgeLabel = '月相不整合';
            badgeBg = '#d97706';
            break;
          case 'lifespan_breach':
            badgeLabel = '生没年違反';
            badgeBg = '#9333ea';
            break;
          case 'dangling_prerequisite':
            badgeLabel = '前提断絶';
            break;
          default:
            badgeLabel = conf.category;
        }

        html += `
          <div class="causal-conflict-card" style="margin-bottom: 6px; padding: 6px; border-radius: 4px; background: #fff; border: 1px solid rgba(239, 68, 68, 0.3);" data-node-id="${conf.nodeId}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="badge" style="font-size: 10px; background: ${badgeBg}; color: #fff; padding: 1px 5px; border-radius: 3px; font-weight: bold;">${badgeLabel}</span>
              <span style="font-size: 11px; color: var(--color-text-dim);">${anchor ? `${anchor.chapterTitle} L${anchor.lineNumber}` : ''}</span>
            </div>
            <div style="font-size: 12px; margin: 4px 0; color: #1f2937; line-height: 1.4;">${conf.description}</div>
            ${anchor ? `
              <button
                class="btn-jump-causal-conflict"
                data-action="jump-conflict"
                data-node-id="${anchor.nodeId}"
                data-chapter-id="${anchor.chapterId}"
                data-line="${anchor.lineNumber}"
                data-offset="${anchor.charOffset}"
                style="width: 100%; margin-top: 4px; padding: 3px 6px; font-size: 11px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 3px; cursor: pointer; font-weight: bold;"
              >
                ➜ 該当箇所（第${anchor.chapterIndex + 1}章 ${anchor.lineNumber}行目）へジャンプ
              </button>
            ` : ''}
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  public renderInlinePanelHTML(occurrences: LoreOccurrence[], conflicts: ConflictDetail[] = []): string {
    const groupedByCategory: Record<string, LoreOccurrence[]> = {};
    for (const occ of occurrences) {
      if (!groupedByCategory[occ.category]) {
        groupedByCategory[occ.category] = [];
      }
      groupedByCategory[occ.category].push(occ);
    }

    const shelvedItems = this.dictionary.filter((d) => d.status === 'shelved');

    let html = `<div class="lore-inspector-dock" data-testid="lore-inspector-dock">`;
    html += `<div class="dock-header"><h3>リアルタイム設定語句・伏線インスペクタ</h3></div>`;

    // Render causal conflicts section if any detected
    if (conflicts.length > 0) {
      html += this.renderCausalConflictPanel(conflicts);
    } else if (this.syncEngine) {
      const res = this.syncEngine.analyzeAndSynchronize();
      if (res.conflicts.length > 0) {
        html += this.renderCausalConflictPanel(res.conflicts);
      }
    }

    const categories = Object.keys(groupedByCategory);
    if (categories.length === 0 && shelvedItems.length === 0 && conflicts.length === 0) {
      html += `<div class="dock-empty">可視領域内に設定語句は見つかりませんでした。</div>`;
    } else {
      for (const category of categories) {
        const isCollapsed = this.isPanelCollapsed(`category:${category}`);
        const items = groupedByCategory[category];

        // termId ごとに集約して重複カードの生成を撲滅
        const uniqueTermsMap = new Map<string, { primary: LoreOccurrence; variants: LoreOccurrence[]; isNearCursor: boolean }>();
        for (const item of items) {
          if (!uniqueTermsMap.has(item.termId)) {
            uniqueTermsMap.set(item.termId, { primary: item, variants: [], isNearCursor: item.isNearCursor });
          } else if (item.isNearCursor) {
            uniqueTermsMap.get(item.termId)!.isNearCursor = true;
          }
          if (item.matchedText !== item.canonicalName) {
            const entry = uniqueTermsMap.get(item.termId)!;
            if (!entry.variants.some((v) => v.matchedText === item.matchedText)) {
              entry.variants.push(item);
            }
          }
        }

        const catMap: Record<string, string> = {
          character: '登場人物',
          term: '重要用語',
          item: 'アイテム・武具',
          foreshadowing: '伏線',
          location: '拠点・地名',
        };
        const displayCategory = catMap[category.toLowerCase()] || category;

        html += `<div class="dock-panel category-panel" data-category="${category}">`;
        html += `<div class="panel-header" data-action="toggle" data-target="category:${category}">`;
        html += `<span class="panel-title">${displayCategory} (${uniqueTermsMap.size})</span>`;
        html += `<span class="panel-toggle-icon">${isCollapsed ? '+' : '-'}</span>`;
        html += `</div>`;

        if (!isCollapsed) {
          html += `<div class="panel-body">`;

          for (const { primary, variants, isNearCursor } of uniqueTermsMap.values()) {
            html += `<div class="lore-item ${isNearCursor ? 'near-cursor' : ''}" data-term-id="${primary.termId}" data-from="${primary.position.from}" data-to="${primary.position.to}">`;
            html += `<div class="item-title" title="クリックで本文該当箇所へジャンプ">${primary.canonicalName}</div>`;
            if (variants.length > 0) {
              for (const v of variants) {
                html += `
                  <div style="margin: 4px 0; padding: 4px 6px; background: rgba(207, 168, 92, 0.1); border-left: 2px solid var(--color-gold, #cfa85c); border-radius: 2px;">
                    <div class="item-warning" style="margin-bottom: 2px;">表記ゆれ検出: "${v.matchedText}" -> "${primary.canonicalName}"</div>
                    <button class="btn-quick-replace" data-action="replace" data-term-id="${v.termId}" data-from="${v.position.from}" data-to="${v.position.to}">「${v.matchedText}」を正式名称に置換</button>
                  </div>
                `;
              }
            }
            if (primary.description) {
              html += `<div class="item-desc">${primary.description}</div>`;
            }
            html += `<button class="btn-shelve" data-action="shelve" data-term-id="${primary.termId}">未配置棚へ退避</button>`;
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }

      // Shelved section
      if (shelvedItems.length > 0) {
        const isShelvedCollapsed = this.isPanelCollapsed('section:shelved');
        html += `<div class="dock-panel shelved-panel">`;
        html += `<div class="panel-header" data-action="toggle" data-target="section:shelved">`;
        html += `<span class="panel-title">未配置棚 (Shelved Lore) (${shelvedItems.length})</span>`;
        html += `<span class="panel-toggle-icon">${isShelvedCollapsed ? '+' : '-'}</span>`;
        html += `</div>`;

        if (!isShelvedCollapsed) {
          html += `<div class="panel-body">`;
          for (const item of shelvedItems) {
            html += `<div class="shelved-item" data-term-id="${item.id}">`;
            html += `<span class="item-title">${item.canonicalName} [${item.category}]</span>`;
            html += `<button class="btn-unshelve" data-action="unshelve" data-term-id="${item.id}">復帰</button>`;
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }
}
