// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CollabController } from '../src/app/controllers/CollabController.js';
import { LoreEntityManager, type LoreEntity } from '../src/core/lore/LoreEntityManager.js';
import { InMemoryVirtualTransport } from '../src/core/collab/P2PCrdtSyncEngine.js';

describe('CollabController', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    InMemoryVirtualTransport.reset();
    container = document.createElement('div');
    container.innerHTML = `
      <button id="btnCollabBadge"><span id="collabPeerCount">0</span></button>
      <div id="collabModal" style="display: none;">
        <span id="collabStatusText">⚪ 未接続</span>
        <button id="btnCloseCollabModal">✕</button>
        <input id="collabRoomInput" />
        <input id="collabNameInput" />
        <button id="btnToggleCollabConnect">接続</button>
        <div id="collabPeerList"></div>
        <button id="btnGenerateInviteCode">招待コード発行</button>
        <textarea id="collabInviteCodeArea"></textarea>
        <textarea id="collabJoinOfferArea"></textarea>
        <button id="btnGenerateAnswerCode">応答コード生成</button>
        <textarea id="collabGeneratedAnswerArea"></textarea>
        <textarea id="collabAnswerInputArea"></textarea>
        <button id="btnAcceptAnswerCode">接続確定</button>
        <span id="webrtcStatusIndicator">WebRTC: ⚪ 未接続</span>
      </div>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    InMemoryVirtualTransport.reset();
  });

  it('initializes in disconnected state with badge and modal DOM bindings', () => {
    const loreManager = new LoreEntityManager();
    const ctrl = new CollabController({
      getLoreManager: () => loreManager,
      getCurrentProjectId: () => 'proj-alpha',
    });

    expect(ctrl.getIsConnected()).toBe(false);
    expect(ctrl.getActivePeerCount()).toBe(0);

    const badge = document.getElementById('btnCollabBadge');
    const modal = document.getElementById('collabModal');
    const closeBtn = document.getElementById('btnCloseCollabModal');

    // Click badge to open modal
    badge?.click();
    expect(modal?.style.display).toBe('flex');

    // Click close to hide modal
    closeBtn?.click();
    expect(modal?.style.display).toBe('none');

    ctrl.destroy();
  });

  it('connects to room, broadcasts presence and updates UI badge', () => {
    const loreManager = new LoreEntityManager();
    const transport = new InMemoryVirtualTransport('bus-room-test');
    const ctrl = new CollabController({
      getLoreManager: () => loreManager,
      getCurrentProjectId: () => 'proj-alpha',
      customTransport: transport,
      peerId: 'peer-user-1',
      peerName: 'テスト作者A',
    });

    ctrl.connect('room-alpha');
    expect(ctrl.getIsConnected()).toBe(true);
    expect(ctrl.getActivePeerCount()).toBe(1); // Self only

    const countSpan = document.getElementById('collabPeerCount');
    expect(countSpan?.textContent).toBe('1');

    const statusText = document.getElementById('collabStatusText');
    expect(statusText?.textContent).toContain('接続中');

    ctrl.disconnect();
    expect(ctrl.getIsConnected()).toBe(false);
    expect(countSpan?.textContent).toBe('0');

    ctrl.destroy();
  });

  it('synchronizes presence and peer counts across multiple controllers in same room', async () => {
    const lore1 = new LoreEntityManager();
    const lore2 = new LoreEntityManager();

    const t1 = new InMemoryVirtualTransport('bus-collab-sync');
    const t2 = new InMemoryVirtualTransport('bus-collab-sync');

    const ctrl1 = new CollabController({
      getLoreManager: () => lore1,
      getCurrentProjectId: () => 'proj-sync',
      customTransport: t1,
      peerId: 'peer-1',
      peerName: '執筆者1',
    });

    const ctrl2 = new CollabController({
      getLoreManager: () => lore2,
      getCurrentProjectId: () => 'proj-sync',
      customTransport: t2,
      peerId: 'peer-2',
      peerName: '執筆者2',
    });

    ctrl1.connect('room-shared');
    ctrl2.connect('room-shared');

    // Wait for virtual message propagation
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(ctrl1.getActivePeerCount()).toBe(2);
    expect(ctrl2.getActivePeerCount()).toBe(2);

    const peersOnCtrl1 = ctrl1.getActivePeers();
    expect(peersOnCtrl1.length).toBe(1);
    expect(peersOnCtrl1[0].peerName).toBe('執筆者2');

    // Peer 2 disconnects
    ctrl2.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(ctrl1.getActivePeerCount()).toBe(1);

    ctrl1.destroy();
    ctrl2.destroy();
  });

  it('synchronizes Lore entity updates across controllers via CRDT', async () => {
    const lore1 = new LoreEntityManager();
    const lore2 = new LoreEntityManager();

    const t1 = new InMemoryVirtualTransport('bus-lore-sync');
    const t2 = new InMemoryVirtualTransport('bus-lore-sync');

    let remoteUpdateNotified = false;

    const ctrl1 = new CollabController({
      getLoreManager: () => lore1,
      getCurrentProjectId: () => 'proj-lore',
      customTransport: t1,
      peerId: 'peer-alice',
    });

    const ctrl2 = new CollabController({
      getLoreManager: () => lore2,
      getCurrentProjectId: () => 'proj-lore',
      customTransport: t2,
      peerId: 'peer-bob',
      onRemoteLoreUpdate: () => {
        remoteUpdateNotified = true;
      },
    });

    ctrl1.connect('room-lore');
    ctrl2.connect('room-lore');

    // Alice adds a new lore item
    const newLore: LoreEntity = {
      id: 'lore-artifact-crown',
      name: '星辰の王冠',
      category: 'item',
      description: '古代王朝の王冠',
      status: 'active',
    };

    lore1.createEntity(newLore);
    ctrl1.broadcastLocalLoreSave(newLore);

    await new Promise((resolve) => setTimeout(resolve, 30));

    // Bob should have received it
    const itemOnBob = lore2.getEntity('lore-artifact-crown');
    expect(itemOnBob).toBeDefined();
    expect(itemOnBob?.name).toBe('星辰の王冠');
    expect(remoteUpdateNotified).toBe(true);

    // Alice deletes the lore item
    ctrl1.broadcastLocalLoreDelete('lore-artifact-crown');
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Bob should reflect deletion (tombstone)
    expect(lore2.getEntity('lore-artifact-crown')).toBeUndefined();

    ctrl1.destroy();
    ctrl2.destroy();
  });

  it('coordinates WebRTC manual signaling flow between Host and Guest', async () => {
    // Mock WebRTC globals for this test
    class MockPeerConnection {
      public connectionState = 'new';
      public iceGatheringState = 'complete';
      public localDescription = { type: 'offer', sdp: 'sdp-host' };
      public remoteDescription: any = null;
      public onicecandidate = null;
      public onconnectionstatechange: any = null;
      public ondatachannel = null;
      public createDataChannel() {
        return { readyState: 'open', close: vi.fn(), send: vi.fn() };
      }
      public async createOffer() { return { type: 'offer', sdp: 'sdp-host' }; }
      public async createAnswer() { return { type: 'answer', sdp: 'sdp-guest' }; }
      public async setLocalDescription(d: any) { this.localDescription = d; }
      public async setRemoteDescription(d: any) { this.remoteDescription = d; }
      public async addIceCandidate() {}
      public addEventListener(event: string, handler: any) {
        if (event === 'icegatheringstatechange') handler();
      }
      public removeEventListener() {}
      public close() {}
    }
    (globalThis as any).RTCPeerConnection = MockPeerConnection;
    (globalThis as any).RTCSessionDescription = function (desc: any) { return desc; };
    (globalThis as any).RTCIceCandidate = function (c: any) { return c; };

    const loreHost = new LoreEntityManager();
    const loreGuest = new LoreEntityManager();
    const showToast = vi.fn();

    const hostCtrl = new CollabController({
      getLoreManager: () => loreHost,
      getCurrentProjectId: () => 'proj-webrtc-host',
      showToast,
      peerId: 'peer-host',
    });

    const guestCtrl = new CollabController({
      getLoreManager: () => loreGuest,
      getCurrentProjectId: () => 'proj-webrtc-guest',
      showToast,
      peerId: 'peer-guest',
    });

    // 1. Host creates invite code
    const inviteCode = await hostCtrl.handleHostCreateInvite();
    expect(inviteCode).toBeTruthy();
    expect(typeof inviteCode).toBe('string');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('招待コードを発行'));

    // 2. Guest inputs invite code and generates answer code
    const guestOfferArea = document.getElementById('collabJoinOfferArea') as HTMLTextAreaElement;
    guestOfferArea.value = inviteCode!;

    const answerCode = await guestCtrl.handleGuestCreateAnswer();
    expect(answerCode).toBeTruthy();
    expect(typeof answerCode).toBe('string');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('接続応答コードを生成'));

    // 3. Host inputs answer code and accepts
    const hostAnswerArea = document.getElementById('collabAnswerInputArea') as HTMLTextAreaElement;
    hostAnswerArea.value = answerCode!;

    const accepted = await hostCtrl.handleHostAcceptAnswer();
    expect(accepted).toBe(true);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('接続応答コードを受理'));

    hostCtrl.destroy();
    guestCtrl.destroy();
  });
});
