/**
 * Manuscript Metrics Type Definition
 * Represents quantitative text metrics compliant with Japanese publishing standards (Genko Yoshi 400 chars).
 */
export interface ManuscriptMetrics {
  /**
   * Raw total character count including all spaces, newlines, and punctuation.
   */
  rawCharacters: number;

  /**
   * Trimmed character count excluding half-width and full-width whitespaces (\s, \u3000, \n, \r, \t).
   */
  trimmedCharacters: number;

  /**
   * Manuscript sheets count converted to 400-character Genko Yoshi (20 columns x 20 rows).
   */
  genkoSheets: number;

  /**
   * Estimated reading time in minutes based on average Japanese reading speed (~500 chars/min).
   */
  estimatedReadingMinutes: number;
}
