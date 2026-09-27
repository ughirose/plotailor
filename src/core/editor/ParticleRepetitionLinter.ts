/**
 * ParticleRepetitionLinter - Japanese particle repetition (3+ times in sequence within a sentence) detection linter.
 *
 * Scans text for duplicate usage of Japanese case particles (e.g., "の", "に", "で", "が", "を", "と", "へ", "から", "より").
 * Designed for non-modal 3-pane Literature IDE layout with CodeMirror 6 Diagnostic integration.
 */

import type { SourceToDisplayMap } from './AozoraParser.js';

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

export class ParticleRepetitionLinterEngine {
  private targetParticles: Set<string>;
  private maxThreshold: number;

  constructor(particles: string[] = DEFAULT_TARGET_PARTICLES, maxThreshold: number = 3) {
    this.targetParticles = new Set(particles);
    this.maxThreshold = maxThreshold;
  }

  /**
   * Sets target particles to monitor.
   */
  public setTargetParticles(particles: string[]): void {
    this.targetParticles = new Set(particles);
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
        // Find all occurrences of the particle in this sentence
        const particleMatches: { index: number; text: string }[] = [];
        let pIdx = sentenceText.indexOf(particle);
        while (pIdx !== -1) {
          particleMatches.push({ index: pIdx, text: particle });
          pIdx = sentenceText.indexOf(particle, pIdx + particle.length);
        }

        if (particleMatches.length >= this.maxThreshold) {
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
