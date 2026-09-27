/**
 * CharacterHeatmapEngine - Time-series character and lore term frequency analysis
 * and lightweight SVG / Canvas sparkline / heatmap visualization renderer for Plotailor IDE.
 *
 * Adheres to 3-Pane IDE Constitution:
 * - Non-modal, lightweight inline & dock visual rendering
 * - High performance manuscript chapter segmentation & string frequency aggregation
 */

export interface CharacterTermDef {
  id: string;
  name: string;
  aliases?: string[];
  category?: 'character' | 'term' | 'location' | string;
  color?: string;
}

export interface ChapterSegment {
  id: string;
  title: string;
  chapterIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface FrequencyPoint {
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  count: number;
  density: number; // Mentions per 1,000 characters
}

export interface CharacterFrequencySeries {
  target: CharacterTermDef;
  totalCount: number;
  maxCount: number;
  maxChapterTitle: string;
  frequencies: FrequencyPoint[];
}

export interface HeatmapAnalysisResult {
  chapters: ChapterSegment[];
  series: CharacterFrequencySeries[];
  totalManuscriptLength: number;
}

export interface SegmentationOptions {
  chapterRegex?: RegExp;
  chunkSize?: number; // Fallback character count per chunk when no chapter headers found
  customSegments?: ChapterSegment[];
}

export interface SparklineRenderOptions {
  width?: number;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  showDots?: boolean;
  dotRadius?: number;
  className?: string;
  padding?: number;
}

export interface HeatmapMatrixRenderOptions {
  cellWidth?: number;
  cellHeight?: number;
  gap?: number;
  maxColor?: string;
  minColor?: string;
  showLabels?: boolean;
}

export class CharacterHeatmapEngine {
  private static DEFAULT_CHAPTER_REGEX = /^(?:第[一二三四五六七八九十0-9]+[章話節幕]|#+\s+|\bEpisode\s*\d+|\bChapter\s*\d+|プロローグ|エピローグ)/mi;
  private static DEFAULT_CHUNK_SIZE = 1500;

  /**
   * Splits manuscript text into chapter / episode segments chronologically.
   */
  public segmentText(rawText: string, options?: SegmentationOptions): ChapterSegment[] {
    if (options?.customSegments && options.customSegments.length > 0) {
      return options.customSegments;
    }

    if (!rawText || rawText.trim().length === 0) {
      return [];
    }

    const regex = options?.chapterRegex ?? CharacterHeatmapEngine.DEFAULT_CHAPTER_REGEX;
    const lines = rawText.split('\n');
    const matches: { lineIndex: number; offset: number; title: string }[] = [];

    let currentOffset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regex.test(line.trim())) {
        matches.push({
          lineIndex: i,
          offset: currentOffset,
          title: line.trim().replace(/^#+\s*/, ''),
        });
      }
      currentOffset += line.length + 1; // +1 for '\n'
    }

    // If no chapter headers matched, fallback to character chunking or single section
    if (matches.length === 0) {
      const chunkSize = options?.chunkSize ?? CharacterHeatmapEngine.DEFAULT_CHUNK_SIZE;
      if (rawText.length <= chunkSize) {
        return [
          {
            id: 'ch-1',
            title: '全編',
            chapterIndex: 0,
            text: rawText,
            startOffset: 0,
            endOffset: rawText.length,
          },
        ];
      }

      const chunks: ChapterSegment[] = [];
      let index = 0;
      for (let offset = 0; offset < rawText.length; offset += chunkSize) {
        const chunkText = rawText.slice(offset, offset + chunkSize);
        chunks.push({
          id: `ch-chunk-${index + 1}`,
          title: `区間 ${index + 1}`,
          chapterIndex: index,
          text: chunkText,
          startOffset: offset,
          endOffset: offset + chunkText.length,
        });
        index++;
      }
      return chunks;
    }

    // Process matched chapters
    const segments: ChapterSegment[] = [];

    // Check if there is text before the first chapter header (e.g. intro/preface)
    if (matches[0].offset > 0) {
      const introText = rawText.slice(0, matches[0].offset);
      if (introText.trim().length > 0) {
        segments.push({
          id: 'ch-intro',
          title: '序文・前置き',
          chapterIndex: 0,
          text: introText,
          startOffset: 0,
          endOffset: matches[0].offset,
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const start = match.offset;
      const end = i < matches.length - 1 ? matches[i + 1].offset : rawText.length;
      const chapterText = rawText.slice(start, end);

      segments.push({
        id: `ch-${segments.length + 1}`,
        title: match.title || `第${segments.length + 1}章`,
        chapterIndex: segments.length,
        text: chapterText,
        startOffset: start,
        endOffset: end,
      });
    }

    return segments;
  }

  /**
   * Counts occurrences of a target term and its aliases within a given text block.
   */
  public countMentions(text: string, target: CharacterTermDef): number {
    if (!text || (!target.name && (!target.aliases || target.aliases.length === 0))) {
      return 0;
    }

    const searchTerms = [target.name, ...(target.aliases ?? [])].filter(Boolean);
    if (searchTerms.length === 0) return 0;

    // Escape regex special characters for each term
    const escaped = searchTerms.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(escaped.join('|'), 'g');

    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Analyzes manuscript text to produce complete frequency series across chapters.
   */
  public analyze(
    rawText: string,
    targets: CharacterTermDef[],
    options?: SegmentationOptions
  ): HeatmapAnalysisResult {
    const chapters = this.segmentText(rawText, options);
    const seriesList: CharacterFrequencySeries[] = [];

    for (const target of targets) {
      let totalCount = 0;
      let maxCount = 0;
      let maxChapterTitle = chapters.length > 0 ? chapters[0].title : '-';
      const frequencies: FrequencyPoint[] = [];

      for (const ch of chapters) {
        const count = this.countMentions(ch.text, target);
        const len = ch.text.length || 1;
        const density = Number(((count / len) * 1000).toFixed(2));

        totalCount += count;
        if (count > maxCount) {
          maxCount = count;
          maxChapterTitle = ch.title;
        }

        frequencies.push({
          chapterId: ch.id,
          chapterTitle: ch.title,
          chapterIndex: ch.chapterIndex,
          count,
          density,
        });
      }

      seriesList.push({
        target,
        totalCount,
        maxCount,
        maxChapterTitle,
        frequencies,
      });
    }

    return {
      chapters,
      series: seriesList,
      totalManuscriptLength: rawText ? rawText.length : 0,
    };
  }

  /**
   * Renders a lightweight SVG Sparkline for a character frequency series.
   */
  public renderSvgSparkline(
    series: CharacterFrequencySeries,
    options?: SparklineRenderOptions
  ): string {
    const width = options?.width ?? 200;
    const height = options?.height ?? 36;
    const padding = options?.padding ?? 4;
    const strokeColor = options?.strokeColor ?? series.target.color ?? '#cfa85c';
    const fillColor = options?.fillColor ?? 'rgba(207, 168, 92, 0.15)';
    const strokeWidth = options?.strokeWidth ?? 2;
    const showDots = options?.showDots ?? true;
    const dotRadius = options?.dotRadius ?? 2.5;
    const className = options?.className ?? 'character-sparkline';

    const points = series.frequencies;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;

    if (points.length === 0) {
      return `<svg class="${className}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="2,2" opacity="0.4"/></svg>`;
    }

    const maxCount = Math.max(...points.map((p) => p.count), 1);

    // Calculate (x, y) coordinates for each frequency point
    const coords = points.map((pt, idx) => {
      const x = points.length === 1
        ? width / 2
        : padding + (idx / (points.length - 1)) * innerWidth;
      const y = height - padding - (pt.count / maxCount) * innerHeight;
      return { x, y, pt };
    });

    // Build SVG path commands
    let pathD = '';
    let polygonD = '';

    if (coords.length === 1) {
      const { x, y } = coords[0];
      pathD = `M ${padding} ${y} L ${width - padding} ${y}`;
      polygonD = `M ${padding} ${height - padding} L ${padding} ${y} L ${width - padding} ${y} L ${width - padding} ${height - padding} Z`;
    } else {
      pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
      polygonD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padding).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padding).toFixed(1)} Z`;
    }

    let dotsSvg = '';
    if (showDots) {
      dotsSvg = coords
        .map(
          (c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${dotRadius}" fill="${strokeColor}"><title>${c.pt.chapterTitle}: ${c.pt.count}回 (${c.pt.density}/1,000字)</title></circle>`
        )
        .join('');
    }

    return `<svg class="${className}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${series.target.name} 出現度推移スパークライン">
      <polygon points="" d="${polygonD}" fill="${fillColor}" />
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
      ${dotsSvg}
    </svg>`.replace(/\s+/g, ' ').replace(/\s*=\s*/g, '=').trim();
  }

  /**
   * Renders an SVG Heatmap Matrix (Grid) for all character/term series.
   */
  public renderSvgHeatmapMatrix(
    result: HeatmapAnalysisResult,
    options?: HeatmapMatrixRenderOptions
  ): string {
    const cellWidth = options?.cellWidth ?? 24;
    const cellHeight = options?.cellHeight ?? 18;
    const gap = options?.gap ?? 3;
    const showLabels = options?.showLabels ?? true;
    const maxColor = options?.maxColor ?? '#cfa85c';
    const minColor = options?.minColor ?? 'rgba(207, 168, 92, 0.08)';

    const labelWidth = showLabels ? 90 : 0;
    const headerHeight = 20;

    const numCols = result.chapters.length;
    const numRows = result.series.length;

    if (numCols === 0 || numRows === 0) {
      return `<svg width="100" height="30" xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" fill="#888" font-size="12">データなし</text></svg>`;
    }

    const totalWidth = labelWidth + numCols * (cellWidth + gap);
    const totalHeight = headerHeight + numRows * (cellHeight + gap);

    // Global max count for color scaling
    let globalMax = 1;
    for (const s of result.series) {
      for (const f of s.frequencies) {
        if (f.count > globalMax) globalMax = f.count;
      }
    }

    let svg = `<svg class="heatmap-matrix-svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;

    // Render Chapter headers
    result.chapters.forEach((ch, colIdx) => {
      const x = labelWidth + colIdx * (cellWidth + gap) + cellWidth / 2;
      const shortTitle = ch.title.length > 3 ? ch.title.slice(0, 3) : ch.title;
      svg += `<text x="${x}" y="14" font-size="10" fill="var(--text-muted, #888)" text-anchor="middle">${shortTitle}<title>${ch.title}</title></text>`;
    });

    // Render Rows & Cells
    result.series.forEach((s, rowIdx) => {
      const y = headerHeight + rowIdx * (cellHeight + gap);

      if (showLabels) {
        svg += `<text x="${labelWidth - 6}" y="${y + cellHeight / 2 + 3}" font-size="11" fill="var(--text-primary, #e6edf3)" text-anchor="end">${s.target.name}</text>`;
      }

      s.frequencies.forEach((f, colIdx) => {
        const x = labelWidth + colIdx * (cellWidth + gap);
        const opacity = f.count === 0 ? 0.1 : Math.max(0.25, f.count / globalMax);
        const color = f.count === 0 ? minColor : maxColor;

        svg += `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="2" fill="${color}" fill-opacity="${opacity.toFixed(2)}"><title>${s.target.name} - ${f.chapterTitle}: ${f.count}回</title></rect>`;
      });
    });

    svg += `</svg>`;
    return svg;
  }

  /**
   * Renders a sparkline directly onto an HTML Canvas 2D Rendering Context.
   */
  public renderCanvasSparkline(
    ctx: CanvasRenderingContext2D,
    series: CharacterFrequencySeries,
    options?: SparklineRenderOptions
  ): void {
    const width = options?.width ?? ctx.canvas.width;
    const height = options?.height ?? ctx.canvas.height;
    const padding = options?.padding ?? 4;
    const strokeColor = options?.strokeColor ?? series.target.color ?? '#cfa85c';
    const fillColor = options?.fillColor ?? 'rgba(207, 168, 92, 0.15)';
    const strokeWidth = options?.strokeWidth ?? 2;
    const showDots = options?.showDots ?? true;
    const dotRadius = options?.dotRadius ?? 2.5;

    ctx.clearRect(0, 0, width, height);

    const points = series.frequencies;
    if (points.length === 0) {
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.moveTo(padding, height / 2);
      ctx.lineTo(width - padding, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const maxCount = Math.max(...points.map((p) => p.count), 1);

    const coords = points.map((pt, idx) => {
      const x = points.length === 1
        ? width / 2
        : padding + (idx / (points.length - 1)) * innerWidth;
      const y = height - padding - (pt.count / maxCount) * innerHeight;
      return { x, y, count: pt.count };
    });

    // Filled area under path
    ctx.beginPath();
    if (coords.length === 1) {
      ctx.moveTo(padding, height - padding);
      ctx.lineTo(padding, coords[0].y);
      ctx.lineTo(width - padding, coords[0].y);
      ctx.lineTo(width - padding, height - padding);
    } else {
      ctx.moveTo(coords[0].x, height - padding);
      coords.forEach((c) => ctx.lineTo(c.x, c.y));
      ctx.lineTo(coords[coords.length - 1].x, height - padding);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    if (coords.length === 1) {
      ctx.moveTo(padding, coords[0].y);
      ctx.lineTo(width - padding, coords[0].y);
    } else {
      coords.forEach((c, i) => {
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots
    if (showDots) {
      coords.forEach((c) => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
      });
    }
  }
}
