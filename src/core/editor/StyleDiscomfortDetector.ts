/**
 * StyleDiscomfortDetector - Japanese style discomfort detector for Plotailor IDE.
 *
 * Detects:
 * 1. Double Negative constructions (二重否定: 「〜なくもない」「〜ないわけではない」など)
 * 2. Double Keigo & Excessive Keigo (二重敬語・過剰敬語: 「お見えになられる」「ご覧になられる」など)
 *
 * Provides improvement candidates (suggestions) and exact character offsets (from, to).
 * Supports IME composition protection (isComposing) to prevent jitter.
 */

export type DiscomfortCategory = 'double_negative' | 'excessive_keigo';

export interface StyleDiagnostic {
  from: number;
  to: number;
  category: DiscomfortCategory;
  severity: 'warning' | 'info' | 'error';
  text: string;
  message: string;
  suggestions: string[];
}

export interface DetectorOptions {
  isComposing?: boolean;
}

export interface DiscomfortRule {
  pattern: RegExp | string;
  category: DiscomfortCategory;
  message: string;
  suggestions: string[] | ((matchText: string) => string[]);
  severity?: 'warning' | 'info' | 'error';
}

/**
 * Built-in rules for double negative expressions and excessive keigo.
 */
export const BUILTIN_DISCOMFORT_RULES: DiscomfortRule[] = [
  // --- Double Negative Rules ---
  {
    pattern: /ないわけではな(?:い|かった|く)(?:が)?/g,
    category: 'double_negative',
    message: '二重否定の構文です。まわりくどい印象を与える可能性があります。',
    suggestions: ['（肯定文に簡素化）'],
  },
  {
    pattern: /ないわけじゃな(?:い|かった|く)/g,
    category: 'double_negative',
    message: '二重否定の構文（口語）です。',
    suggestions: ['（肯定文に簡素化）'],
  },
  {
    pattern: /なくもな(?:い|かった|く)(?:が)?/g,
    category: 'double_negative',
    message: '二重否定の構文です。断定を避ける表現ですが文章が複雑になります。',
    suggestions: ['（肯定文に簡素化）'],
  },
  {
    pattern: /(?:なく|く)はな(?:い|かった|く)/g,
    category: 'double_negative',
    message: '二重否定の構文です。',
    suggestions: ['（肯定文に簡素化）'],
  },
  {
    pattern: /ないこともな(?:い|かった|く)(?:が)?/g,
    category: 'double_negative',
    message: '二重否定の構文です。',
    suggestions: ['（肯定文に簡素化）'],
  },
  {
    pattern: /ないでもな(?:い|かった|く)/g,
    category: 'double_negative',
    message: '二重否定の構文です。',
    suggestions: ['（肯定文に簡素化）'],
  },
  {
    pattern: /(?:し|でき|分から|わから|言わ)なくもない/g,
    category: 'double_negative',
    message: '二重否定の構文です。',
    suggestions: ['（肯定表現に修正）'],
  },

  // --- Double Keigo / Excessive Keigo Rules ---
  {
    pattern: /お見えになられる/g,
    category: 'excessive_keigo',
    message: '「お見えになる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['お見えになる', '来られる'],
  },
  {
    pattern: /お越しになられる/g,
    category: 'excessive_keigo',
    message: '「お越しになる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['お越しになる', '来られる'],
  },
  {
    pattern: /ご覧になられる/g,
    category: 'excessive_keigo',
    message: '「ご覧になる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['ご覧になる', '見られる'],
  },
  {
    pattern: /お召し上がりになられる/g,
    category: 'excessive_keigo',
    message: '「お召し上がりになる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['お召し上がりになる', '召し上がる'],
  },
  {
    pattern: /(?:おっしゃられる|仰られる)/g,
    category: 'excessive_keigo',
    message: '「おっしゃる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['おっしゃる', '言われる'],
  },
  {
    pattern: /お帰りになられる/g,
    category: 'excessive_keigo',
    message: '「お帰りになる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['お帰りになる', '帰られる'],
  },
  {
    pattern: /お読みになられる/g,
    category: 'excessive_keigo',
    message: '「お読みになる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['お読みになる', '読まれる'],
  },
  {
    pattern: /お聞きになられる/g,
    category: 'excessive_keigo',
    message: '「お聞きになる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['お聞きになる', '聞かれる'],
  },
  {
    pattern: /おいでになられる/g,
    category: 'excessive_keigo',
    message: '「おいでになる（尊敬語）」と「〜られる（尊敬語）」の二重敬語です。',
    suggestions: ['おいでになる', '来られる'],
  },
  {
    pattern: /ご提示される/g,
    category: 'excessive_keigo',
    message: '「ご〜される」は過剰敬語・誤用の可能性があります。',
    suggestions: ['ご提示する', '提示される', 'ご提示いただく'],
  },
  {
    pattern: /ご出席される/g,
    category: 'excessive_keigo',
    message: '「ご〜される」は過剰敬語の可能性があります。',
    suggestions: ['ご出席なさる', '出席される'],
  },
  {
    pattern: /ご案内される/g,
    category: 'excessive_keigo',
    message: '「ご〜される」は過剰敬語の可能性があります。',
    suggestions: ['ご案内する', '案内される'],
  },
  {
    pattern: /ご検討される/g,
    category: 'excessive_keigo',
    message: '「ご〜される」は過剰敬語の可能性があります。',
    suggestions: ['ご検討なさる', '検討される'],
  },
  {
    pattern: /拝見させていただく/g,
    category: 'excessive_keigo',
    message: '「拝見する（謙譲語）」と「させていただく（許可・謙譲）」の過剰敬語です。',
    suggestions: ['拝見する', '拝見いたします'],
  },
  {
    pattern: /(社長|部長|課長|会長|専務|常務)様/g,
    category: 'excessive_keigo',
    message: '役職名には敬称（様）が含まれるため二重敬義となります。',
    suggestions: (matchText: string) => {
      const title = matchText.replace(/様$/, '');
      return [title, `〇〇${title}`];
    },
  },
];

export class StyleDiscomfortDetector {
  private rules: DiscomfortRule[] = [];

  constructor(customRules: DiscomfortRule[] = []) {
    this.rules = [...BUILTIN_DISCOMFORT_RULES, ...customRules];
  }

  /**
   * Adds a new detection rule to the engine.
   */
  public addRule(rule: DiscomfortRule): void {
    this.rules.push(rule);
  }

  /**
   * Replaces all current rules with the provided list.
   */
  public setRules(rules: DiscomfortRule[]): void {
    this.rules = [...rules];
  }

  /**
   * Returns copy of active rules.
   */
  public getRules(): DiscomfortRule[] {
    return [...this.rules];
  }

  /**
   * Scans input manuscript text for double negative and excessive keigo issues.
   * Skips detection if options.isComposing is true (IME input active).
   */
  public detect(text: string, options?: DetectorOptions): StyleDiagnostic[] {
    if (options?.isComposing) {
      return [];
    }

    if (!text) {
      return [];
    }

    const diagnostics: StyleDiagnostic[] = [];

    for (const rule of this.rules) {
      const regex = rule.pattern instanceof RegExp
        ? new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g')
        : new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const matchText = match[0];
        const from = match.index;
        const to = from + matchText.length;

        const suggestions = typeof rule.suggestions === 'function'
          ? rule.suggestions(matchText)
          : [...rule.suggestions];

        diagnostics.push({
          from,
          to,
          category: rule.category,
          severity: rule.severity ?? 'warning',
          text: matchText,
          message: rule.message,
          suggestions,
        });
      }
    }

    // Sort diagnostics by starting offset ascending, then ending offset descending
    diagnostics.sort((a, b) => a.from - b.from || b.to - a.to);

    return diagnostics;
  }
}
