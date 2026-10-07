import { describe, it, expect, beforeEach } from 'vitest';
import {
  P2PCrdtSyncEngine,
  InMemoryVirtualTransport,
} from '../src/core/collab/P2PCrdtSyncEngine.js';

interface TestLore {
  id: string;
  name: string;
  desc: string;
}

describe('P2PCrdtSyncEngine', () => {
  beforeEach(() => {
    InMemoryVirtualTransport.reset();
  });

  it('performs local CRUD operations with tombstones', () => {
    const engine = new P2PCrdtSyncEngine<TestLore>('peer-1');
    engine.set({ id: 'lore-1', name: '魔導書', desc: '古代の書物' });

    expect(engine.get('lore-1')?.name).toBe('魔導書');
    expect(engine.getAll().length).toBe(1);

    // Delete
    const deleted = engine.delete('lore-1');
    expect(deleted).toBe(true);
    expect(engine.get('lore-1')).toBeUndefined();
    expect(engine.getAll().length).toBe(0);
  });

  it('synchronizes updates in real-time across multiple virtual peers', async () => {
    const t1 = new InMemoryVirtualTransport('bus-room-1');
    const t2 = new InMemoryVirtualTransport('bus-room-1');

    const peer1 = new P2PCrdtSyncEngine<TestLore>('peer-1', t1);
    const peer2 = new P2PCrdtSyncEngine<TestLore>('peer-2', t2);

    peer1.set({ id: 'item-1', name: '賢者の石', desc: '赤き石' });

    // Wait for microtask broadcast
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(peer2.get('item-1')?.name).toBe('賢者の石');
    expect(peer2.getAll().length).toBe(1);
  });

  it('resolves conflicts deterministically using Last-Write-Wins (LWW)', () => {
    const peer1 = new P2PCrdtSyncEngine<TestLore>('peer-1');
    const peer2 = new P2PCrdtSyncEngine<TestLore>('peer-2');

    const olderTime = 1000;
    const newerTime = 2000;

    peer1.mergeRecords([
      {
        id: 'lore-conflict',
        value: { id: 'lore-conflict', name: '古い名称', desc: '' },
        timestamp: olderTime,
        peerId: 'peer-1',
        isDeleted: false,
        version: 1,
      },
    ]);

    peer1.mergeRecords([
      {
        id: 'lore-conflict',
        value: { id: 'lore-conflict', name: '新しい名称', desc: '' },
        timestamp: newerTime,
        peerId: 'peer-2',
        isDeleted: false,
        version: 2,
      },
    ]);

    expect(peer1.get('lore-conflict')?.name).toBe('新しい名称');
  });

  it('converges state after offline disconnection and re-handshake (initiateSync)', async () => {
    const t1 = new InMemoryVirtualTransport('bus-room-2');
    const t2 = new InMemoryVirtualTransport('bus-room-2');

    const peer1 = new P2PCrdtSyncEngine<TestLore>('peer-1', t1);
    const peer2 = new P2PCrdtSyncEngine<TestLore>('peer-2', t2);

    // Peer 1 edits while peer 2 is temporarily offline/unwired
    peer1.set({ id: 'item-a', name: '聖剣', desc: '光の剣' });

    // Simulate reconnection handshake
    peer2.initiateSync();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(peer2.get('item-a')?.name).toBe('聖剣');
  });

  it('triggers registered change listeners on local and remote updates', async () => {
    const t1 = new InMemoryVirtualTransport('bus-room-3');
    const t2 = new InMemoryVirtualTransport('bus-room-3');

    const peer1 = new P2PCrdtSyncEngine<TestLore>('peer-1', t1);
    const peer2 = new P2PCrdtSyncEngine<TestLore>('peer-2', t2);

    let notifyCount = 0;
    peer2.addChangeListener((active) => {
      notifyCount += 1;
      expect(active.length).toBe(1);
    });

    peer1.set({ id: 'item-notify', name: '通知アイテム', desc: '' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(notifyCount).toBe(1);
  });
});
