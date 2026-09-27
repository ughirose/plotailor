/**
 * HierarchicalTocEngine - Multi-level Table of Contents Parser and Preset Engine
 *
 * Supports parsing Japanese literature structures (部・巻・章・節・話・プロローグ・エピローグ)
 * as well as Markdown headings into a multi-level tree.
 */

export type HeadingType =
  | 'part'
  | 'volume'
  | 'chapter'
  | 'section'
  | 'episode'
  | 'prologue'
  | 'epilogue'
  | 'interlude'
  | 'custom';

export interface TocNode {
  id: string;
  type: HeadingType;
  title: string;
  label?: string;
  rawText: string;
  level: number;
  lineNumber: number;
  charOffset: number;
  children: TocNode[];
  parentId?: string;
}

export type PresetType = 'web-novel' | 'bunko' | 'markdown' | 'auto';

export interface HeadingRule {
  type: HeadingType;
  level: number;
  pattern: RegExp;
  labelGroup?: number;
  titleGroup?: number;
}

export interface TocPreset {
  id: PresetType | string;
  name: string;
  rules: HeadingRule[];
}

export interface ParseOptions {
  preset?: PresetType | TocPreset;
  strictMode?: boolean;
  maxHeadingLength?: number;
}

export interface FormatOptions {
  formatStyle?: 'markdown' | 'text' | 'html';
  indentString?: string;
  includeLineNumbers?: boolean;
}

export interface TocStats {
  totalHeadings: number;
  countsByType: Record<HeadingType, number>;
  maxDepth: number;
}

// Preset Definitions
const KANJI_ARABIC_NUM = '[0-9０-９一二三四五六七八九十百千]+';

export const WEB_NOVEL_PRESET: TocPreset = {
  id: 'web-novel',
  name: 'Web Novel Preset',
  rules: [
    {
      type: 'part',
      level: 1,
      pattern: new RegExp(`^\\s*(第${KANJI_ARABIC_NUM}部|[0-9０-９一二三四五六七八九十百千]+部)(?:[\\s：:\\─\\-─]*(.*))?$`),
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'chapter',
      level: 2,
      pattern: new RegExp(`^\\s*(第${KANJI_ARABIC_NUM}章)(?:[\\s：:\\─\\-─]*(.*))?$`),
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'prologue',
      level: 2,
      pattern: /^\s*(プロローグ|序章|序)(?:[\s：:\─\-─]*(.*))?$/i,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'epilogue',
      level: 2,
      pattern: /^\s*(エピローグ|終章|結|あとがき|後書き)(?:[\s：:\─\-─]*(.*))?$/i,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'interlude',
      level: 3,
      pattern: /^\s*(幕間|転章|間話)(?:[\s：:\─\-─]*(.*))?$/i,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'episode',
      level: 3,
      pattern: new RegExp(`^\\s*(第${KANJI_ARABIC_NUM}話|${KANJI_ARABIC_NUM}話)(?:[\\s：:\\─\\-─]*(.*))?$`),
      labelGroup: 1,
      titleGroup: 2,
    },
  ],
};

export const BUNKO_PRESET: TocPreset = {
  id: 'bunko',
  name: 'Bunko Preset',
  rules: [
    {
      type: 'part',
      level: 1,
      pattern: new RegExp(`^\\s*(第${KANJI_ARABIC_NUM}部|[0-9０-９一二三四五六七八九十百千]+部)(?:[\\s：:\\─\\-─]*(.*))?$`),
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'volume',
      level: 2,
      pattern: new RegExp(`^\\s*(第${KANJI_ARABIC_NUM}巻|${KANJI_ARABIC_NUM}巻)(?:[\\s：:\\─\\-─]*(.*))?$`),
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'chapter',
      level: 3,
      pattern: new RegExp(`^\\s*(第${KANJI_ARABIC_NUM}章)(?:[\\s：:\\─\\-─]*(.*))?$`),
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'prologue',
      level: 3,
      pattern: /^\s*(プロローグ|序章|序)(?:[\s：:\─\-─]*(.*))?$/i,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'epilogue',
      level: 3,
      pattern: /^\s*(エピローグ|終章|結)(?:[\s：:\─\-─]*(.*))?$/i,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'interlude',
      level: 4,
      pattern: /^\s*(幕間|転章)(?:[\s：:\─\-─]*(.*))?$/i,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'section',
      level: 4,
      pattern: new RegExp(`^\\s*(第${KANJI_ARABIC_NUM}節|§\\s*${KANJI_ARABIC_NUM}|[0-9０-９一二三四五六七八九十百千]+節)(?:[\\s：:\\─\\-─]*(.*))?$`),
      labelGroup: 1,
      titleGroup: 2,
    },
  ],
};

export const MARKDOWN_PRESET: TocPreset = {
  id: 'markdown',
  name: 'Markdown Preset',
  rules: [
    {
      type: 'part',
      level: 1,
      pattern: /^\s*(#)\s+(.*)$/,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'chapter',
      level: 2,
      pattern: /^\s*(##)\s+(.*)$/,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'section',
      level: 3,
      pattern: /^\s*(###)\s+(.*)$/,
      labelGroup: 1,
      titleGroup: 2,
    },
    {
      type: 'episode',
      level: 4,
      pattern: /^\s*(####)\s+(.*)$/,
      labelGroup: 1,
      titleGroup: 2,
    },
  ],
};

const PRESET_MAP: Record<string, TocPreset> = {
  'web-novel': WEB_NOVEL_PRESET,
  'bunko': BUNKO_PRESET,
  'markdown': MARKDOWN_PRESET,
};

export class HierarchicalTocEngine {
  /**
   * Retrieves a preset definition by type or returns a custom preset.
   */
  static getPreset(preset: PresetType | TocPreset): TocPreset {
    if (typeof preset === 'object') {
      return preset;
    }
    if (preset === 'auto') {
      return WEB_NOVEL_PRESET;
    }
    return PRESET_MAP[preset] || WEB_NOVEL_PRESET;
  }

  /**
   * Auto-detects the preset style based on line pattern matching in raw text.
   */
  static detectPreset(text: string): PresetType {
    let markdownScore = 0;
    let webNovelScore = 0;
    let bunkoScore = 0;

    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^\s*#{1,4}\s+/.test(line)) {
        markdownScore += 2;
      }
      if (/第[0-9０-９一二三四五六七八九十百千]+話|[0-9０-９一二三四五六七八九十百千]+話/.test(trimmed)) {
        webNovelScore += 2;
      }
      if (/第[0-9０-９一二三四五六七八九十百千]+節|§\s*[0-90-9]+|第[0-9０-９一二三四五六七八九十百千]+巻/.test(trimmed)) {
        bunkoScore += 2;
      }
      if (/第[0-9０-９一二三四五六七八九十百千]+部|第[0-9０-９一二三四五六七八九十百千]+章/.test(trimmed)) {
        webNovelScore += 1;
        bunkoScore += 1;
      }
    }

    if (markdownScore > webNovelScore && markdownScore > bunkoScore) {
      return 'markdown';
    }
    if (bunkoScore > webNovelScore) {
      return 'bunko';
    }
    return 'web-novel';
  }

  /**
   * Parses raw text into a multi-level TocNode tree.
   */
  static parse(text: string, options: ParseOptions = {}): TocNode[] {
    const presetType = options.preset === 'auto' || !options.preset
      ? this.detectPreset(text)
      : options.preset;

    const activePreset = this.getPreset(presetType);
    const maxHeadingLen = options.maxHeadingLength ?? 100;

    const rootNodes: TocNode[] = [];
    const stack: TocNode[] = [];

    let charOffset = 0;
    const lines = text.split(/\r?\n/);
    let idCounter = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const currentOffset = charOffset;
      charOffset += line.length + 1; // +1 for newline character

      const trimmed = line.trim();
      if (!trimmed || trimmed.length > maxHeadingLen) {
        continue;
      }

      // Find matching rule from preset
      let matchedNode: TocNode | null = null;

      for (const rule of activePreset.rules) {
        const match = rule.pattern.exec(line);
        if (match) {
          const rawLabel = rule.labelGroup && match[rule.labelGroup] ? match[rule.labelGroup].trim() : '';
          const rawTitle = rule.titleGroup && match[rule.titleGroup] ? match[rule.titleGroup].trim() : '';

          let title = rawTitle;
          let label: string | undefined = rawLabel || undefined;

          if (!title && !label) {
            title = trimmed;
          } else if (!title && label) {
            title = label;
          }

          matchedNode = {
            id: `toc-${idCounter++}`,
            type: rule.type,
            title,
            label,
            rawText: line,
            level: rule.level,
            lineNumber,
            charOffset: currentOffset,
            children: [],
          };
          break;
        }
      }

      if (matchedNode) {
        // Build hierarchy stack
        while (stack.length > 0 && stack[stack.length - 1].level >= matchedNode.level) {
          stack.pop();
        }

        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          matchedNode.parentId = parent.id;
          parent.children.push(matchedNode);
        } else {
          rootNodes.push(matchedNode);
        }

        stack.push(matchedNode);
      }
    }

    return rootNodes;
  }

  /**
   * Flattens a TocNode hierarchy tree into a flat array of nodes in sequential order.
   */
  static flatten(nodes: TocNode[]): TocNode[] {
    const result: TocNode[] = [];
    const traverse = (nodeList: TocNode[]) => {
      for (const node of nodeList) {
        result.push(node);
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return result;
  }

  /**
   * Finds the active TOC node for a given 1-based line number.
   */
  static findNodeByLine(nodes: TocNode[], lineNumber: number): TocNode | null {
    const flat = this.flatten(nodes);
    let activeNode: TocNode | null = null;

    for (const node of flat) {
      if (node.lineNumber <= lineNumber) {
        activeNode = node;
      } else {
        break;
      }
    }

    return activeNode;
  }

  /**
   * Calculates statistics for a TOC node tree.
   */
  static getTocStats(nodes: TocNode[]): TocStats {
    const flat = this.flatten(nodes);
    const countsByType: Record<HeadingType, number> = {
      part: 0,
      volume: 0,
      chapter: 0,
      section: 0,
      episode: 0,
      prologue: 0,
      epilogue: 0,
      interlude: 0,
      custom: 0,
    };

    let maxDepth = 0;

    for (const node of flat) {
      if (node.type in countsByType) {
        countsByType[node.type]++;
      } else {
        countsByType.custom++;
      }
      if (node.level > maxDepth) {
        maxDepth = node.level;
      }
    }

    return {
      totalHeadings: flat.length,
      countsByType,
      maxDepth,
    };
  }

  /**
   * Formats a TOC tree into Markdown, indented plain text, or HTML list.
   */
  static format(nodes: TocNode[], options: FormatOptions = {}): string {
    const style = options.formatStyle ?? 'markdown';
    const indent = options.indentString ?? '  ';
    const flat = this.flatten(nodes);

    if (style === 'markdown') {
      return flat
        .map((n) => {
          const hashes = '#'.repeat(Math.max(1, n.level));
          const lineNumStr = options.includeLineNumbers ? ` (L${n.lineNumber})` : '';
          const hasSymbolLabel = n.label && /^#+$/.test(n.label);
          const headingText = n.label && n.title && n.label !== n.title && !hasSymbolLabel
            ? `${n.label} ${n.title}`
            : n.title;
          return `${hashes} ${headingText}${lineNumStr}`;
        })
        .join('\n');
    }

    if (style === 'html') {
      const renderHtmlTree = (list: TocNode[]): string => {
        if (!list || list.length === 0) return '';
        const items = list
          .map((n) => {
            const hasSymbolLabel = n.label && /^#+$/.test(n.label);
            const headingText = n.label && n.title && n.label !== n.title && !hasSymbolLabel
              ? `${escapeHtml(n.label)} ${escapeHtml(n.title)}`
              : escapeHtml(n.title);
            const lineNumStr = options.includeLineNumbers ? ` <span class="line-num">(L${n.lineNumber})</span>` : '';
            const childrenHtml = renderHtmlTree(n.children);
            return `<li><span class="toc-item type-${n.type}">${headingText}</span>${lineNumStr}${childrenHtml}</li>`;
          })
          .join('');
        return `<ul class="toc-list">${items}</ul>`;
      };
      return renderHtmlTree(nodes);
    }

    // Default 'text'
    return flat
      .map((n) => {
        const padding = indent.repeat(Math.max(0, n.level - 1));
        const lineNumStr = options.includeLineNumbers ? ` (L${n.lineNumber})` : '';
        const hasSymbolLabel = n.label && /^#+$/.test(n.label);
        const headingText = n.label && n.title && n.label !== n.title && !hasSymbolLabel
          ? `${n.label} ${n.title}`
          : n.title;
        return `${padding}${headingText}${lineNumStr}`;
      })
      .join('\n');
  }

  /**
   * Converts TOC nodes from one preset format to another or formats labels.
   */
  static convertPreset(nodes: TocNode[], targetPresetType: PresetType): TocNode[] {
    const targetPreset = this.getPreset(targetPresetType);
    const flat = this.flatten(nodes);

    // Map types to target preset rules
    return flat.map((node) => {
      const matchingRule = targetPreset.rules.find((r) => r.type === node.type)
        || targetPreset.rules.find((r) => r.level === node.level);

      const targetLevel = matchingRule ? matchingRule.level : node.level;

      return {
        ...node,
        level: targetLevel,
        children: [], // Clear children in flattened re-mapping
      };
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
