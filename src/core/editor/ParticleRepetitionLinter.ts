/**
 * ParticleRepetitionLinter - Japanese particle repetition (3+ times in sequence within a sentence) detection linter.
 *
 * Scans text for duplicate usage of Japanese case particles (e.g., "の", "に", "で", "が", "を", "と", "へ", "から", "より").
 * Designed for non-modal 3-pane Literature IDE layout with CodeMirror 6 Diagnostic integration.
 */

import type { SourceToDisplayMap } from './AozoraParser.js';
import { SyntacticParticleAuditor } from './SyntacticParticleAuditor.js';

export interface ParticleDiagnostic {
  from: number;
  to: number;
  severity: 'warning' | 'error' | 'info';
  message: string;
  particle: string;
  count: number;
}

export const DEFAULT_TARGET_PARTICLES = [
  'の',
  'に',
  'で',
  'を',
  'が',
  'と',
  'へ',
  'から',
  'より',
  'して',
];

export interface ParticleRepetitionOptions {
  particles?: string[];
  maxThreshold?: number;
  particleThresholds?: Record<string, number>;
}

export class ParticleRepetitionLinterEngine {
  private targetParticles: Set<string>;
  private maxThreshold: number;
  private particleThresholds: Record<string, number>;
  private syntacticAuditor: SyntacticParticleAuditor;

  constructor(particles: string[] = DEFAULT_TARGET_PARTICLES, maxThreshold: number = 3, particleThresholds: Record<string, number> = {}) {
    this.targetParticles = new Set(particles);
    this.maxThreshold = maxThreshold;
    this.particleThresholds = { ...particleThresholds };
    this.syntacticAuditor = new SyntacticParticleAuditor({
      chainThreshold: particleThresholds['の'] ?? maxThreshold,
    });
  }

  /**
   * Sets target particles to monitor.
   */
  public setTargetParticles(particles: string[]): void {
    this.targetParticles = new Set(particles);
  }

  /**
   * Sets custom threshold for a specific particle (e.g. 'の' => 3).
   */
  public setParticleThreshold(particle: string, threshold: number): void {
    this.particleThresholds[particle] = threshold;
    if (particle === 'の') {
      this.syntacticAuditor = new SyntacticParticleAuditor({ chainThreshold: threshold });
    }
  }

  /**
   * Validates if the matched particle occurrence is an actual case/binding particle
   * and not part of a compound word, formal noun, or demonstrative.
   */
  private isValidParticleOccurrence(sentenceText: string, index: number, particle: string): boolean {
    const prevChar = index > 0 ? sentenceText[index - 1] : '';
    const nextChar = index + particle.length < sentenceText.length ? sentenceText[index + particle.length] : '';

    if (particle === 'の') {
      // Exclude formal nouns and compound particles: のみ, ので, のに, のは, のが, のを, のも, のだ, のか, のよ, のね
      const rest = sentenceText.slice(index);
      if (/^の(?:み|で|に|は|が|を|も|だ|か|よ|ね)/.test(rest)) {
        return false;
      }
      // Exclude formal nouns frequently used in literature: のため, の際, のとき, の場合, のよう, のはず, のわけ, の上, の中, の前, の後, の先, の下, の限り, の度
      if (/^の(?:ため|際|さい|とき|場合|ばあい|よう|はず|わけ|上|うえ|中|なか|前|まえ|後|あと|先|さき|下|もと|限り|かぎり|度|たび)/.test(rest)) {
        return false;
      }
      // Exclude words ending in 'の' like 'ものの', 'この', 'その', 'あの', 'どの'
      const prevWord = sentenceText.slice(Math.max(0, index - 2), index + 1);
      if (['この', 'その', 'あの', 'どの', 'もの'].includes(prevWord)) {
        return false;
      }
    } else if (particle === 'が') {
      if (sentenceText.slice(Math.max(0, index - 2), index + 1) === 'および') return false;
      const prevWord = sentenceText.slice(Math.max(0, index - 1), index + 1);
      if (['だが', 'すが'].includes(prevWord)) return false;
    } else if (particle === 'と') {
      // 1. Exclude quoted literals: 「と」, 『と』, "と", 'と'
      if (
        (index > 0 && ['「', '『', '“', '"', '‘', '`'].includes(prevChar)) ||
        (index + 1 < sentenceText.length && ['」', '』', '”', '"', '’', '`'].includes(nextChar))
      ) {
        return false;
      }

      // 2. Exclude nouns starting with 'と' (formal nouns, time, place): とき, ところ, とおり, となり, とちゅう
      const rest = sentenceText.slice(index);
      if (/^と(?:き|ころ|おり|なり|ちゅう)/.test(rest)) {
        return false;
      }

      // 3. Exclude adverbs ending in 'と':
      const before12 = sentenceText.slice(Math.max(0, index - 10), index + particle.length);
      if (
        /ひょっとする?と$/.test(before12) ||
        /(?:きっ|ふ|ふっ|そっ|じっ|やっ|もっ|ずっ|堂々|凛|忽然|パッ|スッ|ハッ|バッ|サッ|じっくり|はっきり|くっきり|ゆったり|しっかりと?|ちゃん|なんと|まったく)と$/.test(before12)
      ) {
        return false;
      }

      // 4. Exclude compound particles and auxiliaries: として, としては, とともに, という, といった, とする, とした
      if (/^と(?:して|ともに|いう|いった|のこと|する|した|みる|みられる)/.test(rest)) {
        return false;
      }

      // 5. Exclude quote/thought verbs: 〜と思う, 〜と考え, 〜と言う
      if (/^と(?:は思|思|は考|考|は言|言|は聞|聞|は感|感)/.test(rest)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Scans input manuscript text for particle repetition.
   * If `isComposing` is true (Japanese IME composition active), skips scanning to prevent editor jitter.
   */
  public lint(
    text: string,
    options?: { isComposing?: boolean; displayMap?: SourceToDisplayMap }
  ): ParticleDiagnostic[] {
    if (options?.isComposing) {
      return [];
    }

    const diagnostics: ParticleDiagnostic[] = [];

    // Split text into sentences by Japanese sentence-ending punctuation (。！？\n)
    const sentenceRegex = /[^。！？\n]+[。！？\n]?/g;
    let sentenceMatch: RegExpExecArray | null;

    while ((sentenceMatch = sentenceRegex.exec(text)) !== null) {
      const sentenceText = sentenceMatch[0];
      const sentenceStart = sentenceMatch.index;

      for (const particle of this.targetParticles) {
        const threshold = this.particleThresholds[particle] ?? this.maxThreshold;

        if (particle === 'の') {
          const chains = this.syntacticAuditor.auditParticleChains(sentenceText, sentenceStart);
          for (const chain of chains) {
            let from = chain.from;
            let to = chain.to;
            if (options?.displayMap) {
              from = options.displayMap.toDisplayOffset(from);
              to = options.displayMap.toDisplayOffset(to);
            }
            diagnostics.push({
              from,
              to,
              severity: 'warning',
              message: `【助詞連続重複】同一助詞「の」が文中に${chain.count}回連続・重複出現しています。表現を見直してください。`,
              particle: 'の',
              count: chain.count,
            });
          }
          continue;
        }

        // Find all occurrences of the particle in this sentence
        const particleMatches: { index: number; text: string }[] = [];
        let pIdx = sentenceText.indexOf(particle);
        while (pIdx !== -1) {
          if (this.isValidParticleOccurrence(sentenceText, pIdx, particle)) {
            particleMatches.push({ index: pIdx, text: particle });
          }
          pIdx = sentenceText.indexOf(particle, pIdx + particle.length);
        }

        if (particleMatches.length >= threshold) {
          const first = particleMatches[0];
          const last = particleMatches[particleMatches.length - 1];

          let from = sentenceStart + first.index;
          let to = sentenceStart + last.index + last.text.length;

          if (options?.displayMap) {
            from = options.displayMap.toDisplayOffset(from);
            to = options.displayMap.toDisplayOffset(to);
          }

          diagnostics.push({
            from,
            to,
            severity: 'warning',
            message: `【助詞連続重複】同一助詞「${particle}」が文中に${particleMatches.length}回連続・重複出現しています。表現を見直してください。`,
            particle,
            count: particleMatches.length,
          });
        }
      }
    }

    // Sort diagnostics by start index
    return diagnostics.sort((a, b) => a.from - b.from);
  }
}

/**
 * Creates CodeMirror 6 Diagnostic decorations for particle repetition warnings.
 */
export function createParticleDiagnostics(
  text: string,
  options?: { isComposing?: boolean; displayMap?: SourceToDisplayMap; engine?: ParticleRepetitionLinterEngine }
): ParticleDiagnostic[] {
  const engine = options?.engine ?? new ParticleRepetitionLinterEngine();
  return engine.lint(text, options);
}
