/**
 * SyntacticParticleAuditor - Syntactic depth and clause-boundary auditor for Japanese particles.
 * 
 * Specifically addresses false positives with particle "の" by evaluating:
 * 1. Noun Phrase (NP) modifier chain depth ("名詞＋の＋名詞"連鎖深度)
 * 2. Case particles (は, が, を, に, で, へ, etc.) breaking noun phrases into separate arguments
 * 3. Clause boundaries (読点 '、' resets or attenuates consecutive modifier chain)
 * 4. Subject-case "の" preceding adnominal verb/adjective predicates (格助詞「が」置換可能な主格の「の」)
 * 5. Exhaustive formal noun, spatial noun, and idiomatic phrase exclusions.
 */

export interface SyntacticParticleChain {
  particle: string;
  count: number;
  from: number;
  to: number;
  chainText: string;
  reason: string;
}

export interface SyntacticAuditorOptions {
  chainThreshold?: number; // Default 3 (3+ consecutive chained "の" in a single NP modifier chain)
}

// Formal nouns and spatial noun patterns following "の"
const FORMAL_NOUN_PATTERNS = [
  'ため', '為',
  '際', 'さい',
  'とき', '時',
  '場合', 'ばあい',
  'よう', '様',
  'はず', '筈',
  'わけ', '訳',
  '上', 'うえ',
  '中', 'なか',
  '前', 'まえ',
  '後', 'あと', 'のち',
  '先', 'さき',
  '下', 'もと', 'した',
  '外', 'そと',
  '奥', 'おく',
  '横', 'よこ',
  '隣', 'となり',
  '脇', 'わき',
  '側', 'そば', 'がわ',
  '間', 'あいだ',
  '限り', 'かぎり',
  '度', 'たび',
  'こと', '事',
  'もの', '物', '者',
  '通り', 'とおり',
  'まま',
  '代わり', 'かわり',
  'ほか', '他',
  '内', 'うち',
  '末', 'すえ',
  'ところ', '所',
  'せい', '所為',
  'おかげ', '御蔭',
];

const FORMAL_NOUN_REGEX = new RegExp(
  `^の(?:${FORMAL_NOUN_PATTERNS.join('|')})(?:[、。！？\\s]|(?:[がはをもとにでへからより]|$))`
);

// Compound particles or auxiliaries starting with "の"
const COMPOUND_PARTICLE_REGEX = /^の(?:み|で|に|は|が|を|も|だ|か|よ|ね|さ|ぞ|な|なら|らしい|です)/;

// Words ending in "の" that are pronouns, adnominals or nouns
const PRONOUN_ADNOMINAL_WORDS = new Set(['この', 'その', 'あの', 'どの', 'ほんの', 'もの', 'きのう', 'かの']);

// Case particles and phrase boundaries that break a single noun phrase chain
const NP_BREAK_REGEX = /[はがをもにでへからより、\s]/;

export class SyntacticParticleAuditor {
  private chainThreshold: number;

  constructor(options?: SyntacticAuditorOptions) {
    this.chainThreshold = options?.chainThreshold ?? 3;
  }

  /**
   * Determines if "の" at index in text is a valid adnominal modifier particle
   * (連体修飾の「の」), strictly excluding formal nouns, compounds, and subject-case "の".
   */
  public isValidModifierOccurrence(sentenceText: string, index: number): boolean {
    const rest = sentenceText.slice(index);

    // 1. Exclude compound particles and auxiliaries (ので, のに, のは, のが, のだ, etc.)
    if (COMPOUND_PARTICLE_REGEX.test(rest)) {
      return false;
    }

    // 2. Exclude formal nouns and spatial relation nouns (のため, の際, のこと, の通り, の外, etc.)
    if (FORMAL_NOUN_REGEX.test(rest)) {
      return false;
    }

    // 3. Exclude words ending in 'の' (この, その, あの, どの, ほんの)
    const prevTwo = sentenceText.slice(Math.max(0, index - 2), index + 1);
    if (PRONOUN_ADNOMINAL_WORDS.has(prevTwo)) {
      return false;
    }
    const prevOne = sentenceText.slice(Math.max(0, index - 1), index + 1);
    if (PRONOUN_ADNOMINAL_WORDS.has(prevOne)) {
      return false;
    }

    // 4. Exclude subject-case "の" in relative/adnominal clauses preceding predicates
    // e.g., 「彼の言った」「雪の降る」「空の青い」
    if (this.isSubjectCaseInRelativeClause(sentenceText, index)) {
      return false;
    }

    return true;
  }

  /**
   * Detects whether "の" is used as subject marker in a relative clause (主格の「の」).
   */
  private isSubjectCaseInRelativeClause(sentenceText: string, index: number): boolean {
    const after = sentenceText.slice(index + 1);
    // Typical pattern: [動詞・用言の連体形]
    // e.g. 言った通り, 降る夜, 去った後, 祈る声, 澄んだ空, 青い海
    const match = /^([^\s、。！？]{1,8}?)(?:[るいたないぬ])(?=[\u4E00-\u9FFF\u3040-\u309F])/u.exec(after);
    if (match) {
      const verbStem = match[0];
      if (/(?:言っ|いっ|思っ|知っ|降っ|降る|去っ|去る|咲い|咲く|泣い|泣く|輝い|輝く|散っ|散る|澄ん|澄む|眠っ|眠る|生き|生きる|死ん|死ぬ|晴れ|晴れる|凍っ|凍る|見つめ|見え|聞こえ)/.test(verbStem)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if the span between two occurrences of 'の' contains a case marker or boundary
   * that breaks a single noun phrase chain.
   */
  private hasCaseParticleBreak(spanBetween: string): boolean {
    // Strip Aozora ruby tags and formatting markers
    const cleanSpan = spanBetween.replace(/《[^》]*》/g, '').replace(/[｜|]/g, '');

    // Whitespace, dashes, or punctuation breaks noun phrases
    if (/[\s、――──――…\.\,\(\)「」『』（）\<\>《》【】:;：；]/.test(cleanSpan)) {
      return true;
    }

    // Explicit case particle (が, を, は, に, で, へ, と, から, より, も) between nominal blocks
    // e.g. 「月明かりが部屋」「神話の時代に古」 -> breaks the noun phrase chain
    if (/(?:[\u4E00-\u9FFF\u30A0-\u30FF\u3040-\u309F]+?)(?:が|を|は|に|で|へ|と|から|より|も)(?=[\u4E00-\u9FFF\u30A0-\u30FF])/u.test(cleanSpan)) {
      return true;
    }

    return false;
  }

  /**
   * Audits text for unnatural particle "の" chains.
   * Splits clauses by punctuation (、), dashes (――), and brackets, and evaluates consecutive modifier chain depth.
   * Intervening case markers (は, が, を, に, で, へ, と, から...) break the modifier chain.
   */
  public auditParticleChains(sentenceText: string, sentenceOffset: number = 0): SyntacticParticleChain[] {
    const chains: SyntacticParticleChain[] = [];

    // Split sentence into clauses by punctuation (、), dashes (――/──), quotes, and brackets
    const clauseRegex = /[^、――──「」『』（）…：；\n]+(?:[、――──「」『』（）…：；\n]|$)/g;
    let clauseMatch: RegExpExecArray | null;

    while ((clauseMatch = clauseRegex.exec(sentenceText)) !== null) {
      const clauseText = clauseMatch[0];
      const clauseStart = sentenceOffset + clauseMatch.index;

      const occurrences: number[] = [];
      let pIdx = clauseText.indexOf('の');

      while (pIdx !== -1) {
        if (this.isValidModifierOccurrence(clauseText, pIdx)) {
          occurrences.push(pIdx);
        }
        pIdx = clauseText.indexOf('の', pIdx + 1);
      }

      if (occurrences.length === 0) continue;

      // Group occurrences into contiguous Noun Phrase chains
      // An NP chain is broken if any case particle or predicate intervening between p[i] and p[i+1]
      let currentChain: number[] = [occurrences[0]];

      for (let i = 1; i < occurrences.length; i++) {
        const prevIdx = occurrences[i - 1];
        const nextIdx = occurrences[i];
        const spanBetween = clauseText.slice(prevIdx + 1, nextIdx);

        if (this.hasCaseParticleBreak(spanBetween)) {
          if (currentChain.length >= this.chainThreshold) {
            this.pushChain(chains, clauseText, clauseStart, currentChain);
          }
          currentChain = [nextIdx];
        } else {
          currentChain.push(nextIdx);
        }
      }

      if (currentChain.length >= this.chainThreshold) {
        this.pushChain(chains, clauseText, clauseStart, currentChain);
      }
    }

    return chains;
  }

  private pushChain(
    chains: SyntacticParticleChain[],
    clauseText: string,
    clauseStart: number,
    chainIndices: number[]
  ): void {
    const firstIdx = chainIndices[0];
    const lastIdx = chainIndices[chainIndices.length - 1];

    chains.push({
      particle: 'の',
      count: chainIndices.length,
      from: clauseStart + firstIdx,
      to: clauseStart + lastIdx + 1,
      chainText: clauseText.slice(firstIdx, lastIdx + 1),
      reason: `同一名詞句内において連体修飾の「の」が${chainIndices.length}回連続連鎖（深度${chainIndices.length}）しています。名詞句の構造を整理してください。`,
    });
  }
}
