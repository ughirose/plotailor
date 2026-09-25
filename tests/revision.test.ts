import { describe, it, expect, beforeEach } from 'vitest';
import {
  OPFSStorage,
  RevisionHistoryManager,
  computeLineDiff,
  ThreePaneWorkspace,
} from '../src/index.js';

describe('RevisionHistoryManager - OPFS Differential Backup & Revision Rollback Engine', () => {
  let storage: OPFSStorage;
  let docId: string;
  let manager: RevisionHistoryManager;

  beforeEach(() => {
    storage = new OPFSStorage();
    docId = 'test-doc-123';
    manager = new RevisionHistoryManager(storage, docId, { maxRevisions: 5 });
  });

  describe('OPFS Generation Snapshot Backup & Persistence', () => {
    it('creates snapshots and records parent relationships in chronological order', () => {
      const rev1 = manager.createSnapshot('第1章 原稿テキスト', '初回下書き');
      expect(rev1.content).toBe('第1章 原稿テキスト');
      expect(rev1.message).toBe('初回下書き');
      expect(rev1.parentRevisionId).toBeNull();
      expect(rev1.hash).toBeDefined();

      const rev2 = manager.createSnapshot('第1章 原稿テキスト\n第2章 追加テキスト', '2章追加');
      expect(rev2.parentRevisionId).toBe(rev1.revisionId);
      expect(manager.getHead()?.revisionId).toBe(rev2.revisionId);

      const history = manager.getHistoryList();
      expect(history.length).toBe(2);
      expect(history[0].revisionId).toBe(rev2.revisionId); // Newest first
      expect(history[1].revisionId).toBe(rev1.revisionId);
    });

    it('persists revisions to OPFS Storage and reloads correctly', () => {
      manager.createSnapshot('バージョン 1', 'v1');
      manager.createSnapshot('バージョン 2', 'v2');

      // Create new manager instance referencing same OPFS storage & documentId
      const manager2 = new RevisionHistoryManager(storage, docId);
      const head = manager2.getHead();

      expect(head).not.toBeNull();
      expect(head?.content).toBe('バージョン 2');
      expect(manager2.getHistoryList().length).toBe(2);
    });

    it('prunes oldest linear revisions when exceeding maxRevisions capacity', () => {
      for (let i = 1; i <= 7; i++) {
        manager.createSnapshot(`コンテンツ ${i}`, `Rev ${i}`);
      }

      const history = manager.getHistoryList();
      expect(history.length).toBe(5); // maxRevisions is 5
      expect(manager.getHead()?.content).toBe('コンテンツ 7');
      expect(history[history.length - 1].content).toBe('コンテンツ 3'); // Oldest retained
    });
  });

  describe('Git-like Text Line Diff Calculation (LCS)', () => {
    it('correctly calculates added, removed, and unchanged lines', () => {
      const oldText = '1行目: 序章\n2行目: 開発\n3行目: 結末';
      const newText = '1行目: 序章\n2行目: 修正開発\n3行目: 結末\n4行目: あとがき';

      const diff = computeLineDiff(oldText, newText, 'rev-1', 'rev-2');

      expect(diff.baseRevisionId).toBe('rev-1');
      expect(diff.targetRevisionId).toBe('rev-2');
      expect(diff.stats.additions).toBe(2); // '2行目: 修正開発' and '4行目: あとがき'
      expect(diff.stats.deletions).toBe(1); // '2行目: 開発'
      expect(diff.stats.unchanged).toBe(2); // 1行目 and 3行目

      const addedLines = diff.lines.filter((l) => l.type === 'added');
      expect(addedLines.map((l) => l.content)).toEqual(['2行目: 修正開発', '4行目: あとがき']);

      const removedLines = diff.lines.filter((l) => l.type === 'removed');
      expect(removedLines.map((l) => l.content)).toEqual(['2行目: 開発']);
    });

    it('handles empty strings gracefully', () => {
      const diff = computeLineDiff('', '新規テキスト', 'rev-empty', 'rev-new');
      expect(diff.stats.additions).toBe(1);
      expect(diff.stats.deletions).toBe(0);
      expect(diff.lines[0].content).toBe('新規テキスト');
    });
  });

  describe('Safe Non-destructive Rollback (Undo Tree Protection)', () => {
    it('restores previous text by creating a NEW revision without destroying history', () => {
      const rev1 = manager.createSnapshot('最初の下書き', 'v1');
      const rev2 = manager.createSnapshot('中間の変更', 'v2');
      const rev3 = manager.createSnapshot('誤って削除したテキスト', 'v3');

      expect(manager.getHead()?.content).toBe('誤って削除したテキスト');

      // Rollback to rev1
      const rollbackResult = manager.rollback(rev1.revisionId, 'v1へロールバック');

      expect(rollbackResult.restoredContent).toBe('最初の下書き');

      const newHead = manager.getHead();
      expect(newHead?.content).toBe('最初の下書き');
      expect(newHead?.message).toBe('v1へロールバック');
      expect(newHead?.parentRevisionId).toBe(rev3.revisionId); // Parent is rev3!

      // Total history count grew (v1, v2, v3, rollback_v4)
      const history = manager.getAllRevisionsInOrder();
      expect(history.length).toBe(4);
      expect(history[1].revisionId).toBe(rev2.revisionId); // rev2 is preserved!
      expect(history[2].revisionId).toBe(rev3.revisionId); // rev3 is preserved!
    });

    it('throws an error if attempting to rollback to non-existent revision ID', () => {
      expect(() => manager.rollback('rev-does-not-exist')).toThrowError('Revision rev-does-not-exist not found');
    });
  });

  describe('3-Pane Inline UI Rendering (Non-modal Constitution)', () => {
    it('renders revision list HTML without modal dialogs', () => {
      manager.createSnapshot('原稿 ver1', '初版');
      manager.createSnapshot('原稿 ver2', '改訂版');

      const listHtml = manager.renderRevisionListHtml();

      expect(listHtml).toContain('revision-list-container');
      expect(listHtml).toContain('初版');
      expect(listHtml).toContain('改訂版');
      expect(listHtml).toContain('この世代へロールバック');
      expect(listHtml).not.toContain('modal');
    });

    it('renders colored diff preview with diff-added and diff-removed classes', () => {
      const oldText = '昔々あるところに';
      const newText = '昔々ある場所に';
      const diff = computeLineDiff(oldText, newText, 'r1', 'r2');

      const diffHtml = manager.renderDiffHtml(diff);

      expect(diffHtml).toContain('diff-view-panel');
      expect(diffHtml).toContain('diff-added');
      expect(diffHtml).toContain('diff-removed');
      expect(diffHtml).toContain('昔々ある場所に');
      expect(diffHtml).toContain('昔々あるところに');
    });

    it('renders combined right-pane dock view HTML for 3-pane layout integration', () => {
      manager.createSnapshot('第一章 起', '起');
      manager.createSnapshot('第一章 起・承', '承');

      const dockHtml = manager.renderDockViewHtml();

      expect(dockHtml).toContain('revision-dock');
      expect(dockHtml).toContain('OPFS世代リビジョン履歴');
      expect(dockHtml).toContain('差分プレビュー');
    });
  });

  describe('ThreePaneWorkspace Integration', () => {
    it('allows switching to revision-history right tab and autoSave creates snapshots', async () => {
      const workspace = new ThreePaneWorkspace({ initialText: '初期原稿' });

      // Tab switch
      workspace.setRightTab('revision-history');
      expect(workspace.getState().activeRightTab).toBe('revision-history');

      // Edit & AutoSave
      workspace.onTextChange('初期原稿\n第二行追加');
      await workspace.autoSave();

      const model = workspace.renderWorkspaceModel();
      expect(model.rightPane.activeTab).toBe('revision-history');
      expect(model.rightPane.contentHtml).toContain('revision-dock');
      expect(model.rightPane.contentHtml).toContain('第二行追加');

      // Test workspace rollback
      const revs = workspace.getRevisionManager().getAllRevisionsInOrder();
      const initialRevId = revs[0].revisionId;

      workspace.rollbackToRevision(initialRevId);
      expect(workspace.getState().rawText).toBe('初期原稿');
    });
  });
});
