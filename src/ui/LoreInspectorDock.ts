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
  onReplaceTerm?: (event: ReplaceTermEvent) => void;
  onShelveTerm?: (event: ShelveTermEvent) => void;
}

export class LoreInspectorDock {
  private dictionary: LoreTermDefinition[] = [];
  private cursorProximityThreshold: number;
  private collapsedPanels: Set<string> = new Set();
  private onReplaceTerm?: (event: ReplaceTermEvent) => void;
  private onShelveTerm?: (event: ShelveTermEvent) => void;

  constructor(options: InspectorDockOptions) {
    this.dictionary = [...options.dictionary];
    this.cursorProximityThreshold = options.cursorProximityThreshold ?? 50;
    this.onReplaceTerm = options.onReplaceTerm;
    this.onShelveTerm = options.onShelveTerm;
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

  public renderInlinePanelHTML(occurrences: LoreOccurrence[]): string {
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

    const categories = Object.keys(groupedByCategory);
    if (categories.length === 0 && shelvedItems.length === 0) {
      html += `<div class="dock-empty">可視領域内に設定語句は見つかりませんでした。</div>`;
    } else {
      for (const category of categories) {
        const isCollapsed = this.isPanelCollapsed(`category:${category}`);
        const items = groupedByCategory[category];
        html += `<div class="dock-panel category-panel" data-category="${category}">`;
        html += `<div class="panel-header" data-action="toggle" data-target="category:${category}">`;
        html += `<span class="panel-title">${category} (${items.length})</span>`;
        html += `<span class="panel-toggle-icon">${isCollapsed ? '+' : '-'}</span>`;
        html += `</div>`;

        if (!isCollapsed) {
          html += `<div class="panel-body">`;
          for (const item of items) {
            html += `<div class="lore-item ${item.isNearCursor ? 'near-cursor' : ''}" data-term-id="${item.termId}">`;
            html += `<div class="item-title">${item.canonicalName}</div>`;
            if (item.matchedText !== item.canonicalName) {
              html += `<div class="item-warning">表記ゆれ検出: "${item.matchedText}" -> "${item.canonicalName}"</div>`;
              html += `<button class="btn-quick-replace" data-action="replace" data-term-id="${item.termId}">正式名称に置換</button>`;
            }
            if (item.description) {
              html += `<div class="item-desc">${item.description}</div>`;
            }
            html += `<button class="btn-shelve" data-action="shelve" data-term-id="${item.termId}">未配置棚へ退避</button>`;
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
