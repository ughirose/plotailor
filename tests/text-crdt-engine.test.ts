import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChapterTextCrdt,
  TextCrdtEngine,
} from '../src/core/collab/TextCrdtEngine.js';
import { InMemoryVirtualTransport } from '../src/core/collab/P2PCrdtSyncEngine.js';

describe('TextCrdtEngine (RGA)', () => {
  beforeEach(() => {
    InMemoryVirtualTransport.reset();
  });

  describe('ChapterTextCrdt Unit Tests', () => {
    it('initializes with text and returns accurate document string', () => {
      const crdt = new ChapterTextCrdt('ch-1', 'peer-a', '吾輩は猫である。');
      expect(crdt.getText()).toBe('吾輩は猫である。');
    });

    it('performs local insertion and deletion correctly', () => {
      const crdt = new ChapterTextCrdt('ch-1', 'peer-a', '吾輩は猫である。');
      // Insert after '猫' (index 4)
      crdt.insertAt(4, 'のクロ');
      expect(crdt.getText()).toBe('吾輩は猫のクロである。');

      // Delete 'のクロ' (index 4, length 3)
      crdt.deleteAt(4, 3);
      expect(crdt.getText()).toBe('吾輩は猫である。');
    });

    it('converges deterministically when two peers insert concurrently at same origin', () => {
      const crdtA = new ChapterTextCrdt('ch-1', 'peer-a', 'ABC');
      const crdtB = new ChapterTextCrdt('ch-1', 'peer-b', 'ABC');

      // Peer A inserts 'X' after 'A' (index 1)
      const nodesA = crdtA.insertAt(1, 'X');

      // Peer B inserts 'Y' after 'A' (index 1) concurrently
      const nodesB = crdtB.insertAt(1, 'Y');

      // Cross apply
      crdtA.applyRemoteInsert(nodesB);
      crdtB.applyRemoteInsert(nodesA);

      // Both must converge to the exact same text
      expect(crdtA.getText()).toBe(crdtB.getText());
      expect(['AX YBC', 'AY XBC', 'AXYBC', 'AYXBC']).toContain(crdtA.getText().replace(/\s/g, ''));
    });
  });

  describe('TextCrdtEngine Multi-Peer P2P Synchronization', () => {
    it('synchronizes typing in real time over virtual transport', async () => {
      const bus = 'text-bus-1';
      const t1 = new InMemoryVirtualTransport(bus);
      const t2 = new InMemoryVirtualTransport(bus);

      const engine1 = new TextCrdtEngine('peer-1', '執筆者A', '#38bdf8', t1);
      const engine2 = new TextCrdtEngine('peer-2', '執筆者B', '#f59e0b', t2);

      // Peer 1 types in chapter-1
      engine1.handleLocalInsert('chapter-1', 0, '春はあけぼの。');

      // Wait microtask transmission
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(engine2.getChapterText('chapter-1')).toBe('春はあけぼの。');

      // Peer 2 inserts at index 7 (after '。'): 'やうやう白くなりゆく'
      engine2.handleLocalInsert('chapter-1', 7, 'やうやう白くなりゆく');

      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(engine1.getChapterText('chapter-1')).toBe(engine2.getChapterText('chapter-1'));
      expect(engine1.getChapterText('chapter-1')).toBe('春はあけぼの。やうやう白くなりゆく');
    });

    it('synchronizes deletions across peers', async () => {
      const bus = 'text-bus-2';
      const t1 = new InMemoryVirtualTransport(bus);
      const t2 = new InMemoryVirtualTransport(bus);

      const engine1 = new TextCrdtEngine('peer-1', '執筆者A', '#38bdf8', t1);
      const engine2 = new TextCrdtEngine('peer-2', '執筆者B', '#f59e0b', t2);

      // Peer 1 types
      engine1.handleLocalInsert('ch-del', 0, 'こんにちは世界');
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Peer 1 deletes '世界' (index 5, length 2)
      engine1.handleLocalDelete('ch-del', 5, 2);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(engine2.getChapterText('ch-del')).toBe('こんにちは');
      expect(engine1.getChapterText('ch-del')).toBe('こんにちは');
    });

    it('broadcasts and updates remote cursor presence', async () => {
      const bus = 'text-bus-3';
      const t1 = new InMemoryVirtualTransport(bus);
      const t2 = new InMemoryVirtualTransport(bus);

      const engine1 = new TextCrdtEngine('peer-1', '執筆者A', '#38bdf8', t1);
      const engine2 = new TextCrdtEngine('peer-2', '執筆者B', '#f59e0b', t2);

      let cursorNotified = false;
      engine2.onRemoteCursorChange((cursors) => {
        if (cursors.some((c) => c.peerId === 'peer-1')) {
          cursorNotified = true;
        }
      });

      engine1.broadcastCursor('chapter-1', 12, 18);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(cursorNotified).toBe(true);
      const cursors = engine2.getRemoteCursors('chapter-1');
      expect(cursors.length).toBe(1);
      expect(cursors[0].peerName).toBe('執筆者A');
      expect(cursors[0].from).toBe(12);
      expect(cursors[0].to).toBe(18);
    });

    it('supports full state handshake via requestChapterSync', async () => {
      const bus = 'text-bus-4';
      const t1 = new InMemoryVirtualTransport(bus);
      const t2 = new InMemoryVirtualTransport(bus);

      const engine1 = new TextCrdtEngine('peer-1', '執筆者A', '#38bdf8', t1);
      // Peer 1 writes text prior to Peer 2 joining
      engine1.handleLocalInsert('ch-sync', 0, '祇園精舎の鐘の声');

      // Peer 2 joins later and requests sync
      const engine2 = new TextCrdtEngine('peer-2', '執筆者B', '#f59e0b', t2);
      engine2.requestChapterSync('ch-sync');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(engine2.getChapterText('ch-sync')).toBe('祇園精舎の鐘の声');
    });

    it('converges even when messages arrive in reverse or out-of-order', async () => {
      const crdtA = new ChapterTextCrdt('ch-order', 'peer-a', '12345');
      const crdtB = new ChapterTextCrdt('ch-order', 'peer-b', '12345');

      // Peer A inserts 'X', 'Y'
      const nodesA1 = crdtA.insertAt(2, 'X');
      const nodesA2 = crdtA.insertAt(3, 'Y');

      // Peer B receives in REVERSE order: nodesA2 then nodesA1
      crdtB.applyRemoteInsert(nodesA2);
      crdtB.applyRemoteInsert(nodesA1);

      expect(crdtB.getText()).toBe(crdtA.getText());
      expect(crdtB.getText()).toBe('12XY345');
    });

    it('handles concurrent overlapping deletions gracefully without corruption', () => {
      const crdtA = new ChapterTextCrdt('ch-overlap', 'peer-a', 'あいうえお');
      const crdtB = new ChapterTextCrdt('ch-overlap', 'peer-b', 'あいうえお');

      // Peer A deletes 'いう' (index 1, length 2)
      const delA = crdtA.deleteAt(1, 2);

      // Peer B deletes 'うえ' (index 2, length 2)
      const delB = crdtB.deleteAt(2, 2);

      // Cross-apply deletions
      crdtA.applyRemoteDelete(delB);
      crdtB.applyRemoteDelete(delA);

      // Both should have 'あお'
      expect(crdtA.getText()).toBe(crdtB.getText());
      expect(crdtA.getText()).toBe('あお');
    });
  });
});
