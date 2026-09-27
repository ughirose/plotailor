/**
 * RevisionDiffSummarizer - Engine for analyzing writing history diffs & generating human-readable change previews
 */

export type DiffChangeType = 'unchanged' | 'added' | 'deleted' | 'modified';

export interface InlineDiffToken {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

export interface LineDiffResult {
  type: DiffChangeType;
  oldLineIndex?: number;
  newLineIndex?: number;
  oldLine?: string;
  newLine?: string;
  charDelta: number;
  inlineDiffs?: InlineDiffToken[];
}

export interface DiffStats {
  oldCharCount: number;
  newCharCount: number;
  charDelta: number;
  addedLinesCount: number;
  deletedLinesCount: number;
  modifiedLinesCount: number;
  unchangedLinesCount: number;
}

export interface SummarizerOptions {
  /** Maximum character length of text preview snippet shown in summary. Default: 20 */
  maxSnippetLength?: number;
  /** Label for lines in summary text ('段落' or '行'). Default: '段落' */
  lineLabel?: '段落' | '行';
}

export interface DiffSummary {
  stats: DiffStats;
  lineDiffs: LineDiffResult[];
  lineSummaries: string[];
  summaryText: string;
}

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffItem<T> {
  op: DiffOp;
  oldIndex?: number;
  newIndex?: number;
  val: T;
}

/**
 * Computes Myers diff between two arrays.
 */
export function diffArrays<T>(
  oldArr: T[],
  newArr: T[],
  equals: (a: T, b: T) => boolean = (a, b) => a === b
): DiffItem<T>[] {
  const N = oldArr.length;
  const M = newArr.length;
  const MAX = N + M;

  if (N === 0 && M === 0) return [];
  if (N === 0) {
    return newArr.map((val, idx) => ({ op: 'insert', newIndex: idx, val }));
  }
  if (M === 0) {
    return oldArr.map((val, idx) => ({ op: 'delete', oldIndex: idx, val }));
  }

  const trace: Map<number, number>[] = [];
  let V: Map<number, number> = new Map();
  V.set(1, 0);

  let loopDone = false;
  for (let d = 0; d <= MAX; d++) {
    const vCopy = new Map(V);
    trace.push(vCopy);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (V.get(k - 1) ?? -1) < (V.get(k + 1) ?? -1))) {
        x = V.get(k + 1) ?? 0;
      } else {
        x = (V.get(k - 1) ?? 0) + 1;
      }
      let y = x - k;

      while (x < N && y < M && equals(oldArr[x], newArr[y])) {
        x++;
        y++;
      }
      V.set(k, x);
      if (x >= N && y >= M) {
        loopDone = true;
        break;
      }
    }
    if (loopDone) break;
  }

  let x = N;
  let y = M;
  const result: DiffItem<T>[] = [];

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;

    let prevK: number;
    if (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      result.push({ op: 'equal', oldIndex: x, newIndex: y, val: oldArr[x] });
    }

    if (d > 0) {
      if (x === prevX) {
        y--;
        result.push({ op: 'insert', newIndex: y, val: newArr[y] });
      } else {
        x--;
        result.push({ op: 'delete', oldIndex: x, val: oldArr[x] });
      }
    }
  }

  return result.reverse();
}

/**
 * Computes character/word-level inline diff between two strings.
 */
export function diffInline(oldStr: string, newStr: string): InlineDiffToken[] {
  const oldChars = Array.from(oldStr);
  const newChars = Array.from(newStr);

  const rawDiff = diffArrays(oldChars, newChars);
  const tokens: InlineDiffToken[] = [];

  for (const item of rawDiff) {
    const tokenType: 'equal' | 'insert' | 'delete' = item.op;
    if (tokens.length > 0 && tokens[tokens.length - 1].type === tokenType) {
      tokens[tokens.length - 1].value += item.val;
    } else {
      tokens.push({ type: tokenType, value: item.val });
    }
  }

  return tokens;
}

export class RevisionDiffSummarizer {
  private options: Required<SummarizerOptions>;

  constructor(options?: SummarizerOptions) {
    this.options = {
      maxSnippetLength: options?.maxSnippetLength ?? 20,
      lineLabel: options?.lineLabel ?? '段落',
    };
  }

  /**
   * Helper to truncate string snippet and append ellipsis if needed.
   */
  private truncate(str: string): string {
    const chars = Array.from(str);
    if (chars.length <= this.options.maxSnippetLength) {
      return str;
    }
    return chars.slice(0, this.options.maxSnippetLength).join('') + '…';
  }

  /**
   * Analyzes line-by-line diff between old and new texts.
   */
  public diffLines(oldText: string, newText: string): LineDiffResult[] {
    if (oldText === '' && newText === '') {
      return [];
    }

    const oldLines = oldText === '' ? [] : oldText.split('\n');
    const newLines = newText === '' ? [] : newText.split('\n');

    const rawDiff = diffArrays(oldLines, newLines);
    const lineResults: LineDiffResult[] = [];

    let i = 0;
    while (i < rawDiff.length) {
      const item = rawDiff[i];

      if (item.op === 'equal') {
        lineResults.push({
          type: 'unchanged',
          oldLineIndex: item.oldIndex,
          newLineIndex: item.newIndex,
          oldLine: item.val,
          newLine: item.val,
          charDelta: 0,
        });
        i++;
        continue;
      }

      // Collect contiguous deletes and inserts
      const deletes: DiffItem<string>[] = [];
      const inserts: DiffItem<string>[] = [];

      while (i < rawDiff.length && (rawDiff[i].op === 'delete' || rawDiff[i].op === 'insert')) {
        if (rawDiff[i].op === 'delete') {
          deletes.push(rawDiff[i]);
        } else {
          inserts.push(rawDiff[i]);
        }
        i++;
      }

      // Pair up deletes and inserts as modified lines
      const pairsCount = Math.min(deletes.length, inserts.length);

      for (let p = 0; p < pairsCount; p++) {
        const delItem = deletes[p];
        const insItem = inserts[p];
        const oldLine = delItem.val;
        const newLine = insItem.val;
        const oldLen = Array.from(oldLine).length;
        const newLen = Array.from(newLine).length;

        lineResults.push({
          type: 'modified',
          oldLineIndex: delItem.oldIndex,
          newLineIndex: insItem.newIndex,
          oldLine,
          newLine,
          charDelta: newLen - oldLen,
          inlineDiffs: diffInline(oldLine, newLine),
        });
      }

      // Excess deletes
      for (let d = pairsCount; d < deletes.length; d++) {
        const delItem = deletes[d];
        const oldLine = delItem.val;
        const oldLen = Array.from(oldLine).length;

        lineResults.push({
          type: 'deleted',
          oldLineIndex: delItem.oldIndex,
          oldLine,
          charDelta: -oldLen,
        });
      }

      // Excess inserts
      for (let ins = pairsCount; ins < inserts.length; ins++) {
        const insItem = inserts[ins];
        const newLine = insItem.val;
        const newLen = Array.from(newLine).length;

        lineResults.push({
          type: 'added',
          newLineIndex: insItem.newIndex,
          newLine,
          charDelta: newLen,
        });
      }
    }

    return lineResults;
  }

  /**
   * Computes character and line statistics.
   */
  public getStats(oldText: string, newText: string, lineDiffs?: LineDiffResult[]): DiffStats {
    const diffs = lineDiffs ?? this.diffLines(oldText, newText);

    const oldCharCount = Array.from(oldText).length;
    const newCharCount = Array.from(newText).length;

    let addedLinesCount = 0;
    let deletedLinesCount = 0;
    let modifiedLinesCount = 0;
    let unchangedLinesCount = 0;

    for (const diff of diffs) {
      switch (diff.type) {
        case 'added':
          addedLinesCount++;
          break;
        case 'deleted':
          deletedLinesCount++;
          break;
        case 'modified':
          modifiedLinesCount++;
          break;
        case 'unchanged':
          unchangedLinesCount++;
          break;
      }
    }

    return {
      oldCharCount,
      newCharCount,
      charDelta: newCharCount - oldCharCount,
      addedLinesCount,
      deletedLinesCount,
      modifiedLinesCount,
      unchangedLinesCount,
    };
  }

  /**
   * Generates complete diff summary with stats and human-readable text.
   */
  public summarize(oldText: string, newText: string): DiffSummary {
    const lineDiffs = this.diffLines(oldText, newText);
    const stats = this.getStats(oldText, newText, lineDiffs);

    const lineSummaries: string[] = [];
    const label = this.options.lineLabel;

    for (const diff of lineDiffs) {
      if (diff.type === 'unchanged') continue;

      const deltaFormatted = diff.charDelta > 0 ? `+${diff.charDelta}` : diff.charDelta === 0 ? '±0' : `${diff.charDelta}`;

      if (diff.type === 'modified') {
        const lineNum = (diff.newLineIndex ?? diff.oldLineIndex ?? 0) + 1;
        const truncOld = this.truncate(diff.oldLine ?? '');
        const truncNew = this.truncate(diff.newLine ?? '');
        lineSummaries.push(`第${lineNum}${label}修正: ${deltaFormatted}字 / 『${truncOld}』→『${truncNew}』`);
      } else if (diff.type === 'added') {
        const lineNum = (diff.newLineIndex ?? 0) + 1;
        const truncNew = this.truncate(diff.newLine ?? '');
        lineSummaries.push(`第${lineNum}${label}追加: ${deltaFormatted}字 / 『${truncNew}』`);
      } else if (diff.type === 'deleted') {
        const lineNum = (diff.oldLineIndex ?? 0) + 1;
        const truncOld = this.truncate(diff.oldLine ?? '');
        lineSummaries.push(`第${lineNum}${label}削除: ${deltaFormatted}字 / 『${truncOld}』`);
      }
    }

    const deltaStr = stats.charDelta > 0 ? `+${stats.charDelta}字` : stats.charDelta === 0 ? '±0字' : `${stats.charDelta}字`;

    let summaryText = '';
    if (lineSummaries.length === 0) {
      summaryText = `【執筆履歴 差分要約】\n差分はありません（全 ${stats.oldCharCount} 字）。`;
    } else {
      const header = `【執筆履歴 差分要約】\n` +
        `文字数: ${stats.oldCharCount}字 → ${stats.newCharCount}字 (${deltaStr}) | ` +
        `追加: ${stats.addedLinesCount}${label} / 削除: ${stats.deletedLinesCount}${label} / 修正: ${stats.modifiedLinesCount}${label}`;

      const body = lineSummaries.map(s => `・${s}`).join('\n');
      summaryText = `${header}\n${body}`;
    }

    return {
      stats,
      lineDiffs,
      lineSummaries,
      summaryText,
    };
  }

  /**
   * Static helper for one-shot summary generation.
   */
  public static summarize(oldText: string, newText: string, options?: SummarizerOptions): DiffSummary {
    return new RevisionDiffSummarizer(options).summarize(oldText, newText);
  }
}
