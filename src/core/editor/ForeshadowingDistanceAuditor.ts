/**
 * ForeshadowingDistanceAuditor
 *
 * Audits distance (character count, chapter count, and in-universe elapsed days)
 * between foreshadowing placement (@plant) and recovery (@payoff / @resolve).
 *
 * Identifies:
 * - Unresolved / neglected foreshadowings exceeding a character threshold (e.g., 20,000 characters).
 * - Premature payoffs recovered too quickly after placement (without sufficient build-up or surprise).
 */

import { ForeshadowingEngine, ForeshadowingItem } from './ForeshadowingEngine.js';

export interface ForeshadowingAuditOptions {
  /**
   * Character distance threshold above which an unresolved foreshadowing is flagged as neglected/abandoned.
   * Default: 20000
   */
  unresolvedCharThreshold?: number;

  /**
   * Minimum character distance required between plant and payoff.
   * If payoff occurs within this character distance, it is flagged as premature.
   * Default: 200
   */
  prematureCharThreshold?: number;

  /**
   * Optional map of chapterId or chapterTitle to in-universe day index/number.
   * e.g., { 'ch-1': 1, 'ch-2': 1, 'ch-3': 5 }
   */
  chapterDayMap?: Record<string, number>;
}

export interface ForeshadowingDistanceMetrics {
  id: string;
  title: string;
  status: 'PLANTED' | 'HINTED' | 'RESOLVED';

  // Plant details
  plantedChapterId: string;
  plantedChapterTitle: string;
  plantedOffset: number;
  plantedLine: number;
  plantedDay?: number;

  // Payoff/Resolve details (if resolved)
  resolvedChapterId?: string;
  resolvedChapterTitle?: string;
  resolvedOffset?: number;
  resolvedLine?: number;
  resolvedDay?: number;

  // Calculated distance metrics
  charDistance: number;
  chapterDistance: number;
  daysElapsed?: number;

  // Status flags
  isUnresolvedAlert: boolean;
  isPrematureWarning: boolean;
}

export type DiagnosticSeverity = 'warning' | 'error' | 'info';

export interface ForeshadowingDiagnostic {
  id: string;
  foreshadowingId: string;
  title: string;
  type: 'UNRESOLVED_NEGLECTED' | 'PREMATURE_PAYOFF' | 'UNRESOLVED_NORMAL';
  severity: DiagnosticSeverity;
  message: string;
  charDistance: number;
  chapterDistance: number;
  daysElapsed?: number;
  plantedOffset: number;
  resolvedOffset?: number;
}

export interface ForeshadowingAuditReport {
  totalCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  neglectedCount: number;
  prematureCount: number;
  metrics: ForeshadowingDistanceMetrics[];
  diagnostics: ForeshadowingDiagnostic[];
}

export interface ChapterInfo {
  id: string;
  title: string;
  index: number;
  line: number;
  startOffset: number;
  day?: number;
}

export class ForeshadowingDistanceAuditor {
  private unresolvedCharThreshold: number;
  private prematureCharThreshold: number;
  private chapterDayMap: Record<string, number>;

  constructor(options: ForeshadowingAuditOptions = {}) {
    this.unresolvedCharThreshold = options.unresolvedCharThreshold ?? 20000;
    this.prematureCharThreshold = options.prematureCharThreshold ?? 200;
    this.chapterDayMap = options.chapterDayMap ?? {};
  }

  /**
   * Audits manuscript text for foreshadowing tag distances and diagnostic alerts.
   */
  public auditText(text: string, options?: ForeshadowingAuditOptions): ForeshadowingAuditReport {
    const unresThresh = options?.unresolvedCharThreshold ?? this.unresolvedCharThreshold;
    const premThresh = options?.prematureCharThreshold ?? this.prematureCharThreshold;
    const dayMap = { ...this.chapterDayMap, ...(options?.chapterDayMap ?? {}) };

    const { items, chapters, manuscriptLength, inlineDays } = this.parseManuscriptWithExtendedTags(text);

    // Merge day map with inline day annotations
    const combinedDayMap: Record<string, number> = { ...dayMap };
    for (const chap of chapters) {
      if (inlineDays[chap.id] !== undefined && combinedDayMap[chap.id] === undefined) {
        combinedDayMap[chap.id] = inlineDays[chap.id];
      }
      if (chap.title && inlineDays[chap.title] !== undefined && combinedDayMap[chap.title] === undefined) {
        combinedDayMap[chap.title] = inlineDays[chap.title];
      }
    }

    return this.auditItemsInternal(items, chapters, manuscriptLength, unresThresh, premThresh, combinedDayMap);
  }

  /**
   * Audits pre-parsed foreshadowing items against manuscript structure or chapter list.
   */
  public auditItems(
    items: ForeshadowingItem[],
    manuscriptLength: number,
    chapters: ChapterInfo[] = [],
    options?: ForeshadowingAuditOptions
  ): ForeshadowingAuditReport {
    const unresThresh = options?.unresolvedCharThreshold ?? this.unresolvedCharThreshold;
    const premThresh = options?.prematureCharThreshold ?? this.prematureCharThreshold;
    const dayMap = { ...this.chapterDayMap, ...(options?.chapterDayMap ?? {}) };

    return this.auditItemsInternal(items, chapters, manuscriptLength, unresThresh, premThresh, dayMap);
  }

  private auditItemsInternal(
    items: ForeshadowingItem[],
    chapters: ChapterInfo[],
    manuscriptLength: number,
    unresThresh: number,
    premThresh: number,
    dayMap: Record<string, number>
  ): ForeshadowingAuditReport {
    const chapterMap = new Map<string, ChapterInfo>();
    chapters.forEach((c) => chapterMap.set(c.id, c));

    const metricsList: ForeshadowingDistanceMetrics[] = [];
    const diagnosticsList: ForeshadowingDiagnostic[] = [];

    let neglectedCount = 0;
    let prematureCount = 0;
    let resolvedCount = 0;
    let unresolvedCount = 0;

    for (const item of items) {
      const isResolved = item.status === 'RESOLVED';
      if (isResolved) {
        resolvedCount++;
      } else {
        unresolvedCount++;
      }

      const plantOffset = item.plantedOffset;
      const resolveOffset = isResolved && item.resolvedOffset !== undefined ? item.resolvedOffset : manuscriptLength;

      // Calculate character distance
      const charDistance = Math.max(0, resolveOffset - plantOffset);

      // Calculate chapter distance
      const plantChapIndex = this.getChapterIndex(item.plantedChapterId, chapters);
      const resolveChapIndex = isResolved && item.resolvedChapterId
        ? this.getChapterIndex(item.resolvedChapterId, chapters)
        : chapters.length > 0 ? chapters.length - 1 : plantChapIndex;
      const chapterDistance = Math.abs(resolveChapIndex - plantChapIndex);

      // In-universe days elapsed
      const plantDay = dayMap[item.plantedChapterId] ?? dayMap[item.plantedChapterTitle];
      const resolveDay = isResolved && item.resolvedChapterId
        ? dayMap[item.resolvedChapterId] ?? (item.resolvedChapterTitle ? dayMap[item.resolvedChapterTitle] : undefined)
        : undefined;

      let daysElapsed: number | undefined;
      if (plantDay !== undefined && resolveDay !== undefined) {
        daysElapsed = Math.max(0, resolveDay - plantDay);
      }

      // Flag checks
      const isUnresolvedAlert = !isResolved && charDistance >= unresThresh;
      const isPrematureWarning = isResolved && charDistance < premThresh;

      if (isUnresolvedAlert) neglectedCount++;
      if (isPrematureWarning) prematureCount++;

      const metric: ForeshadowingDistanceMetrics = {
        id: item.id,
        title: item.title,
        status: item.status,
        plantedChapterId: item.plantedChapterId,
        plantedChapterTitle: item.plantedChapterTitle,
        plantedOffset: item.plantedOffset,
        plantedLine: item.plantedLine,
        plantedDay: plantDay,
        resolvedChapterId: item.resolvedChapterId,
        resolvedChapterTitle: item.resolvedChapterTitle,
        resolvedOffset: item.resolvedOffset,
        resolvedLine: item.resolvedLine,
        resolvedDay: resolveDay,
        charDistance,
        chapterDistance,
        daysElapsed,
        isUnresolvedAlert,
        isPrematureWarning,
      };

      metricsList.push(metric);

      // Create diagnostic objects
      if (isUnresolvedAlert) {
        diagnosticsList.push({
          id: `diag-unresolved-${item.id}`,
          foreshadowingId: item.id,
          title: item.title,
          type: 'UNRESOLVED_NEGLECTED',
          severity: 'warning',
          message: `未回収伏線「${item.title}」: 設置から${charDistance.toLocaleString()}文字経過していますが回収されていません（閾値: ${unresThresh.toLocaleString()}文字）。`,
          charDistance,
          chapterDistance,
          daysElapsed,
          plantedOffset: item.plantedOffset,
        });
      } else if (isPrematureWarning) {
        diagnosticsList.push({
          id: `diag-premature-${item.id}`,
          foreshadowingId: item.id,
          title: item.title,
          type: 'PREMATURE_PAYOFF',
          severity: 'warning',
          message: `回収が早すぎる伏線「${item.title}」: 設置からわずか${charDistance.toLocaleString()}文字（閾値: ${premThresh.toLocaleString()}文字）で回収されており、驚きやサスペンスの醸成が不足している可能性があります。`,
          charDistance,
          chapterDistance,
          daysElapsed,
          plantedOffset: item.plantedOffset,
          resolvedOffset: item.resolvedOffset,
        });
      }
    }

    return {
      totalCount: items.length,
      resolvedCount,
      unresolvedCount,
      neglectedCount,
      prematureCount,
      metrics: metricsList,
      diagnostics: diagnosticsList,
    };
  }

  private getChapterIndex(chapId: string, chapters: ChapterInfo[]): number {
    const idx = chapters.findIndex((c) => c.id === chapId || c.title === chapId);
    if (idx !== -1) return idx;

    // Try extracting numeric chapter ID (e.g. 'ch-2' -> 2)
    const match = chapId.match(/ch-?(\d+)/i);
    if (match) {
      return parseInt(match[1], 10) - 1;
    }
    return 0;
  }

  /**
   * Extended manuscript parsing supporting @plant, @payoff, @resolve, @hint, and @day tags.
   */
  private parseManuscriptWithExtendedTags(text: string): {
    items: ForeshadowingItem[];
    chapters: ChapterInfo[];
    manuscriptLength: number;
    inlineDays: Record<string, number>;
  } {
    const engine = new ForeshadowingEngine();

    // Convert @payoff tags to @resolve tags so ForeshadowingEngine processes them as resolutions
    // Matches @payoff(...) or @payoff: ...
    const normalizedText = text.replace(/@payoff(?=\(|:|\b)/gi, '@resolve');
    const items = engine.parse(normalizedText);

    // Extract chapters and @day annotations
    const lines = text.split('\n');
    const chapters: ChapterInfo[] = [];
    const inlineDays: Record<string, number> = {};

    let currentChapterId = 'ch-1';
    let currentChapterTitle = '第1章';
    let currentOffset = 0;
    let chapterCounter = 0;

    const chapterRegex = /^(?:#+\s*|第\s*([0-9０-９一二三四五六七八九十百]+)\s*[章話節幕]|Chapter\s*([0-9]+))\s*(.*)/i;
    const dayRegex = /@day\((\d+)\)/i;

    chapters.push({
      id: currentChapterId,
      title: currentChapterTitle,
      index: 0,
      line: 1,
      startOffset: 0,
    });

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for inline day marker
      const dayMatch = line.match(dayRegex);
      if (dayMatch) {
        const dayVal = parseInt(dayMatch[1], 10);
        inlineDays[currentChapterId] = dayVal;
        inlineDays[currentChapterTitle] = dayVal;
      }

      // Check chapter header
      const chapMatch = line.match(chapterRegex);
      if (chapMatch) {
        chapterCounter++;
        const chapNum = chapMatch[1] || chapMatch[2] || String(chapterCounter);
        const chapSub = chapMatch[3]?.trim() || '';
        currentChapterId = `ch-${chapNum}`;
        currentChapterTitle = chapSub ? `第${chapNum}章 ${chapSub}` : `第${chapNum}章`;

        if (!chapters.some((c) => c.id === currentChapterId)) {
          const chapInfo: ChapterInfo = {
            id: currentChapterId,
            title: currentChapterTitle,
            index: chapters.length,
            line: lineNumber,
            startOffset: currentOffset,
          };
          chapters.push(chapInfo);

          if (dayMatch) {
            inlineDays[currentChapterId] = parseInt(dayMatch[1], 10);
            inlineDays[currentChapterTitle] = parseInt(dayMatch[1], 10);
          }
        }
      }

      currentOffset += line.length + 1;
    }

    return {
      items,
      chapters,
      manuscriptLength: text.length,
      inlineDays,
    };
  }
}
