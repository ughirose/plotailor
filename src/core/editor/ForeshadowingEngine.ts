/**
 * ForeshadowingEngine - Chapter-based Foreshadowing Aggregation & Tracking Engine
 *
 * Scans manuscript text or structured manifests for foreshadowing tags (@plant, @hint, @resolve)
 * and chapter boundaries, aggregating progress and tracking unresolved items.
 */

export type ForeshadowingTagType = 'plant' | 'hint' | 'resolve';

export interface ForeshadowingTag {
  type: ForeshadowingTagType;
  id: string;
  title?: string;
  chapterId: string;
  chapterTitle: string;
  lineNumber: number;
  charOffset: number;
  description?: string;
}

export type ForeshadowingStatus = 'PLANTED' | 'HINTED' | 'RESOLVED';

export interface ForeshadowingItem {
  id: string;
  title: string;
  status: ForeshadowingStatus;
  plantedChapterId: string;
  plantedChapterTitle: string;
  plantedLine: number;
  plantedOffset: number;
  description?: string;
  hints: Array<{
    chapterId: string;
    chapterTitle: string;
    line: number;
    offset: number;
    description?: string;
  }>;
  resolvedChapterId?: string;
  resolvedChapterTitle?: string;
  resolvedLine?: number;
  resolvedOffset?: number;
  resolvedNote?: string;
}

export interface ChapterProgress {
  chapterId: string;
  chapterTitle: string;
  plantedCount: number;
  resolvedCount: number;
  progressPercentage: number;
  unresolvedCount: number;
  unresolvedIds: string[];
}

export interface OverallForeshadowingProgress {
  totalPlanted: number;
  totalResolved: number;
  totalUnresolved: number;
  overallProgressPercentage: number;
  chapterProgresses: ChapterProgress[];
}

export interface ForeshadowingJumpTarget {
  foreshadowingId: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  lineNumber: number;
  charOffset: number;
  tagType: ForeshadowingTagType;
}

export class ForeshadowingEngine {
  private rawText: string = '';
  private items: Map<string, ForeshadowingItem> = new Map();
  private chapterList: Array<{ id: string; title: string; line: number }> = [];

  constructor(text?: string) {
    if (text) {
      this.parseManuscript(text);
    }
  }

  /**
   * Parses manuscript text to extract chapters and foreshadowing tags (@plant, @hint, @resolve).
   */
  public parseManuscript(text: string): ForeshadowingItem[] {
    this.rawText = text;
    this.items.clear();
    this.chapterList = [];

    const lines = text.split('\n');
    let currentChapterId = 'ch-1';
    let currentChapterTitle = '第1章';
    let currentOffset = 0;

    // Default first chapter
    this.chapterList.push({ id: currentChapterId, title: currentChapterTitle, line: 1 });

    const chapterRegex = /^(?:#+\s*|第\s*([0-9０-９一二三四五六七八九十百]+)\s*[章話節幕]|Chapter\s*([0-9]+))\s*(.*)/i;
    // Tag regex for @plant, @hint, @resolve
    // Matches @plant(id, "title"), @plant(id), @plant: id "title", @plant: id
    const tagRegex = /@(plant|hint|resolve)(?:\(\s*([a-zA-Z0-9_-]+)(?:\s*,\s*(?:"([^"]*)"|'([^']*)'|([^)]+)))?\s*\)|:\s*([a-zA-Z0-9_-]+)(?:\s+(?:"([^"]*)"|'([^']*)'|([^\n]+)))?)/gi;

    let chapterCounter = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check chapter header
      const chapMatch = line.match(chapterRegex);
      if (chapMatch) {
        chapterCounter++;
        const chapNum = chapMatch[1] || chapMatch[2] || String(chapterCounter);
        const chapSub = chapMatch[3]?.trim() || '';
        currentChapterId = `ch-${chapNum}`;
        currentChapterTitle = chapSub ? `第${chapNum}章 ${chapSub}` : `第${chapNum}章`;

        if (!this.chapterList.some((c) => c.id === currentChapterId)) {
          this.chapterList.push({ id: currentChapterId, title: currentChapterTitle, line: lineNumber });
        }
      }

      // Check foreshadowing tags
      let match: RegExpExecArray | null;
      tagRegex.lastIndex = 0;
      while ((match = tagRegex.exec(line)) !== null) {
        const tagType = match[1].toLowerCase() as ForeshadowingTagType;
        const id = match[2] || match[6];
        const detail = match[3] || match[4] || match[5] || match[7] || match[8] || match[9] || '';
        const cleanDetail = detail.trim();

        if (!id) continue;

        const charOffset = currentOffset + match.index;

        this.processTag({
          type: tagType,
          id,
          title: cleanDetail,
          chapterId: currentChapterId,
          chapterTitle: currentChapterTitle,
          lineNumber,
          charOffset,
          description: cleanDetail,
        });
      }

      currentOffset += line.length + 1; // +1 for newline
    }

    return Array.from(this.items.values());
  }

  /**
   * Manually adds or updates a foreshadowing tag.
   */
  public processTag(tag: ForeshadowingTag): void {
    let item = this.items.get(tag.id);

    if (tag.type === 'plant') {
      if (!item) {
        const newItem: ForeshadowingItem = {
          id: tag.id,
          title: tag.title || tag.id,
          status: 'PLANTED',
          plantedChapterId: tag.chapterId,
          plantedChapterTitle: tag.chapterTitle,
          plantedLine: tag.lineNumber,
          plantedOffset: tag.charOffset,
          hints: [],
          description: tag.description,
        };
        this.items.set(tag.id, newItem);
      } else {
        item.plantedChapterId = tag.chapterId;
        item.plantedChapterTitle = tag.chapterTitle;
        item.plantedLine = tag.lineNumber;
        item.plantedOffset = tag.charOffset;
        if (tag.title) item.title = tag.title;
        if (tag.description) item.description = tag.description;
      }
    } else if (tag.type === 'hint') {
      if (!item) {
        const newItem: ForeshadowingItem = {
          id: tag.id,
          title: tag.title || tag.id,
          status: 'HINTED',
          plantedChapterId: tag.chapterId,
          plantedChapterTitle: tag.chapterTitle,
          plantedLine: tag.lineNumber,
          plantedOffset: tag.charOffset,
          hints: [],
        };
        item = newItem;
        this.items.set(tag.id, newItem);
      }
      item.hints.push({
        chapterId: tag.chapterId,
        chapterTitle: tag.chapterTitle,
        line: tag.lineNumber,
        offset: tag.charOffset,
        description: tag.description,
      });
      if (item.status !== 'RESOLVED') {
        item.status = 'HINTED';
      }
    } else if (tag.type === 'resolve') {
      if (!item) {
        const newItem: ForeshadowingItem = {
          id: tag.id,
          title: tag.title || tag.id,
          status: 'RESOLVED',
          plantedChapterId: tag.chapterId,
          plantedChapterTitle: tag.chapterTitle,
          plantedLine: tag.lineNumber,
          plantedOffset: tag.charOffset,
          hints: [],
        };
        item = newItem;
        this.items.set(tag.id, newItem);
      }
      item.status = 'RESOLVED';
      item.resolvedChapterId = tag.chapterId;
      item.resolvedChapterTitle = tag.chapterTitle;
      item.resolvedLine = tag.lineNumber;
      item.resolvedOffset = tag.charOffset;
      item.resolvedNote = tag.description;
    }
  }

  /**
   * Set pre-built items directly (e.g. from manifest JSON).
   */
  public setManifestItems(items: ForeshadowingItem[]): void {
    this.items.clear();
    for (const item of items) {
      this.items.set(item.id, item);
    }
  }

  public getForeshadowings(): ForeshadowingItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Returns list of unresolved foreshadowings (status is PLANTED or HINTED).
   */
  public getUnresolvedForeshadowings(): ForeshadowingItem[] {
    return this.getForeshadowings().filter((item) => item.status !== 'RESOLVED');
  }

  /**
   * Aggregates recovery progress chapter by chapter.
   */
  public getChapterProgresses(): ChapterProgress[] {
    if (this.chapterList.length === 0) {
      this.chapterList.push({ id: 'ch-1', title: '第1章', line: 1 });
    }

    const chapterMap = new Map<string, ChapterProgress>();

    for (const chap of this.chapterList) {
      chapterMap.set(chap.id, {
        chapterId: chap.id,
        chapterTitle: chap.title,
        plantedCount: 0,
        resolvedCount: 0,
        progressPercentage: 100,
        unresolvedCount: 0,
        unresolvedIds: [],
      });
    }

    for (const item of this.items.values()) {
      let chapProg = chapterMap.get(item.plantedChapterId);
      if (!chapProg) {
        chapProg = {
          chapterId: item.plantedChapterId,
          chapterTitle: item.plantedChapterTitle || item.plantedChapterId,
          plantedCount: 0,
          resolvedCount: 0,
          progressPercentage: 100,
          unresolvedCount: 0,
          unresolvedIds: [],
        };
        chapterMap.set(item.plantedChapterId, chapProg);
      }

      chapProg.plantedCount++;

      if (item.status === 'RESOLVED') {
        chapProg.resolvedCount++;
      } else {
        chapProg.unresolvedCount++;
        chapProg.unresolvedIds.push(item.id);
      }
    }

    const results: ChapterProgress[] = [];
    for (const prog of chapterMap.values()) {
      prog.progressPercentage =
        prog.plantedCount === 0
          ? 100
          : Math.round((prog.resolvedCount / prog.plantedCount) * 100);
      results.push(prog);
    }

    return results;
  }

  /**
   * Calculates overall foreshadowing progress statistics.
   */
  public getOverallProgress(): OverallForeshadowingProgress {
    const all = this.getForeshadowings();
    const totalPlanted = all.length;
    const totalResolved = all.filter((i) => i.status === 'RESOLVED').length;
    const totalUnresolved = totalPlanted - totalResolved;
    const overallProgressPercentage =
      totalPlanted === 0 ? 100 : Math.round((totalResolved / totalPlanted) * 100);

    return {
      totalPlanted,
      totalResolved,
      totalUnresolved,
      overallProgressPercentage,
      chapterProgresses: this.getChapterProgresses(),
    };
  }

  /**
   * Returns target jump coordinates for a given foreshadowing item.
   */
  public jumpToForeshadowing(id: string): ForeshadowingJumpTarget | null {
    const item = this.items.get(id);
    if (!item) return null;

    // Prefer latest hint line/offset if available, otherwise planted line/offset
    let lineNumber = item.plantedLine;
    let charOffset = item.plantedOffset;
    let chapterId = item.plantedChapterId;
    let chapterTitle = item.plantedChapterTitle;
    let tagType: ForeshadowingTagType = 'plant';

    if (item.hints.length > 0) {
      const lastHint = item.hints[item.hints.length - 1];
      lineNumber = lastHint.line;
      charOffset = lastHint.offset;
      chapterId = lastHint.chapterId;
      chapterTitle = lastHint.chapterTitle;
      tagType = 'hint';
    }

    if (item.status === 'RESOLVED' && item.resolvedLine !== undefined) {
      lineNumber = item.resolvedLine;
      charOffset = item.resolvedOffset ?? 0;
      chapterId = item.resolvedChapterId ?? chapterId;
      chapterTitle = item.resolvedChapterTitle ?? chapterTitle;
      tagType = 'resolve';
    }

    return {
      foreshadowingId: item.id,
      title: item.title,
      chapterId,
      chapterTitle,
      lineNumber,
      charOffset,
      tagType,
    };
  }
}
