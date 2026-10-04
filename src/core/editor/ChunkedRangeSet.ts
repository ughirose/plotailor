import { Text, RangeSet, RangeSetBuilder, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

export const CHUNK_LINE_COUNT = 500;
export const OVERSCAN_MARGIN_CHARS = 2000;

export interface DocumentChunk {
  index: number;
  startLine: number;
  endLine: number;
  startPos: number;
  endPos: number;
  dirty: boolean;
  decorations: Range<Decoration>[];
}

export type ChunkDecorationScanner = (
  chunk: DocumentChunk,
  doc: Text,
  builder: RangeSetBuilder<Decoration>
) => void;

export interface ViewportBounds {
  clampedFrom: number;
  clampedTo: number;
}

/**
 * Calculates active viewport range clamped with over-scan margin (2,000 chars above and below).
 */
export function calculateClampedViewport(
  docLength: number,
  visibleRanges: readonly { from: number; to: number }[],
  overscanMargin: number = OVERSCAN_MARGIN_CHARS
): ViewportBounds {
  if (visibleRanges.length === 0) {
    return {
      clampedFrom: 0,
      clampedTo: Math.min(docLength, overscanMargin),
    };
  }

  let minFrom = visibleRanges[0].from;
  let maxTo = visibleRanges[0].to;

  for (let i = 1; i < visibleRanges.length; i++) {
    if (visibleRanges[i].from < minFrom) minFrom = visibleRanges[i].from;
    if (visibleRanges[i].to > maxTo) maxTo = visibleRanges[i].to;
  }

  const clampedFrom = Math.max(0, minFrom - overscanMargin);
  const clampedTo = Math.min(docLength, maxTo + overscanMargin);

  return { clampedFrom, clampedTo };
}

/**
 * Validates whether a decoration is an Atomic Replace Decoration.
 * Replaces spanning multiple lines or full paragraphs disrupt CodeMirror 6's line height cache.
 */
export function isAtomicDecorationSafe(from: number, to: number, doc: Text): boolean {
  if (from === to) return true; // cursor/point decoration is safe
  const slice = doc.sliceString(from, to);
  // Atomic replacement must NOT cross newline boundaries
  return !slice.includes('\n');
}

/**
 * Chunked RangeSet Cache Manager.
 * Divides large documents (e.g. 300,000 chars) into 500-line chunks.
 * Recomputes decorations only for dirty chunks intersecting the active viewport,
 * reusing immutable decorations for unchanged chunks in O(1) to O(log N).
 */
export class ChunkedRangeSetManager {
  private chunks: DocumentChunk[] = [];
  private lastDocLength = 0;
  private lastDocLines = 0;

  constructor(
    public readonly chunkLineSize: number = CHUNK_LINE_COUNT,
    public readonly overscanMargin: number = OVERSCAN_MARGIN_CHARS
  ) {}

  /**
   * Initializes or updates chunks structure based on document lines.
   */
  synchronizeChunks(doc: Text) {
    const totalLines = doc.lines;
    const expectedChunkCount = Math.ceil(totalLines / this.chunkLineSize) || 1;

    if (this.chunks.length !== expectedChunkCount || this.lastDocLength !== doc.length || this.lastDocLines !== totalLines) {
      const newChunks: DocumentChunk[] = [];

      for (let i = 0; i < expectedChunkCount; i++) {
        const startLine = i * this.chunkLineSize + 1;
        const endLine = Math.min(totalLines, (i + 1) * this.chunkLineSize);

        const lineStartObj = doc.line(startLine);
        const lineEndObj = doc.line(endLine);

        const startPos = lineStartObj.from;
        const endPos = lineEndObj.to;

        // Try to preserve existing chunk decorations if unchanged
        const existing = this.chunks[i];
        const isExactMatch =
          existing &&
          existing.startLine === startLine &&
          existing.endLine === endLine &&
          existing.startPos === startPos &&
          existing.endPos === endPos &&
          !existing.dirty;

        newChunks.push({
          index: i,
          startLine,
          endLine,
          startPos,
          endPos,
          dirty: !isExactMatch,
          decorations: isExactMatch ? existing.decorations : [],
        });
      }

      this.chunks = newChunks;
      this.lastDocLength = doc.length;
      this.lastDocLines = totalLines;
    }
  }

  /**
   * Invalidates chunks intersecting with modified document range.
   */
  invalidateRange(changeFrom: number, changeTo: number) {
    for (const chunk of this.chunks) {
      if (Math.max(chunk.startPos, changeFrom) <= Math.min(chunk.endPos, changeTo)) {
        chunk.dirty = true;
        chunk.decorations = [];
      }
    }
  }

  /**
   * Invalidate all chunks.
   */
  invalidateAll() {
    for (const chunk of this.chunks) {
      chunk.dirty = true;
      chunk.decorations = [];
    }
  }

  /**
   * Gets chunks intersecting the active clamped viewport.
   */
  getActiveChunks(viewport: ViewportBounds): DocumentChunk[] {
    return this.chunks.filter(
      (c) => Math.max(c.startPos, viewport.clampedFrom) < Math.min(c.endPos, viewport.clampedTo)
    );
  }

  /**
   * Builds the optimized DecorationSet by scanning only active viewport chunks.
   */
  buildDecorations(
    view: EditorView,
    scanner: (chunk: DocumentChunk, doc: Text) => Range<Decoration>[]
  ): DecorationSet {
    const doc = view.state.doc;
    this.synchronizeChunks(doc);

    const viewport = calculateClampedViewport(
      doc.length,
      view.visibleRanges,
      this.overscanMargin
    );

    const activeChunks = this.getActiveChunks(viewport);
    const builder = new RangeSetBuilder<Decoration>();

    for (const chunk of activeChunks) {
      if (chunk.dirty || chunk.decorations.length === 0) {
        chunk.decorations = scanner(chunk, doc);
        chunk.dirty = false;
      }

      // Add chunk decorations to builder (must be sorted by from)
      for (const dec of chunk.decorations) {
        // Clamp to active viewport
        if (dec.to >= viewport.clampedFrom && dec.from <= viewport.clampedTo) {
          builder.add(dec.from, dec.to, dec.value);
        }
      }
    }

    return builder.finish();
  }

  getChunkCount(): number {
    return this.chunks.length;
  }

  getChunk(index: number): DocumentChunk | undefined {
    return this.chunks[index];
  }
}

/**
 * Creates a ChunkDecorationScanner accelerated by Wasm SIMD Tokenizer and DualOffsetTable.
 * Scans ruby annotations locally within each chunk, avoiding full-document AST re-traversals.
 */
export function createSimdRubyScanner(
  tokenizer: { parseRubySpans: (text: string) => Array<{ rawFrom: number; rawTo: number; baseText: string; rubyText: string }> },
  createDecorationWidget: (baseText: string, rubyText: string, from: number, to: number) => Decoration
): (chunk: DocumentChunk, doc: Text) => Range<Decoration>[] {
  return (chunk: DocumentChunk, doc: Text): Range<Decoration>[] => {
    const chunkText = doc.sliceString(chunk.startPos, chunk.endPos);
    const spans = tokenizer.parseRubySpans(chunkText);
    const decorations: Range<Decoration>[] = [];

    for (const span of spans) {
      const from = chunk.startPos + span.rawFrom;
      const to = chunk.startPos + span.rawTo;
      if (isAtomicDecorationSafe(from, to, doc)) {
        const dec = createDecorationWidget(span.baseText, span.rubyText, from, to);
        decorations.push(dec.range(from, to));
      }
    }

    return decorations;
  };
}
