/**
 * KanjiHirakuDictionary - Dictionary & Filtering Engine for Kanji terms recommended to be written in Hiragana ("ひらくべき語句")
 *
 * Linear-time multi-pattern matching using Aho-Corasick automaton with dynamic author rule toggles.
 * Complies with Plotailor Literature IDE Constitution: zero standalone modals, non-blocking background linting.
 */

import { AhoCorasickAutomaton } from '../nlp/AhoCorasickAutomaton.js';
import type { SourceToDisplayMap } from './AozoraParser.js';

export type HirakuCategory =
  | '形式名詞'
  | '接続詞'
  | '挨拶・慣用表現'
  | '副詞・連体詞'
  | '補助動詞'
  | string;

export interface HirakuDictionaryEntry {
  id: string;
  kanji: string;
  hiragana: string;
  category: HirakuCategory;
  ruleId: string;
  description?: string;
  enabledByDefault?: boolean;
}

export interface HirakuFilterConfig {
  disabledRuleIds?: string[];
  disabledCategories?: HirakuCategory[];
  disabledKanji?: string[];
  exclusions?: string[];
}

export interface HirakuDiagnostic {
  id: string;
  from: number;
  to: number;
  severity: 'warning' | 'info';
  message: string;
  kanji: string;
  hiragana: string;
  category: HirakuCategory;
  ruleId: string;
}

export const DEFAULT_HIRAKU_ENTRIES: HirakuDictionaryEntry[] = [
  // 形式名詞 (Formal Nouns)
  {
    id: 'hiraku-koto',
    kanji: '事',
    hiragana: 'こと',
    category: '形式名詞',
    ruleId: 'formal-noun',
    description: '形式名詞の「こと」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-toki',
    kanji: '時',
    hiragana: 'とき',
    category: '形式名詞',
    ruleId: 'formal-noun',
    description: '形式名詞・接尾辞的な「とき」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-tame',
    kanji: '為',
    hiragana: 'ため',
    category: '形式名詞',
    ruleId: 'formal-noun',
    description: '形式名詞の「ため」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-mono',
    kanji: '物',
    hiragana: 'もの',
    category: '形式名詞',
    ruleId: 'formal-noun',
    description: '抽象的な概念を表す形式名詞の「もの」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-tokoro',
    kanji: '所',
    hiragana: 'ところ',
    category: '形式名詞',
    ruleId: 'formal-noun',
    description: '場面や状況を表す形式名詞の「ところ」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-toori',
    kanji: '通り',
    hiragana: 'とおり',
    category: '形式名詞',
    ruleId: 'formal-noun',
    description: '「〜のとおり」等の形式名詞はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-wake',
    kanji: '訳',
    hiragana: 'わけ',
    category: '形式名詞',
    ruleId: 'formal-noun',
    description: '理由や状況を表す形式名詞の「わけ」はひらがな表記が推奨されます。',
  },

  // 接続詞 (Conjunctions)
  {
    id: 'hiraku-shikashi',
    kanji: '併し',
    hiragana: 'しかし',
    category: '接続詞',
    ruleId: 'conjunction',
    description: '接続詞の「しかし」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-tadashi',
    kanji: '但し',
    hiragana: 'ただし',
    category: '接続詞',
    ruleId: 'conjunction',
    description: '接続詞の「ただし」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-chinamini',
    kanji: '因みに',
    hiragana: 'ちなみに',
    category: '接続詞',
    ruleId: 'conjunction',
    description: '接続詞の「ちなみに」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-shikamo',
    kanji: '然も',
    hiragana: 'しかも',
    category: '接続詞',
    ruleId: 'conjunction',
    description: '接続詞の「しかも」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-shitagatte',
    kanji: '従って',
    hiragana: 'したがって',
    category: '接続詞',
    ruleId: 'conjunction',
    description: '接続詞の「したがって」はひらがな表記が推奨されます。',
  },

  // 挨拶・慣用表現 (Greetings / Idioms)
  {
    id: 'hiraku-arigatou-gozaimasu',
    kanji: '有難う御座います',
    hiragana: 'ありがとうございます',
    category: '挨拶・慣用表現',
    ruleId: 'greeting',
    description: '挨拶表現「ありがとうございます」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-arigatou',
    kanji: '有難う',
    hiragana: 'ありがとう',
    category: '挨拶・慣用表現',
    ruleId: 'greeting',
    description: '挨拶表現「ありがとう」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-yoroshiku',
    kanji: '宜しく',
    hiragana: 'よろしく',
    category: '挨拶・慣用表現',
    ruleId: 'greeting',
    description: '挨拶表現「よろしく」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-gozaimasu',
    kanji: '御座います',
    hiragana: 'ございます',
    category: '挨拶・慣用表現',
    ruleId: 'greeting',
    description: '丁寧表現「ございます」はひらがな表記が推奨されます。',
  },

  // 副詞・連体詞 (Adverbs / Pre-noun Adjectivals)
  {
    id: 'hiraku-nonoyouni',
    kanji: 'の様に',
    hiragana: 'のように',
    category: '副詞・連体詞',
    ruleId: 'adverb',
    description: '比喩・例示の「のように」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-youni',
    kanji: '様に',
    hiragana: 'ように',
    category: '副詞・連体詞',
    ruleId: 'adverb',
    description: '比喩・様態の「ように」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-isasaka',
    kanji: '些か',
    hiragana: 'いささか',
    category: '副詞・連体詞',
    ruleId: 'adverb',
    description: '副詞の「いささか」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-youyaku',
    kanji: '漸く',
    hiragana: 'ようやく',
    category: '副詞・連体詞',
    ruleId: 'adverb',
    description: '副詞の「ようやく」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-nao',
    kanji: '尚',
    hiragana: 'なお',
    category: '副詞・連体詞',
    ruleId: 'adverb',
    description: '副詞の「なお」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-tamatama',
    kanji: '偶々',
    hiragana: 'たまたま',
    category: '副詞・連体詞',
    ruleId: 'adverb',
    description: '副詞の「たまたま」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-sasuga',
    kanji: '流石',
    hiragana: 'さすが',
    category: '副詞・連体詞',
    ruleId: 'adverb',
    description: '副詞の「さすが」はひらがな表記が推奨されます。',
  },
  {
    id: 'hiraku-nanra',
    kanji: '何等',
    hiragana: 'なんら',
    category: '副詞・連体詞',
    ruleId: 'adverb',
    description: '副詞の「なんら」はひらがな表記が推奨されます。',
  },
];

export class KanjiHirakuDictionaryEngine {
  private entriesMap = new Map<string, HirakuDictionaryEntry>();
  private disabledRuleIds = new Set<string>();
  private disabledCategories = new Set<HirakuCategory>();
  private disabledKanji = new Set<string>();
  private exclusions = new Set<string>();
  private automaton: AhoCorasickAutomaton<HirakuDictionaryEntry> | null = null;
  private isDirty = true;

  constructor(entries: HirakuDictionaryEntry[] = DEFAULT_HIRAKU_ENTRIES, config?: HirakuFilterConfig) {
    for (const entry of entries) {
      this.entriesMap.set(entry.id, { ...entry });
    }

    if (config) {
      this.setFilterConfig(config);
    }
  }

  public getEntries(): HirakuDictionaryEntry[] {
    return Array.from(this.entriesMap.values());
  }

  public setEntries(entries: HirakuDictionaryEntry[]): void {
    this.entriesMap.clear();
    for (const entry of entries) {
      this.entriesMap.set(entry.id, { ...entry });
    }
    this.isDirty = true;
  }

  public addEntry(entry: HirakuDictionaryEntry): void {
    this.entriesMap.set(entry.id, { ...entry });
    this.isDirty = true;
  }

  public removeEntry(idOrKanji: string): void {
    if (this.entriesMap.has(idOrKanji)) {
      this.entriesMap.delete(idOrKanji);
      this.isDirty = true;
      return;
    }

    for (const [id, entry] of this.entriesMap.entries()) {
      if (entry.kanji === idOrKanji) {
        this.entriesMap.delete(id);
        this.isDirty = true;
      }
    }
  }

  public setRuleEnabled(ruleId: string, enabled: boolean): void {
    if (enabled) {
      this.disabledRuleIds.delete(ruleId);
    } else {
      this.disabledRuleIds.add(ruleId);
    }
    this.isDirty = true;
  }

  public isRuleEnabled(ruleId: string): boolean {
    return !this.disabledRuleIds.has(ruleId);
  }

  public setCategoryEnabled(category: HirakuCategory, enabled: boolean): void {
    if (enabled) {
      this.disabledCategories.delete(category);
    } else {
      this.disabledCategories.add(category);
    }
    this.isDirty = true;
  }

  public isCategoryEnabled(category: HirakuCategory): boolean {
    return !this.disabledCategories.has(category);
  }

  public addExclusion(kanji: string): void {
    this.exclusions.add(kanji);
    this.isDirty = true;
  }

  public removeExclusion(kanji: string): void {
    this.exclusions.delete(kanji);
    this.isDirty = true;
  }

  public isExcluded(kanji: string): boolean {
    return this.exclusions.has(kanji);
  }

  public setFilterConfig(config: HirakuFilterConfig): void {
    this.disabledRuleIds = new Set(config.disabledRuleIds ?? []);
    this.disabledCategories = new Set(config.disabledCategories ?? []);
    this.disabledKanji = new Set(config.disabledKanji ?? []);
    this.exclusions = new Set(config.exclusions ?? []);
    this.isDirty = true;
  }

  public getFilterConfig(): HirakuFilterConfig {
    return {
      disabledRuleIds: Array.from(this.disabledRuleIds),
      disabledCategories: Array.from(this.disabledCategories),
      disabledKanji: Array.from(this.disabledKanji),
      exclusions: Array.from(this.exclusions),
    };
  }

  public getEnabledEntries(): HirakuDictionaryEntry[] {
    const result: HirakuDictionaryEntry[] = [];
    for (const entry of this.entriesMap.values()) {
      if (entry.enabledByDefault === false && !this.disabledRuleIds.has(entry.ruleId)) {
        continue;
      }
      if (this.disabledRuleIds.has(entry.ruleId)) continue;
      if (this.disabledCategories.has(entry.category)) continue;
      if (this.disabledKanji.has(entry.kanji)) continue;
      if (this.exclusions.has(entry.kanji)) continue;

      result.push(entry);
    }
    return result;
  }

  private rebuildAutomaton(): void {
    const enabled = this.getEnabledEntries();
    const automaton = new AhoCorasickAutomaton<HirakuDictionaryEntry>();

    for (const entry of enabled) {
      automaton.addPattern(entry.kanji, entry);
    }

    automaton.build();
    this.automaton = automaton;
    this.isDirty = false;
  }

  /**
   * Scans document for hiraku kanji terms.
   * Skips during active Japanese IME composition to prevent input disruption.
   */
  public lint(
    text: string,
    options?: { isComposing?: boolean; displayMap?: SourceToDisplayMap }
  ): HirakuDiagnostic[] {
    if (options?.isComposing || !text) {
      return [];
    }

    if (this.isDirty || !this.automaton) {
      this.rebuildAutomaton();
    }

    const matches = this.automaton!.search(text);
    const diagnostics: HirakuDiagnostic[] = [];

    for (const match of matches) {
      let from = match.start;
      let to = match.end;

      if (options?.displayMap) {
        from = options.displayMap.toDisplayOffset(from);
        to = options.displayMap.toDisplayOffset(to);
      }

      const entry = match.payload;
      diagnostics.push({
        id: `hiraku-diag-${from}-${to}-${entry.id}`,
        from,
        to,
        severity: 'warning',
        message: `「${entry.kanji}」はひらがな「${entry.hiragana}」でひらくことが推奨されます。`,
        kanji: entry.kanji,
        hiragana: entry.hiragana,
        category: entry.category,
        ruleId: entry.ruleId,
      });
    }

    return diagnostics;
  }
}
