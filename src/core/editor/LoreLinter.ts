/**
 * LoreLinter - High-performance lore and terminology consistency linter for Plotailor IDE
 * 
 * Powered by Aho-Corasick automaton for O(N + M) scanning of long manuscripts (100k+ characters).
 * Includes IME composition protection and QuickFix replacement actions.
 * Promoted and enhanced from Gemini Chat prototype asset: cm6_lore_linter.ts
 */

import { AhoCorasickAutomaton } from '../nlp/AhoCorasickAutomaton.js';
import type { SourceToDisplayMap } from './AozoraParser.js';

export interface TermRegulation {
  canonical: string;
  forbidden: string[];
  category: string;
}

export interface LoreDiagnostic {
  from: number;
  to: number;
  severity: 'warning' | 'error' | 'info';
  message: string;
  canonical: string;
  wrongTerm: string;
  category: string;
}

export class LoreLinterEngine {
  private automaton = new AhoCorasickAutomaton<{ canonical: string; wrongTerm: string; category: string }>();
  private regulations: TermRegulation[] = [];

  constructor(regulations: TermRegulation[] = []) {
    this.setRegulations(regulations);
  }

  public setRegulations(regulations: TermRegulation[]): void {
    this.regulations = regulations;
    this.automaton = new AhoCorasickAutomaton();

    for (const reg of regulations) {
      for (const wrong of reg.forbidden) {
        this.automaton.addPattern(wrong, {
          canonical: reg.canonical,
          wrongTerm: wrong,
          category: reg.category,
        });
      }
    }

    this.automaton.build();
  }

  /**
   * Scans text for lore terminology violations in linear time.
   * If isComposing is true (IME input active), skips linting to prevent jitter.
   */
  public lint(
    text: string,
    options?: { isComposing?: boolean; displayMap?: SourceToDisplayMap }
  ): LoreDiagnostic[] {
    if (options?.isComposing) {
      return [];
    }

    const matches = this.automaton.search(text);
    const diagnostics: LoreDiagnostic[] = [];

    for (const match of matches) {
      let from = match.start;
      let to = match.end;

      if (options?.displayMap) {
        from = options.displayMap.toDisplayOffset(from);
        to = options.displayMap.toDisplayOffset(to);
      }

      diagnostics.push({
        from,
        to,
        severity: 'warning',
        message: `【表記ゆれ】設定正式名称は「${match.payload.canonical}」です（現在: ${match.payload.wrongTerm}）`,
        canonical: match.payload.canonical,
        wrongTerm: match.payload.wrongTerm,
        category: match.payload.category,
      });
    }

    return diagnostics;
  }
}
