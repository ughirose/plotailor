/**
 * EllipsisDashLinter - Even/Odd Parity Linter for Ellipses (……) and Dashes (――)
 *
 * Enforces Japanese typography rules (偶数偶対ルール) in manuscript text.
 * Flags odd-length contiguous sequences (e.g., 1 or 3) and provides QuickFix actions.
 */

import type { SourceToDisplayMap } from './AozoraParser.js';

export interface EllipsisDashDiagnostic {
  from: number;
  to: number;
  severity: 'warning' | 'error' | 'info';
  message: string;
  type: 'ellipsis' | 'dash';
  count: number;
  found: string;
  replacement: string;
}

export class EllipsisDashLinterEngine {
  // Regex to match contiguous sequences of ellipses (… or ‥) or dashes (― or —)
  private static readonly PATTERN = /([…‥]+)|([―—]+)/g;

  /**
   * Scans text for odd-length ellipsis or dash sequences.
   * If isComposing is true (IME active), skips linting to avoid interrupting flow.
   */
  public lint(
    text: string,
    options?: { isComposing?: boolean; displayMap?: SourceToDisplayMap }
  ): EllipsisDashDiagnostic[] {
    if (options?.isComposing) {
      return [];
    }

    const diagnostics: EllipsisDashDiagnostic[] = [];
    const pattern = new RegExp(EllipsisDashLinterEngine.PATTERN.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const found = match[0];
      const count = found.length;

      if (count % 2 !== 0) {
        const isEllipsis = match[1] !== undefined;
        const symbolChar = found[0];
        const type: 'ellipsis' | 'dash' = isEllipsis ? 'ellipsis' : 'dash';
        const replacement = found + symbolChar;

        let from = match.index;
        let to = match.index + count;

        if (options?.displayMap) {
          from = options.displayMap.toDisplayOffset(from);
          to = options.displayMap.toDisplayOffset(to);
        }

        const label = isEllipsis ? '三点リーダー（…）' : 'ダッシュ（―）';
        const message = `${label}は2個単位（偶数対）で使用してください（現在: ${count}個）`;

        diagnostics.push({
          from,
          to,
          severity: 'warning',
          message,
          type,
          count,
          found,
          replacement,
        });
      }
    }

    return diagnostics;
  }

  /**
   * Applies QuickFix for a specific diagnostic on the provided text.
   */
  public applyQuickFix(text: string, diagnostic: EllipsisDashDiagnostic): string {
    return text.substring(0, diagnostic.from) + diagnostic.replacement + text.substring(diagnostic.to);
  }

  /**
   * Automatically corrects all odd-length ellipsis and dash sequences in text to even pairs.
   */
  public fixAll(text: string): string {
    return text.replace(
      new RegExp(EllipsisDashLinterEngine.PATTERN.source, 'g'),
      (match) => (match.length % 2 !== 0 ? match + match[0] : match)
    );
  }
}
