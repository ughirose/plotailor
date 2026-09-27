/**
 * RevisionGranularityManager - Writing History Granularity Categorization & Decimation Manager
 *
 * Classifies writing snapshots into three granularity levels:
 * - Fine (細粒度): 1-line or keystroke-level entries
 * - Medium (中粒度): Timer-driven auto-saves
 * - Coarse (粗粒度): Explicit manual saves, milestones, chapter completions
 *
 * Provides history filtering and downsampling (decimation) algorithms for UI rendering.
 */

export type RevisionGranularity = 'fine' | 'medium' | 'coarse';

export interface RevisionSnapshotInput {
  id?: string;
  timestamp: number;
  content: string;
  authorId?: string;
  metadata?: Record<string, unknown>;
  granularity?: RevisionGranularity;
  trigger?: 'keystroke' | 'line' | 'timer' | 'manual' | 'milestone' | string;
  label?: string;
}

export interface TaggedRevisionSnapshot {
  id: string;
  timestamp: number;
  content: string;
  authorId: string;
  metadata: Record<string, unknown>;
  granularity: RevisionGranularity;
  trigger: string;
  label?: string;
  charCount: number;
  lineCount: number;
}

export interface DecimationOptions {
  /** Maximum total snapshots to retain after decimation */
  maxCount?: number;
  /** Minimum time interval between kept fine snapshots in ms (e.g. 60000 = 1 min) */
  timeIntervalMs?: number;
  /** Unconditionally preserve coarse (milestone / explicit save) snapshots. Default: true */
  preserveCoarse?: boolean;
  /** Unconditionally preserve medium (auto-save) snapshots. Default: false */
  preserveMedium?: boolean;
  /** Strategy for downsampling fine snapshots. Default: 'interval' */
  fineDownsampleStrategy?: 'uniform' | 'interval' | 'none';
  /** Minimum character difference from previous snapshot to retain a fine snapshot */
  minCharDiff?: number;
}

export interface GranularitySummaryStats {
  total: number;
  fineCount: number;
  mediumCount: number;
  coarseCount: number;
  earliestTimestamp: number | null;
  latestTimestamp: number | null;
}

export class RevisionGranularityManager {
  private snapshots: TaggedRevisionSnapshot[] = [];
  private defaultAuthorId: string;
  private autoSort: boolean;

  constructor(options?: { defaultAuthorId?: string; autoSort?: boolean }) {
    this.defaultAuthorId = options?.defaultAuthorId ?? 'local-author';
    this.autoSort = options?.autoSort ?? true;
  }

  /**
   * Classifies a snapshot input into fine, medium, or coarse granularity.
   */
  public classify(
    input: RevisionSnapshotInput,
    previousSnapshot?: TaggedRevisionSnapshot
  ): RevisionGranularity {
    // 1. Explicit granularity override
    if (input.granularity) {
      return input.granularity;
    }

    // 2. Trigger string inspection
    if (input.trigger) {
      const tr = input.trigger.toLowerCase();
      if (['keystroke', 'line', 'fine', 'input', 'line-edit', 'character'].includes(tr)) {
        return 'fine';
      }
      if (['timer', 'auto-save', 'autosave', 'medium', 'interval', 'background'].includes(tr)) {
        return 'medium';
      }
      if (['manual', 'milestone', 'coarse', 'explicit', 'save', 'chapter', 'commit'].includes(tr)) {
        return 'coarse';
      }
    }

    // 3. Metadata inspection
    if (input.metadata) {
      if (input.metadata.isMilestone === true || input.metadata.explicitSave === true) {
        return 'coarse';
      }
      if (input.metadata.isAutoSave === true || input.metadata.timerTriggered === true) {
        return 'medium';
      }
      if (input.metadata.isLineInput === true) {
        return 'fine';
      }
    }

    // 4. Label inspection
    if (input.label) {
      const lbl = input.label.toLowerCase();
      if (lbl.includes('milestone') || lbl.includes('v1.') || lbl.includes('chapter') || lbl.includes('manual')) {
        return 'coarse';
      }
      if (lbl.includes('auto') || lbl.includes('timer')) {
        return 'medium';
      }
    }

    // 5. Difference heuristics against previous snapshot
    if (previousSnapshot) {
      const timeDiffMs = Math.abs(input.timestamp - previousSnapshot.timestamp);
      const charDiff = Math.abs(input.content.length - previousSnapshot.content.length);

      // Rapid entry (< 15 seconds) with small char diff -> fine
      if (timeDiffMs < 15000) {
        return 'fine';
      }

      // Medium time interval (15s to 300s) -> medium
      if (timeDiffMs <= 300000) {
        return 'medium';
      }

      // Very long pause or major diff (> 300s) -> coarse
      return 'coarse';
    }

    // Default fallback
    return 'fine';
  }

  /**
   * Adds and tags a single revision snapshot.
   */
  public addSnapshot(input: RevisionSnapshotInput): TaggedRevisionSnapshot {
    const prev = this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : undefined;
    const granularity = this.classify(input, prev);

    const lines = input.content.split('\n');
    const tagged: TaggedRevisionSnapshot = {
      id: input.id ?? `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: input.timestamp,
      content: input.content,
      authorId: input.authorId ?? this.defaultAuthorId,
      metadata: input.metadata ?? {},
      granularity,
      trigger: input.trigger ?? granularity,
      label: input.label,
      charCount: input.content.length,
      lineCount: lines.length,
    };

    this.snapshots.push(tagged);

    if (this.autoSort) {
      this.sortSnapshots();
    }

    return tagged;
  }

  /**
   * Adds multiple snapshot inputs.
   */
  public addSnapshots(inputs: RevisionSnapshotInput[]): TaggedRevisionSnapshot[] {
    return inputs.map((input) => this.addSnapshot(input));
  }

  /**
   * Returns all stored snapshots chronologically.
   */
  public getSnapshots(): TaggedRevisionSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Filters snapshots by granularity level(s).
   */
  public getSnapshotsByGranularity(
    granularity: RevisionGranularity | RevisionGranularity[]
  ): TaggedRevisionSnapshot[] {
    const levels = Array.isArray(granularity) ? granularity : [granularity];
    return this.snapshots.filter((s) => levels.includes(s.granularity));
  }

  /**
   * Custom filter predicate.
   */
  public filter(predicate: (snapshot: TaggedRevisionSnapshot) => boolean): TaggedRevisionSnapshot[] {
    return this.snapshots.filter(predicate);
  }

  /**
   * Filters snapshots within a timestamp range [startTime, endTime].
   */
  public filterByTimeRange(startTime: number, endTime: number): TaggedRevisionSnapshot[] {
    return this.snapshots.filter((s) => s.timestamp >= startTime && s.timestamp <= endTime);
  }

  /**
   * Filters snapshots by author ID.
   */
  public filterByAuthor(authorId: string): TaggedRevisionSnapshot[] {
    return this.snapshots.filter((s) => s.authorId === authorId);
  }

  /**
   * Performs snapshot decimation (downsampling) to reduce UI density while preserving milestone integrity.
   */
  public decimateSnapshots(options?: DecimationOptions): TaggedRevisionSnapshot[] {
    return RevisionGranularityManager.decimateList(this.snapshots, options);
  }

  /**
   * Static utility to decimate any list of tagged snapshots.
   */
  public static decimateList(
    snapshots: TaggedRevisionSnapshot[],
    options?: DecimationOptions
  ): TaggedRevisionSnapshot[] {
    if (snapshots.length === 0) return [];

    const preserveCoarse = options?.preserveCoarse ?? true;
    const preserveMedium = options?.preserveMedium ?? false;
    const timeIntervalMs = options?.timeIntervalMs ?? 0;
    const minCharDiff = options?.minCharDiff ?? 0;
    const maxCount = options?.maxCount;
    const fineStrategy = options?.fineDownsampleStrategy ?? 'interval';

    // Ensure sorted order
    const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);

    const result: TaggedRevisionSnapshot[] = [];
    let lastKeptFine: TaggedRevisionSnapshot | null = null;
    let lastKeptContent = '';

    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];

      // Always keep coarse if preserveCoarse is enabled
      if (curr.granularity === 'coarse' && preserveCoarse) {
        result.push(curr);
        lastKeptContent = curr.content;
        continue;
      }

      // Always keep medium if preserveMedium is enabled
      if (curr.granularity === 'medium' && preserveMedium) {
        result.push(curr);
        lastKeptContent = curr.content;
        continue;
      }

      // Downsampling logic for fine (and unpreserved medium/coarse)
      let keep = true;

      if (fineStrategy === 'interval' && timeIntervalMs > 0 && lastKeptFine) {
        if (curr.timestamp - lastKeptFine.timestamp < timeIntervalMs) {
          keep = false;
        }
      }

      if (keep && minCharDiff > 0 && lastKeptContent !== '') {
        const charDiff = Math.abs(curr.content.length - lastKeptContent.length);
        if (charDiff < minCharDiff) {
          keep = false;
        }
      }

      // Keep boundary snapshots (first and last)
      if (i === 0 || i === sorted.length - 1) {
        keep = true;
      }

      if (keep) {
        result.push(curr);
        if (curr.granularity === 'fine') {
          lastKeptFine = curr;
        }
        lastKeptContent = curr.content;
      }
    }

    // Deduplicate result while maintaining chronological order
    const uniqueResult = Array.from(new Set(result)).sort((a, b) => a.timestamp - b.timestamp);

    // Apply maxCount step uniform downsampling if total still exceeds maxCount
    if (maxCount && maxCount > 0 && uniqueResult.length > maxCount) {
      if (fineStrategy === 'uniform' || maxCount < uniqueResult.length) {
        const finalSnapshots: TaggedRevisionSnapshot[] = [];
        const mustKeep = uniqueResult.filter((s) => s.granularity === 'coarse' && preserveCoarse);

        // Always include coarse ones + step through others to hit maxCount
        const step = (uniqueResult.length - 1) / Math.max(1, maxCount - 1);
        for (let j = 0; j < maxCount; j++) {
          const index = Math.min(uniqueResult.length - 1, Math.round(j * step));
          finalSnapshots.push(uniqueResult[index]);
        }

        // Add any missing coarse milestones
        for (const coarse of mustKeep) {
          if (!finalSnapshots.some((s) => s.id === coarse.id)) {
            finalSnapshots.push(coarse);
          }
        }

        return Array.from(new Set(finalSnapshots)).sort((a, b) => a.timestamp - b.timestamp);
      }
    }

    return uniqueResult;
  }

  /**
   * Returns summary statistics of current snapshots.
   */
  public getSummaryStats(): GranularitySummaryStats {
    let fineCount = 0;
    let mediumCount = 0;
    let coarseCount = 0;
    let earliest: number | null = null;
    let latest: number | null = null;

    for (const s of this.snapshots) {
      if (s.granularity === 'fine') fineCount++;
      else if (s.granularity === 'medium') mediumCount++;
      else if (s.granularity === 'coarse') coarseCount++;

      if (earliest === null || s.timestamp < earliest) earliest = s.timestamp;
      if (latest === null || s.timestamp > latest) latest = s.timestamp;
    }

    return {
      total: this.snapshots.length,
      fineCount,
      mediumCount,
      coarseCount,
      earliestTimestamp: earliest,
      latestTimestamp: latest,
    };
  }

  /**
   * Clears all stored snapshots.
   */
  public clear(): void {
    this.snapshots = [];
  }

  private sortSnapshots(): void {
    this.snapshots.sort((a, b) => a.timestamp - b.timestamp);
  }
}
