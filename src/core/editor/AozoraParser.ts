/**
 * AozoraParser - Aozora Bunko markup parser for Japanese literature IDE
 * 
 * Complies with WorldCraft / Plotailor editor specifications:
 * - Explicit ruby: ｜親文字《るび》
 * - Implicit kanji ruby: 漢字《るび》
 * - Bouten (emphasis): 《《傍点》》 and ［＃「...」に傍点］
 * - Ruby sagari: 〔ルビ下がり〕
 * - Source-to-Display bidirectional offset mapping
 */

export interface TextSpan {
  type: 'text';
  text: string;
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
}

export interface RubySpan {
  type: 'ruby';
  parent: string;
  ruby: string;
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
}

export interface BoutenSpan {
  type: 'bouten';
  text: string;
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
}

export interface RubySagariSpan {
  type: 'ruby-sagari';
  text: string;
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
}

export interface TcySpan {
  type: 'tcy';
  text: string;
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
}

export interface WarichuSpan {
  type: 'warichu';
  text: string;
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
}

export interface CommentSpan {
  type: 'comment';
  comment: string;
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
}

export type AozoraSpan =
  | TextSpan
  | RubySpan
  | BoutenSpan
  | RubySagariSpan
  | TcySpan
  | WarichuSpan
  | CommentSpan;

export interface OffsetMapping {
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
  delta: number;
}

export class SourceToDisplayMap {
  private mappings: OffsetMapping[];

  constructor(mappings: OffsetMapping[]) {
    this.mappings = mappings;
  }

  toDisplayOffset(rawOffset: number): number {
    if (this.mappings.length === 0) return rawOffset;

    for (const m of this.mappings) {
      if (rawOffset < m.rawFrom) {
        return rawOffset;
      }
      if (rawOffset >= m.rawFrom && rawOffset <= m.rawTo) {
        // Clamped within display span
        const progress = (rawOffset - m.rawFrom) / Math.max(1, m.rawTo - m.rawFrom);
        return Math.round(m.displayFrom + progress * (m.displayTo - m.displayFrom));
      }
    }

    const last = this.mappings[this.mappings.length - 1];
    return rawOffset + last.delta;
  }

  toRawOffset(displayOffset: number): number {
    if (this.mappings.length === 0) return displayOffset;

    for (const m of this.mappings) {
      if (displayOffset < m.displayFrom) {
        return displayOffset;
      }
      if (displayOffset >= m.displayFrom && displayOffset <= m.displayTo) {
        const progress = (displayOffset - m.displayFrom) / Math.max(1, m.displayTo - m.displayFrom);
        return Math.round(m.rawFrom + progress * (m.rawTo - m.rawFrom));
      }
    }

    const last = this.mappings[this.mappings.length - 1];
    return displayOffset - last.delta;
  }
}

export class AozoraParser {
  // Regex patterns
  private static readonly EXPLICIT_RUBY_RE = /[｜|]([^\n｜|《》<>＜＞]+?)(?:《|<<|＜＜)([^\n《》<>＜＞]+?)(?:》|>>|＞＞)/g;
  private static readonly IMPLICIT_KANJI_RUBY_RE = /([一-龠々〆ヵヶ\u3400-\u4dbf\uf900-\ufaff\u30a0-\u30ffA-Za-z0-9]+?)(?:《|<<|＜＜)([^\n《》<>＜＞]+?)(?:》|>>|＞＞)/g;
  private static readonly BOUTEN_FOUR_ANGLE_RE = /(?:<{4,}|＜{4,})([^\n<>《》＜＞]+?)(?:>{4,}|＞{4,})/g;
  private static readonly BOUTEN_RE = /《《([^》\r\n]+)》》/g;
  private static readonly BOUTEN_ALT_RE = /(?:［＃「([^」\r\n]+)」に傍点］|[［\[]＃傍点[］\]]([^\n［］\[\]]+?)[［\[]＃傍点終わり[］\]])/g;
  private static readonly RUBY_SAGARI_RE = /〔([^〕\r\n]+)〕/g;
  private static readonly TCY_RE = /(?:［＃「([^」\r\n]+)」は縦中横］|[［\[]＃縦中横[］\]]([^\n［］\[\]]+?)[［\[]＃縦中横終わり[］\]])/g;
  private static readonly WARICHU_RE = /(?:［＃「([^」\r\n]+)」は割り注］|[［\[]＃割り注[］\]]([^\n［］\[\]]+?)[［\[]＃割り注終わり[］\]]|〔割り注：?([^〕\r\n]+)〕)/g;
  private static readonly COMMENT_LINE_RE = /\/\/(.*)$/gm;
  private static readonly COMMENT_BLOCK_RE = /%%([^%\r\n]+)%%/g;

  /**
   * Parse text into structured semantic spans with exact raw/display offsets.
   */
  static parse(rawText: string): { spans: AozoraSpan[]; map: SourceToDisplayMap } {
    const rawMatches: {
      type: 'ruby' | 'bouten' | 'ruby-sagari' | 'tcy' | 'warichu' | 'comment';
      rawFrom: number;
      rawTo: number;
      text: string;
      ruby?: string;
    }[] = [];

    // 0. Bouten <<<<...>>>> or ＜＜＜＜...＞＞＞＞
    let match: RegExpExecArray | null;
    const boutenFourRe = new RegExp(this.BOUTEN_FOUR_ANGLE_RE);
    while ((match = boutenFourRe.exec(rawText)) !== null) {
      rawMatches.push({
        type: 'bouten',
        rawFrom: match.index,
        rawTo: match.index + match[0].length,
        text: match[1],
      });
    }

    // 1. Bouten 《《...》》
    const boutenRe = new RegExp(this.BOUTEN_RE);
    while ((match = boutenRe.exec(rawText)) !== null) {
      rawMatches.push({
        type: 'bouten',
        rawFrom: match.index,
        rawTo: match.index + match[0].length,
        text: match[1],
      });
    }

    // 2. Bouten ［＃「...」に傍点］ or ［＃傍点］...［＃傍点終わり］
    const boutenAltRe = new RegExp(this.BOUTEN_ALT_RE);
    while ((match = boutenAltRe.exec(rawText)) !== null) {
      rawMatches.push({
        type: 'bouten',
        rawFrom: match.index,
        rawTo: match.index + match[0].length,
        text: match[1] || match[2],
      });
    }

    // 3. Explicit Ruby ｜親文字《るび》
    const explicitRubyRe = new RegExp(this.EXPLICIT_RUBY_RE);
    while ((match = explicitRubyRe.exec(rawText)) !== null) {
      rawMatches.push({
        type: 'ruby',
        rawFrom: match.index,
        rawTo: match.index + match[0].length,
        text: match[1],
        ruby: match[2],
      });
    }

    // 4. Implicit Kanji Ruby 漢字《るび》 (ignore if overlaps existing match)
    const implicitRubyRe = new RegExp(this.IMPLICIT_KANJI_RUBY_RE);
    while ((match = implicitRubyRe.exec(rawText)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const overlaps = rawMatches.some((m) => Math.max(start, m.rawFrom) < Math.min(end, m.rawTo));
      if (!overlaps) {
        rawMatches.push({
          type: 'ruby',
          rawFrom: start,
          rawTo: end,
          text: match[1],
          ruby: match[2],
        });
      }
    }

    // 5. Warichu (割り注) ［＃「...」は割り注］ or ［＃割り注］...［＃割り注終わり］ or 〔割り注：...〕
    const warichuRe = new RegExp(this.WARICHU_RE);
    while ((match = warichuRe.exec(rawText)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const overlaps = rawMatches.some((m) => Math.max(start, m.rawFrom) < Math.min(end, m.rawTo));
      if (!overlaps) {
        rawMatches.push({
          type: 'warichu',
          rawFrom: start,
          rawTo: end,
          text: match[1] || match[2] || match[3] || '',
        });
      }
    }

    // 6. Ruby Sagari 〔...〕
    const rubySagariRe = new RegExp(this.RUBY_SAGARI_RE);
    while ((match = rubySagariRe.exec(rawText)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const overlaps = rawMatches.some((m) => Math.max(start, m.rawFrom) < Math.min(end, m.rawTo));
      if (!overlaps) {
        rawMatches.push({
          type: 'ruby-sagari',
          rawFrom: start,
          rawTo: end,
          text: match[1],
        });
      }
    }

    // 7. TCY (縦中横) ［＃縦中横］...［＃縦中横終わり］ or ［＃「...」は縦中横］
    const tcyRe = new RegExp(this.TCY_RE);
    while ((match = tcyRe.exec(rawText)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const overlaps = rawMatches.some((m) => Math.max(start, m.rawFrom) < Math.min(end, m.rawTo));
      if (!overlaps) {
        rawMatches.push({
          type: 'tcy',
          rawFrom: start,
          rawTo: end,
          text: match[1] || match[2] || '',
        });
      }
    }

    // 8. Comment Block %%...%%
    const commentBlockRe = new RegExp(this.COMMENT_BLOCK_RE);
    while ((match = commentBlockRe.exec(rawText)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const overlaps = rawMatches.some((m) => Math.max(start, m.rawFrom) < Math.min(end, m.rawTo));
      if (!overlaps) {
        rawMatches.push({
          type: 'comment',
          rawFrom: start,
          rawTo: end,
          text: match[1],
        });
      }
    }

    // 9. Comment Line //...
    const commentLineRe = new RegExp(this.COMMENT_LINE_RE);
    while ((match = commentLineRe.exec(rawText)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const overlaps = rawMatches.some((m) => Math.max(start, m.rawFrom) < Math.min(end, m.rawTo));
      if (!overlaps) {
        rawMatches.push({
          type: 'comment',
          rawFrom: start,
          rawTo: end,
          text: match[1],
        });
      }
    }

    // Sort matches by start offset
    rawMatches.sort((a, b) => a.rawFrom - b.rawFrom);

    const spans: AozoraSpan[] = [];
    const mappings: OffsetMapping[] = [];
    let currentRaw = 0;
    let currentDisplay = 0;

    for (const m of rawMatches) {
      if (m.rawFrom > currentRaw) {
        const plainText = rawText.slice(currentRaw, m.rawFrom);
        const len = plainText.length;
        spans.push({
          type: 'text',
          text: plainText,
          rawFrom: currentRaw,
          rawTo: m.rawFrom,
          displayFrom: currentDisplay,
          displayTo: currentDisplay + len,
        });
        currentDisplay += len;
      }

      // Hidden comments do not take display width
      const isComment = m.type === 'comment';
      const displayText = isComment ? '' : m.text;
      const displayLen = displayText.length;
      const displayStart = currentDisplay;
      const displayEnd = currentDisplay + displayLen;

      if (m.type === 'ruby') {
        spans.push({
          type: 'ruby',
          parent: m.text,
          ruby: m.ruby ?? '',
          rawFrom: m.rawFrom,
          rawTo: m.rawTo,
          displayFrom: displayStart,
          displayTo: displayEnd,
        });
      } else if (m.type === 'bouten') {
        spans.push({
          type: 'bouten',
          text: m.text,
          rawFrom: m.rawFrom,
          rawTo: m.rawTo,
          displayFrom: displayStart,
          displayTo: displayEnd,
        });
      } else if (m.type === 'ruby-sagari') {
        spans.push({
          type: 'ruby-sagari',
          text: m.text,
          rawFrom: m.rawFrom,
          rawTo: m.rawTo,
          displayFrom: displayStart,
          displayTo: displayEnd,
        });
      } else if (m.type === 'tcy') {
        spans.push({
          type: 'tcy',
          text: m.text,
          rawFrom: m.rawFrom,
          rawTo: m.rawTo,
          displayFrom: displayStart,
          displayTo: displayEnd,
        });
      } else if (m.type === 'warichu') {
        spans.push({
          type: 'warichu',
          text: m.text,
          rawFrom: m.rawFrom,
          rawTo: m.rawTo,
          displayFrom: displayStart,
          displayTo: displayEnd,
        });
      } else if (m.type === 'comment') {
        spans.push({
          type: 'comment',
          comment: m.text,
          rawFrom: m.rawFrom,
          rawTo: m.rawTo,
          displayFrom: displayStart,
          displayTo: displayEnd,
        });
      }

      mappings.push({
        rawFrom: m.rawFrom,
        rawTo: m.rawTo,
        displayFrom: displayStart,
        displayTo: displayEnd,
        delta: displayEnd - m.rawTo,
      });

      currentDisplay += displayLen;
      currentRaw = m.rawTo;
    }

    if (currentRaw < rawText.length) {
      const remaining = rawText.slice(currentRaw);
      const len = remaining.length;
      spans.push({
        type: 'text',
        text: remaining,
        rawFrom: currentRaw,
        rawTo: rawText.length,
        displayFrom: currentDisplay,
        displayTo: currentDisplay + len,
      });
    }

    return {
      spans,
      map: new SourceToDisplayMap(mappings),
    };
  }

  /**
   * Converts raw Aozora text directly to semantic HTML string.
   */
  static toHtml(rawText: string): string {
    const { spans } = this.parse(rawText);
    return spans
      .map((s) => {
        switch (s.type) {
          case 'text':
            return escapeHtml(s.text);
          case 'ruby':
            return `<ruby>${escapeHtml(s.parent)}<rt>${escapeHtml(s.ruby)}</rt></ruby>`;
          case 'bouten':
            return `<span class="bouten">${escapeHtml(s.text)}</span>`;
          case 'ruby-sagari':
            return `<span class="ruby-sagari">${escapeHtml(s.text)}</span>`;
        }
      })
      .join('');
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
