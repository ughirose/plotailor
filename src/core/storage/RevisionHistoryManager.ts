import { OPFSStorage } from './OPFSStorage.js';

export type DiffType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface RevisionDiff {
  baseRevisionId: string;
  targetRevisionId: string;
  lines: DiffLine[];
  stats: {
    additions: number;
    deletions: number;
    unchanged: number;
  };
}

export interface Revision {
  revisionId: string;
  documentId: string;
  timestamp: number;
  content: string;
  parentRevisionId: string | null;
  message: string;
  hash: string;
}

export interface RevisionHistoryConfig {
  maxRevisions?: number;
  autoPersist?: boolean;
}

/**
 * Computes a fast CRC32 checksum hex string for text content verification.
 */

function computeContentHash(content: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

/**
 * Line-by-line diff calculation using Longest Common Subsequence (LCS).
 */
export function computeLineDiff(
  oldText: string,
  newText: string,
  baseId: string = 'base',
  targetId: string = 'target'
): RevisionDiff {
  const oldLines = oldText === '' ? [] : oldText.split('\n');
  const newLines = newText === '' ? [] : newText.split('\n');

  const n = oldLines.length;
  const m = newLines.length;

  // DP table for LCS length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1) as unknown as number[]);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to reconstruct diff
  const lines: DiffLine[] = [];
  let i = n;
  let j = m;

  const rawLines: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawLines.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawLines.push({
        type: 'added',
        content: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawLines.push({
        type: 'removed',
        content: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  rawLines.reverse();

  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const line of rawLines) {
    lines.push(line);
    if (line.type === 'added') additions++;
    else if (line.type === 'removed') deletions++;
    else unchanged++;
  }

  return {
    baseRevisionId: baseId,
    targetRevisionId: targetId,
    lines,
    stats: {
      additions,
      deletions,
      unchanged,
    },
  };
}

/**
 * RevisionHistoryManager - OPFS Differential Backup & Revision History Rollback Engine
 *
 * Features:
 * 1. OPFSStorage generation backup and atomic state persistence.
 * 2. Git-like line diff calculation and non-destructive undo tree rollback.
 * 3. Inline 3-pane IDE UI rendering for revision lists and colored diff previews (0 modals).
 */
export class RevisionHistoryManager {
  private storage: OPFSStorage;
  private documentId: string;
  private maxRevisions: number;
  private autoPersist: boolean;
  private revisions: Map<string, Revision> = new Map();
  private revisionOrder: string[] = []; // Array of revisionIds in chronological order
  private headId: string | null = null;

  constructor(storage: OPFSStorage, documentId: string, config?: RevisionHistoryConfig) {
    this.storage = storage;
    this.documentId = documentId;
    this.maxRevisions = config?.maxRevisions ?? 50;
    this.autoPersist = config?.autoPersist ?? true;

    this.loadFromStorage();
  }

  private getStoragePath(): string {
    return `revisions_${this.documentId}.json`;
  }

  /**
   * Loads revision tree from OPFS Storage.
   */
  public loadFromStorage(): void {
    try {
      const path = this.getStoragePath();
      const handle = this.storage.getOrCreateHandle(path);
      const size = handle.getSize();
      if (size === 0) return;

      const raw = this.storage.read(path, size, 0);
      const text = new TextDecoder().decode(raw);
      if (!text) return;

      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.revisions)) {
        this.revisions.clear();
        this.revisionOrder = [];
        for (const rev of parsed.revisions) {
          this.revisions.set(rev.revisionId, rev);
          this.revisionOrder.push(rev.revisionId);
        }
        this.headId = parsed.headId ?? (this.revisionOrder.length > 0 ? this.revisionOrder[this.revisionOrder.length - 1] : null);
      }
    } catch {
      // Clean fallback if file does not exist or invalid
    }
  }

  /**
   * Persists current revision state to OPFS Storage.
   */
  public saveToStorage(): void {
    if (!this.autoPersist) return;

    const data = {
      documentId: this.documentId,
      headId: this.headId,
      revisions: this.getAllRevisionsInOrder(),
    };

    const payload = new TextEncoder().encode(JSON.stringify(data));
    this.storage.atomicWrite(this.getStoragePath(), payload, 0);
  }

  /**
   * Creates a new snapshot revision in the local undo tree.
   */
  public createSnapshot(content: string, message?: string): Revision {
    const timestamp = Date.now();
    const hash = computeContentHash(content);
    const revisionId = `rev-${timestamp}-${Math.random().toString(36).slice(2, 7)}`;

    const revision: Revision = {
      revisionId,
      documentId: this.documentId,
      timestamp,
      content,
      parentRevisionId: this.headId,
      message: message ?? `Snapshot at ${new Date(timestamp).toLocaleTimeString()}`,
      hash,
    };

    this.revisions.set(revisionId, revision);
    this.revisionOrder.push(revisionId);
    this.headId = revisionId;

    this.pruneIfNeeded();
    this.saveToStorage();

    return revision;
  }

  /**
   * Rollback safely to a previous revision without destroying history (Undo Tree Protection).
   * Creates a NEW revision whose parent is the current HEAD, with the restored content.
   */
  public rollback(targetRevisionId: string, customMessage?: string): { restoredContent: string; newRevision: Revision } {
    const targetRev = this.revisions.get(targetRevisionId);
    if (!targetRev) {
      throw new Error(`Revision ${targetRevisionId} not found in history`);
    }

    const restoredContent = targetRev.content;
    const msg = customMessage ?? `Rollback restored from ${targetRevisionId}`;

    const newRevision = this.createSnapshot(restoredContent, msg);

    return {
      restoredContent,
      newRevision,
    };
  }

  /**
   * Gets current HEAD revision.
   */
  public getHead(): Revision | null {
    if (!this.headId) return null;
    return this.revisions.get(this.headId) ?? null;
  }

  /**
   * Gets specific revision by ID.
   */
  public getRevision(revisionId: string): Revision | null {
    return this.revisions.get(revisionId) ?? null;
  }

  /**
   * Gets all revisions in chronological order.
   */
  public getAllRevisionsInOrder(): Revision[] {
    return this.revisionOrder.map((id) => this.revisions.get(id)!).filter(Boolean);
  }

  /**
   * Gets all revisions in reverse chronological order (newest first for UI).
   */
  public getHistoryList(): Revision[] {
    return [...this.getAllRevisionsInOrder()].reverse();
  }

  /**
   * Computes line diff between two revisions in history.
   */
  public computeDiff(baseRevisionId: string, targetRevisionId: string): RevisionDiff {
    const baseRev = this.revisions.get(baseRevisionId);
    const targetRev = this.revisions.get(targetRevisionId);

    const baseText = baseRev?.content ?? '';
    const targetText = targetRev?.content ?? '';

    return computeLineDiff(baseText, targetText, baseRevisionId, targetRevisionId);
  }

  /**
   * Prunes oldest linear revisions if exceeding maxRevisions capacity.
   */
  private pruneIfNeeded(): void {
    while (this.revisionOrder.length > this.maxRevisions) {
      const oldestId = this.revisionOrder.shift();
      if (oldestId && oldestId !== this.headId) {
        this.revisions.delete(oldestId);
      }
    }
  }

  /**
   * Renders revision history list HTML for the right pane dock.
   */
  public renderRevisionListHtml(selectedRevisionId?: string): string {
    const history = this.getHistoryList();

    if (history.length === 0) {
      return `
        <div class="revision-empty-state" style="padding: 1rem; color: var(--text-muted, #94a3b8); font-size: 0.85rem; text-align: center;">
          リビジョン履歴はありません
        </div>
      `;
    }

    const itemsHtml = history
      .map((rev) => {
        const isHead = rev.revisionId === this.headId;
        const isSelected = rev.revisionId === selectedRevisionId || (!selectedRevisionId && isHead);
        const dateStr = new Date(rev.timestamp).toLocaleString('ja-JP', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        return `
          <div class="revision-item ${isSelected ? 'selected' : ''} ${isHead ? 'is-head' : ''}"
               data-revision-id="${rev.revisionId}"
               style="padding: 0.5rem; margin-bottom: 0.4rem; background: ${isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)'}; border: 1px solid ${isSelected ? '#6366f1' : 'rgba(255, 255, 255, 0.1)'}; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem;">
              <span style="font-size: 0.75rem; font-weight: 600; color: ${isHead ? '#10b981' : '#a5b4fc'};">
                ${rev.revisionId} ${isHead ? ' (最新)' : ''}
              </span>
              <span style="font-size: 0.7rem; color: #94a3b8;">${dateStr}</span>
            </div>
            <div style="font-size: 0.8rem; color: #e2e8f0; margin-bottom: 0.3rem;">${rev.message}</div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.7rem; font-family: monospace; color: #64748b;">Hash: ${rev.hash}</span>
              ${
                !isHead
                  ? `<button class="rollback-btn" data-action="rollback" data-revision-id="${rev.revisionId}"
                            style="font-size: 0.7rem; padding: 0.2rem 0.5rem; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 4px; cursor: pointer;">
                      この世代へロールバック
                    </button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    return `<div class="revision-list-container">${itemsHtml}</div>`;
  }

  /**
   * Renders color-coded diff line preview HTML (green added, red removed, muted unchanged).
   */
  public renderDiffHtml(diff: RevisionDiff): string {
    const linesHtml = diff.lines
      .map((line) => {
        let bg = 'transparent';
        let color = '#94a3b8';
        let prefix = ' ';

        if (line.type === 'added') {
          bg = 'rgba(16, 185, 129, 0.15)';
          color = '#34d399';
          prefix = '+';
        } else if (line.type === 'removed') {
          bg = 'rgba(244, 63, 94, 0.15)';
          color = '#f87171';
          prefix = '-';
        }

        const lineNo = line.type === 'added' ? line.newLineNumber : line.oldLineNumber ?? '';

        return `
          <div class="diff-line diff-${line.type}"
               style="display: flex; background: ${bg}; color: ${color}; font-family: monospace; font-size: 0.75rem; line-height: 1.4; padding: 0.1rem 0.4rem; white-space: pre-wrap; word-break: break-all;">
            <span style="width: 2rem; opacity: 0.5; user-select: none; text-align: right; margin-right: 0.5rem;">${lineNo}</span>
            <span style="width: 1rem; opacity: 0.8; user-select: none;">${prefix}</span>
            <span>${line.content}</span>
          </div>
        `;
      })
      .join('');

    return `
      <div class="diff-view-panel" style="border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; overflow: hidden; background: #0f172a;">
        <div class="diff-header" style="display: flex; justify-content: space-between; padding: 0.4rem 0.6rem; background: #1e293b; font-size: 0.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
          <span>差分プレビュー: ${diff.baseRevisionId} ➔ ${diff.targetRevisionId}</span>
          <span>
            <strong style="color: #34d399;">+${diff.stats.additions}</strong> /
            <strong style="color: #f87171;">-${diff.stats.deletions}</strong> 行
          </span>
        </div>
        <div class="diff-lines-container" style="max-height: 250px; overflow-y: auto;">
          ${linesHtml}
        </div>
      </div>
    `;
  }

  /**
   * Renders the complete dock view for the right pane in 3-pane layout.
   */
  public renderDockViewHtml(selectedRevisionId?: string): string {
    const history = this.getHistoryList();
    const head = this.getHead();

    if (!head || history.length === 0) {
      return `
        <div class="revision-dock" style="padding: 0.75rem;">
          <h4 style="font-size: 0.85rem; color: #a5b4fc; margin-bottom: 0.5rem;">📜 リビジョン履歴 ＆ 差分ロールバック</h4>
          ${this.renderRevisionListHtml()}
        </div>
      `;
    }

    const targetRevId = selectedRevisionId ?? (history.length > 1 ? history[1].revisionId : head.revisionId);
    const diff = this.computeDiff(targetRevId, head.revisionId);

    return `
      <div class="revision-dock" style="padding: 0.75rem;">
        <h4 style="font-size: 0.85rem; color: #a5b4fc; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
          <span>📜 OPFS世代リビジョン履歴</span>
          <span style="font-size: 0.7rem; color: #10b981;">世代数: ${history.length}</span>
        </h4>
        <div style="margin-bottom: 0.75rem;">
          ${this.renderDiffHtml(diff)}
        </div>
        <div style="font-size: 0.8rem; font-weight: 600; color: #e2e8f0; margin-bottom: 0.4rem;">
          リビジョン一覧 (最新順)
        </div>
        ${this.renderRevisionListHtml(targetRevId)}
      </div>
    `;
  }
}
