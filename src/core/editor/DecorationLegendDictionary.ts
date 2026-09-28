/**
 * DecorationLegendDictionary - Linter & Editor Decoration Mapping Dictionary & Inspector Model
 *
 * Defines decoration legend mapping for editor wave lines, dotted lines, and character highlights,
 * including names, color codes, descriptions, author advice, and lightweight HTML card generation
 * for Plotailor IDE right pane / inspector integration.
 */

export type DecorationCategory = 'wavy_line' | 'dotted_line' | 'text_highlight';

export type DecorationTypeId =
  // Wavy lines
  | 'wavy_red'          // 赤: 用語不整合
  | 'wavy_yellow'       // 黄: 助詞連続
  | 'wavy_blue'         // 青: 受動態過多
  | 'wavy_orange'       // 橙: 文体違和感
  // Dotted lines
  | 'dotted_even_pair'  // 偶数対
  | 'dotted_bouten'     // 傍点
  // Text highlights
  | 'highlight_person'   // 人物
  | 'highlight_item'     // アイテム
  | 'highlight_location' // 地名
  ;

export interface DecorationLegendItem {
  id: DecorationTypeId;
  category: DecorationCategory;
  categoryLabel: string;
  name: string;
  colorName: string;
  colorCode: string;
  styleType: 'wavy' | 'dotted' | 'highlight';
  description: string;
  advice: string;
}

/**
 * Complete definition dictionary for editor decorations.
 */
export const DECORATION_LEGEND_DICTIONARY: Record<DecorationTypeId, DecorationLegendItem> = {
  // Wave lines
  wavy_red: {
    id: 'wavy_red',
    category: 'wavy_line',
    categoryLabel: '波線',
    name: '用語不整合',
    colorName: '赤',
    colorCode: '#ef4444',
    styleType: 'wavy',
    description: '設定資料集（Lore）や用語辞書で定義された正式名称と一致しない不整合な表記です。',
    advice: '正称（オフィシャル名称）への統一、または表記揺れ防止機能（QuickFix）を使用して一括修正してください。',
  },
  wavy_yellow: {
    id: 'wavy_yellow',
    category: 'wavy_line',
    categoryLabel: '波線',
    name: '助詞連続',
    colorName: '黄',
    colorCode: '#f59e0b',
    styleType: 'wavy',
    description: '「の」や「に」などの同一助詞が1文内で連続して使用されています。',
    advice: '文章のリズムが滞る原因になります。文を分割するか、別の接続表現や言い換えを検討してください。',
  },
  wavy_blue: {
    id: 'wavy_blue',
    category: 'wavy_line',
    categoryLabel: '波線',
    name: '受動態過多',
    colorName: '青',
    colorCode: '#3b82f6',
    styleType: 'wavy',
    description: '「〜される」「〜せられる」などの受け身表現が短時間で多用されています。',
    advice: '能動態（〜が〜した）に書き換えることで、物語の臨場感や動作の勢いが大幅に向上します。',
  },
  wavy_orange: {
    id: 'wavy_orange',
    category: 'wavy_line',
    categoryLabel: '波線',
    name: '文体違和感',
    colorName: '橙',
    colorCode: '#f97316',
    styleType: 'wavy',
    description: '敬体（です・ます）と常体（だ・である）の混在、または文末表現の重複・違和感です。',
    advice: '地の文と会話文の文体を再確認し、視点人物の語り口調に矛盾がないかチェックしてください。',
  },

  // Dotted lines
  dotted_even_pair: {
    id: 'dotted_even_pair',
    category: 'dotted_line',
    categoryLabel: '点線',
    name: '偶数対',
    colorName: '紫',
    colorCode: '#a855f7',
    styleType: 'dotted',
    description: 'かぎ括弧「」や二重かぎ括弧『』などの開き・閉じの対応関係や偶数対の不一致です。',
    advice: '閉じ括弧の付け忘れや、途中でネストが壊れていないか確認して対を補正してください。',
  },
  dotted_bouten: {
    id: 'dotted_bouten',
    category: 'dotted_line',
    categoryLabel: '点線',
    name: '傍点',
    colorName: 'シアン',
    colorCode: '#06b6d4',
    styleType: 'dotted',
    description: '《《〜》》記法によってテキストに付与された読者への強調用傍点（圏点）です。',
    advice: '強調したい重要なキーワードやセリフの決め台詞に効果的に使用してください。多用は避けましょう。',
  },

  // Character / Lore Highlights
  highlight_person: {
    id: 'highlight_person',
    category: 'text_highlight',
    categoryLabel: '文字ハイライト',
    name: '人物',
    colorName: 'ピンク',
    colorCode: '#ec4899',
    styleType: 'highlight',
    description: '作中に登場する人物名（キャラクター）のハイライト表示です。',
    advice: '人物の初登場タイミングや、同一場面内での名前の呼び方（愛称・本名）の一貫性を確認できます。',
  },
  highlight_item: {
    id: 'highlight_item',
    category: 'text_highlight',
    categoryLabel: '文字ハイライト',
    name: 'アイテム',
    colorName: 'エメラルド',
    colorCode: '#10b981',
    styleType: 'highlight',
    description: 'キーアイテム、武具、魔法具、重要物品などのハイライト表示です。',
    advice: '場面移動時にキャラクターがそのアイテムを所持・使用しているか等の辻褄チェックに役立ちます。',
  },
  highlight_location: {
    id: 'highlight_location',
    category: 'text_highlight',
    categoryLabel: '文字ハイライト',
    name: '地名',
    colorName: 'インディゴ',
    colorCode: '#6366f1',
    styleType: 'highlight',
    description: '都市、王国、砦、ダンジョン等の地理・空間名称のハイライト表示です。',
    advice: '移動距離や位置関係（地理的整合性）の矛盾がないか、世界観マップと照合してください。',
  },
};

/**
 * Escapes special HTML characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Retrieves all registered decoration legend items as an array.
 */
export function getAllDecorationLegendItems(): DecorationLegendItem[] {
  return Object.values(DECORATION_LEGEND_DICTIONARY);
}

/**
 * Retrieves a single decoration legend item by its unique ID.
 */
export function getDecorationLegendItem(id: DecorationTypeId): DecorationLegendItem | undefined {
  return DECORATION_LEGEND_DICTIONARY[id];
}

/**
 * Retrieves decoration legend items belonging to a specific category.
 */
export function getDecorationLegendItemsByCategory(category: DecorationCategory): DecorationLegendItem[] {
  return getAllDecorationLegendItems().filter((item) => item.category === category);
}

/**
 * Generates a lightweight HTML card for a single decoration legend item.
 */
export function generateLegendCardHtml(item: DecorationLegendItem, isSelected: boolean = false): string {
  const selectedClass = isSelected ? ' selected' : '';
  const escapedName = escapeHtml(item.name);
  const escapedColorName = escapeHtml(item.colorName);
  const escapedCategoryLabel = escapeHtml(item.categoryLabel);
  const escapedDescription = escapeHtml(item.description);
  const escapedAdvice = escapeHtml(item.advice);

  return `
<div class="legend-card${selectedClass}" data-decoration-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}">
  <div class="legend-card-header">
    <span class="legend-badge" style="background-color: ${escapeHtml(item.colorCode)}; color: #ffffff;">
      ${escapedColorName}${escapedCategoryLabel}
    </span>
    <span class="legend-title">${escapedName}</span>
  </div>
  <p class="legend-description">${escapedDescription}</p>
  <div class="legend-advice">
    <strong>💡 作家向けアドバイス:</strong> ${escapedAdvice}
  </div>
</div>`.trim();
}

/**
 * Generates combined HTML for all legend cards, optionally filtered by category.
 */
export function generateAllLegendCardsHtml(filterCategory?: DecorationCategory): string {
  const items = filterCategory
    ? getDecorationLegendItemsByCategory(filterCategory)
    : getAllDecorationLegendItems();

  return items.map((item) => generateLegendCardHtml(item)).join('\n');
}

/**
 * Inspector state model for managing decoration selection, category filtering,
 * active filter toggles, and inspector HTML generation.
 */
export class DecorationInspectorModel {
  private selectedCategory: DecorationCategory | 'all' = 'all';
  private selectedTypeId: DecorationTypeId | null = null;
  private activeFilters: Set<DecorationTypeId> = new Set();

  public setSelectedCategory(category: DecorationCategory | 'all'): void {
    this.selectedCategory = category;
  }

  public getSelectedCategory(): DecorationCategory | 'all' {
    return this.selectedCategory;
  }

  public selectDecorationType(id: DecorationTypeId | null): void {
    this.selectedTypeId = id;
  }

  public getSelectedDecorationType(): DecorationTypeId | null {
    return this.selectedTypeId;
  }

  public toggleFilter(id: DecorationTypeId): void {
    if (this.activeFilters.has(id)) {
      this.activeFilters.delete(id);
    } else {
      this.activeFilters.add(id);
    }
  }

  public setFilterActive(id: DecorationTypeId, active: boolean): void {
    if (active) {
      this.activeFilters.add(id);
    } else {
      this.activeFilters.delete(id);
    }
  }

  public isFilterActive(id: DecorationTypeId): boolean {
    return this.activeFilters.has(id);
  }

  public clearFilters(): void {
    this.activeFilters.clear();
  }

  public getFilteredItems(): DecorationLegendItem[] {
    let items = getAllDecorationLegendItems();

    if (this.selectedCategory !== 'all') {
      items = items.filter((item) => item.category === this.selectedCategory);
    }

    if (this.activeFilters.size > 0) {
      items = items.filter((item) => this.activeFilters.has(item.id));
    }

    return items;
  }

  public renderInspectorHtml(): string {
    const items = this.getFilteredItems();

    if (items.length === 0) {
      return '<div class="legend-inspector-empty">該当する凡例項目はありません。</div>';
    }

    return items
      .map((item) => generateLegendCardHtml(item, item.id === this.selectedTypeId))
      .join('\n');
  }
}
