// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  DECORATION_LEGEND_DICTIONARY,
  getAllDecorationLegendItems,
  getDecorationLegendItem,
  getDecorationLegendItemsByCategory,
  generateLegendCardHtml,
  generateAllLegendCardsHtml,
  DecorationInspectorModel,
} from '../src/core/editor/DecorationLegendDictionary.js';

describe('DecorationLegendDictionary', () => {
  it('contains all required wavy line definitions with correct metadata', () => {
    const wavyRed = getDecorationLegendItem('wavy_red');
    expect(wavyRed).toBeDefined();
    expect(wavyRed?.name).toBe('用語不整合');
    expect(wavyRed?.colorName).toBe('赤');
    expect(wavyRed?.colorCode).toBe('#ef4444');
    expect(wavyRed?.category).toBe('wavy_line');
    expect(wavyRed?.advice).toContain('QuickFix');

    const wavyYellow = getDecorationLegendItem('wavy_yellow');
    expect(wavyYellow?.name).toBe('助詞連続');
    expect(wavyYellow?.colorName).toBe('黄');
    expect(wavyYellow?.colorCode).toBe('#f59e0b');

    const wavyBlue = getDecorationLegendItem('wavy_blue');
    expect(wavyBlue?.name).toBe('受動態過多');
    expect(wavyBlue?.colorName).toBe('青');
    expect(wavyBlue?.colorCode).toBe('#3b82f6');

    const wavyOrange = getDecorationLegendItem('wavy_orange');
    expect(wavyOrange?.name).toBe('文体違和感');
    expect(wavyOrange?.colorName).toBe('橙');
    expect(wavyOrange?.colorCode).toBe('#f97316');
  });

  it('contains all required dotted line definitions', () => {
    const evenPair = getDecorationLegendItem('dotted_even_pair');
    expect(evenPair?.name).toBe('偶数対');
    expect(evenPair?.category).toBe('dotted_line');

    const bouten = getDecorationLegendItem('dotted_bouten');
    expect(bouten?.name).toBe('傍点');
    expect(bouten?.category).toBe('dotted_line');
  });

  it('contains all required text highlight definitions', () => {
    const person = getDecorationLegendItem('highlight_person');
    expect(person?.name).toBe('人物');
    expect(person?.category).toBe('text_highlight');

    const item = getDecorationLegendItem('highlight_item');
    expect(item?.name).toBe('アイテム');
    expect(item?.category).toBe('text_highlight');

    const location = getDecorationLegendItem('highlight_location');
    expect(location?.name).toBe('地名');
    expect(location?.category).toBe('text_highlight');
  });

  it('retrieves items by category correctly', () => {
    const wavyItems = getDecorationLegendItemsByCategory('wavy_line');
    expect(wavyItems.length).toBe(4);
    expect(wavyItems.map((i) => i.id)).toEqual(['wavy_red', 'wavy_yellow', 'wavy_blue', 'wavy_orange']);

    const dottedItems = getDecorationLegendItemsByCategory('dotted_line');
    expect(dottedItems.length).toBe(2);

    const highlightItems = getDecorationLegendItemsByCategory('text_highlight');
    expect(highlightItems.length).toBe(3);
  });

  it('generates valid lightweight HTML cards', () => {
    const item = DECORATION_LEGEND_DICTIONARY.wavy_red;
    const html = generateLegendCardHtml(item, true);

    expect(html).toContain('class="legend-card selected"');
    expect(html).toContain('data-decoration-id="wavy_red"');
    expect(html).toContain('#ef4444');
    expect(html).toContain('用語不整合');
    expect(html).toContain('💡 作家向けアドバイス:');
  });

  it('generates combined HTML for all cards or filtered category', () => {
    const allHtml = generateAllLegendCardsHtml();
    expect(allHtml).toContain('data-decoration-id="wavy_red"');
    expect(allHtml).toContain('data-decoration-id="dotted_bouten"');
    expect(allHtml).toContain('data-decoration-id="highlight_person"');

    const dottedOnlyHtml = generateAllLegendCardsHtml('dotted_line');
    expect(dottedOnlyHtml).toContain('data-decoration-id="dotted_bouten"');
    expect(dottedOnlyHtml).not.toContain('data-decoration-id="wavy_red"');
  });
});

describe('DecorationInspectorModel', () => {
  it('manages category filter and selection state', () => {
    const model = new DecorationInspectorModel();
    expect(model.getSelectedCategory()).toBe('all');
    expect(model.getFilteredItems().length).toBe(9);

    model.setSelectedCategory('wavy_line');
    expect(model.getFilteredItems().length).toBe(4);

    model.selectDecorationType('wavy_red');
    expect(model.getSelectedDecorationType()).toBe('wavy_red');

    const html = model.renderInspectorHtml();
    expect(html).toContain('class="legend-card selected"');
    expect(html).toContain('data-decoration-id="wavy_red"');
  });

  it('manages active toggle filters correctly', () => {
    const model = new DecorationInspectorModel();
    model.toggleFilter('wavy_red');
    model.toggleFilter('highlight_person');

    expect(model.isFilterActive('wavy_red')).toBe(true);
    expect(model.isFilterActive('highlight_person')).toBe(true);

    const filtered = model.getFilteredItems();
    expect(filtered.length).toBe(2);
    expect(filtered.map((i) => i.id)).toEqual(['wavy_red', 'highlight_person']);

    model.clearFilters();
    expect(model.getFilteredItems().length).toBe(9);
  });

  it('renders empty message when no items match filters', () => {
    const model = new DecorationInspectorModel();
    model.setSelectedCategory('dotted_line');
    model.setFilterActive('wavy_red', true);

    const html = model.renderInspectorHtml();
    expect(html).toContain('legend-inspector-empty');
  });
});
