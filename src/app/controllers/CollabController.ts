import {
  P2PCrdtSyncEngine,
  type P2PTransportAdapter,
  type CrdtMessage,
  BroadcastTransportAdapter,
  MultiTransportAdapter,
} from '../../core/collab/P2PCrdtSyncEngine.js';
import {
  WebRtcTransportAdapter,
  type WebRtcConnectionState,
} from '../../core/collab/WebRtcTransportAdapter.js';
import { TextCrdtEngine } from '../../core/collab/TextCrdtEngine.js';
import type { LoreEntity, LoreEntityManager } from '../../core/lore/LoreEntityManager.js';

export interface CollabPeerInfo {
  peerId: string;
  peerName: string;
  color: string;
  joinedAt: number;
  lastHeartbeat: number;
}

export interface CollabPresenceMessage {
  type: 'PRESENCE_JOIN' | 'PRESENCE_HEARTBEAT' | 'PRESENCE_LEAVE';
  senderPeerId: string;
  peerName: string;
  color: string;
  timestamp: number;
}

export interface CollabControllerDependencies {
  getLoreManager: () => LoreEntityManager;
  getCurrentProjectId: () => string;
  onRemoteLoreUpdate?: () => void;
  showToast?: (msg: string) => void;
  customTransport?: P2PTransportAdapter;
  peerId?: string;
  peerName?: string;
  peerColor?: string;
}

const PEER_COLORS = [
  '#38bdf8', // sky
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#a855f7', // purple
  '#f97316', // orange
];

export class CollabController {
  private deps: CollabControllerDependencies;
  private crdtEngine!: P2PCrdtSyncEngine<LoreEntity>;
  private textCrdtEngine!: TextCrdtEngine;
  private multiTransport!: MultiTransportAdapter;
  private broadcastTransport?: BroadcastTransportAdapter;
  private webrtcTransport?: WebRtcTransportAdapter;
  private peerId: string;
  private peerName: string;
  private peerColor: string;
  private currentRoomId: string = '';
  private isConnected: boolean = false;
  private activePeers: Map<string, CollabPeerInfo> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribeCrdt?: () => void;

  // DOM Elements
  private btnCollabBadge: HTMLElement | null = null;
  private collabPeerCount: HTMLElement | null = null;
  private collabModal: HTMLElement | null = null;
  private btnCloseCollabModal: HTMLElement | null = null;
  private collabRoomInput: HTMLInputElement | null = null;
  private collabNameInput: HTMLInputElement | null = null;
  private btnToggleCollabConnect: HTMLButtonElement | null = null;
  private collabStatusText: HTMLElement | null = null;
  private collabPeerList: HTMLElement | null = null;

  // WebRTC Signaling DOM Elements
  private btnGenerateInviteCode: HTMLButtonElement | null = null;
  private collabInviteCodeArea: HTMLTextAreaElement | null = null;
  private btnAcceptAnswerCode: HTMLButtonElement | null = null;
  private collabAnswerInputArea: HTMLTextAreaElement | null = null;
  private collabJoinOfferArea: HTMLTextAreaElement | null = null;
  private btnGenerateAnswerCode: HTMLButtonElement | null = null;
  private collabGeneratedAnswerArea: HTMLTextAreaElement | null = null;
  private webrtcStatusIndicator: HTMLElement | null = null;

  constructor(deps: CollabControllerDependencies) {
    this.deps = deps;
    this.peerId = deps.peerId || this.generatePeerId();
    this.peerName = deps.peerName || this.loadSavedPeerName() || `執筆者_${this.peerId.slice(-4)}`;
    this.peerColor = deps.peerColor || PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];

    this.bindDom();
    this.initTransportAndEngine();
  }

  private generatePeerId(): string {
    return 'peer_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
  }

  private loadSavedPeerName(): string | null {
    try {
      return localStorage.getItem('plotailor_collab_peer_name');
    } catch {
      return null;
    }
  }

  private savePeerName(name: string): void {
    try {
      localStorage.setItem('plotailor_collab_peer_name', name);
    } catch {}
  }

  private bindDom(): void {
    this.btnCollabBadge = document.getElementById('btnCollabBadge');
    this.collabPeerCount = document.getElementById('collabPeerCount');
    this.collabModal = document.getElementById('collabModal');
    this.btnCloseCollabModal = document.getElementById('btnCloseCollabModal');
    this.collabRoomInput = document.getElementById('collabRoomInput') as HTMLInputElement | null;
    this.collabNameInput = document.getElementById('collabNameInput') as HTMLInputElement | null;
    this.btnToggleCollabConnect = document.getElementById('btnToggleCollabConnect') as HTMLButtonElement | null;
    this.collabStatusText = document.getElementById('collabStatusText');
    this.collabPeerList = document.getElementById('collabPeerList');

    // WebRTC Signaling DOM
    this.btnGenerateInviteCode = document.getElementById('btnGenerateInviteCode') as HTMLButtonElement | null;
    this.collabInviteCodeArea = document.getElementById('collabInviteCodeArea') as HTMLTextAreaElement | null;
    this.btnAcceptAnswerCode = document.getElementById('btnAcceptAnswerCode') as HTMLButtonElement | null;
    this.collabAnswerInputArea = document.getElementById('collabAnswerInputArea') as HTMLTextAreaElement | null;
    this.collabJoinOfferArea = document.getElementById('collabJoinOfferArea') as HTMLTextAreaElement | null;
    this.btnGenerateAnswerCode = document.getElementById('btnGenerateAnswerCode') as HTMLButtonElement | null;
    this.collabGeneratedAnswerArea = document.getElementById('collabGeneratedAnswerArea') as HTMLTextAreaElement | null;
    this.webrtcStatusIndicator = document.getElementById('webrtcStatusIndicator');

    if (this.btnCollabBadge) {
      this.btnCollabBadge.addEventListener('click', () => this.openModal());
    }

    if (this.btnCloseCollabModal) {
      this.btnCloseCollabModal.addEventListener('click', () => this.closeModal());
    }

    if (this.collabModal) {
      this.collabModal.addEventListener('click', (e) => {
        if (e.target === this.collabModal) {
          this.closeModal();
        }
      });
    }

    if (this.btnToggleCollabConnect) {
      this.btnToggleCollabConnect.addEventListener('click', () => {
        if (this.isConnected) {
          this.disconnect();
        } else {
          const room = this.collabRoomInput?.value.trim() || `plotailor-room-${this.deps.getCurrentProjectId()}`;
          const name = this.collabNameInput?.value.trim() || this.peerName;
          this.setPeerName(name);
          this.connect(room);
        }
      });
    }

    // WebRTC Host: Generate Invite Code
    if (this.btnGenerateInviteCode) {
      this.btnGenerateInviteCode.addEventListener('click', async () => {
        await this.handleHostCreateInvite();
      });
    }

    // WebRTC Host: Accept Guest Answer
    if (this.btnAcceptAnswerCode) {
      this.btnAcceptAnswerCode.addEventListener('click', async () => {
        await this.handleHostAcceptAnswer();
      });
    }

    // WebRTC Guest: Accept Offer & Generate Answer
    if (this.btnGenerateAnswerCode) {
      this.btnGenerateAnswerCode.addEventListener('click', async () => {
        await this.handleGuestCreateAnswer();
      });
    }

    // WebRTC Sub-Tabs (Host vs Guest UI Separation)
    const btnTabHost = document.getElementById('btnTabCollabHost');
    const btnTabGuest = document.getElementById('btnTabCollabGuest');
    const panelHost = document.getElementById('collabHostPanel');
    const panelGuest = document.getElementById('collabGuestPanel');

    btnTabHost?.addEventListener('click', () => {
      btnTabHost.classList.add('active');
      btnTabHost.style.fontWeight = '600';
      btnTabGuest?.classList.remove('active');
      if (btnTabGuest) btnTabGuest.style.fontWeight = '500';
      if (panelHost) panelHost.style.display = 'flex';
      if (panelGuest) panelGuest.style.display = 'none';
    });

    btnTabGuest?.addEventListener('click', () => {
      btnTabGuest.classList.add('active');
      btnTabGuest.style.fontWeight = '600';
      btnTabHost?.classList.remove('active');
      if (btnTabHost) btnTabHost.style.fontWeight = '500';
      if (panelGuest) panelGuest.style.display = 'flex';
      if (panelHost) panelHost.style.display = 'none';
    });
  }

  private initTransportAndEngine(): void {
    const projectId = this.deps.getCurrentProjectId();
    this.currentRoomId = `plotailor-room-${projectId}`;
    if (this.collabRoomInput) {
      this.collabRoomInput.value = this.currentRoomId;
    }
    if (this.collabNameInput) {
      this.collabNameInput.value = this.peerName;
    }

    if (this.deps.customTransport) {
      this.multiTransport = new MultiTransportAdapter([this.deps.customTransport]);
    } else {
      this.broadcastTransport = new BroadcastTransportAdapter(this.currentRoomId);
      this.webrtcTransport = new WebRtcTransportAdapter();
      this.setupWebRtcStateListener();
      this.multiTransport = new MultiTransportAdapter([this.broadcastTransport, this.webrtcTransport]);
    }

    this.crdtEngine = new P2PCrdtSyncEngine<LoreEntity>(this.peerId);
    (this.crdtEngine as any).transport = this.multiTransport;

    this.textCrdtEngine = new TextCrdtEngine(
      this.peerId,
      this.peerName,
      this.peerColor,
      this.multiTransport
    );

    this.setupTransportListeners();

    this.unsubscribeCrdt = this.crdtEngine.addChangeListener((activeEntities) => {
      this.handleCrdtUpdate(activeEntities);
    });

    // Populate initial local entities into CRDT engine
    this.populateLocalLoreToCrdt();
  }

  public getTextCrdtEngine(): TextCrdtEngine {
    return this.textCrdtEngine;
  }

  private setupWebRtcStateListener(): void {
    if (!this.webrtcTransport) return;
    this.webrtcTransport.onConnectionStateChange((state: WebRtcConnectionState) => {
      this.updateWebRtcStatusUi(state);
      if (state === 'connected') {
        if (!this.isConnected) {
          this.connect();
        } else {
          this.broadcastPresence('PRESENCE_JOIN');
          this.crdtEngine.initiateSync();
        }
        if (this.deps.showToast) {
          this.deps.showToast('🌐 遠隔ピアと WebRTC P2P 接続が確立しました！');
        }
      } else if (state === 'failed' || state === 'disconnected') {
        if (this.deps.showToast) {
          this.deps.showToast(`⚠️ WebRTC 接続状態: ${state}`);
        }
      }
    });
  }

  private setupTransportListeners(): void {
    this.multiTransport.onMessage((msg: CrdtMessage | CollabPresenceMessage | any) => {
      if (!msg) return;

      // Handle Presence Messages
      if ('type' in msg && typeof msg.type === 'string' && msg.type.startsWith('PRESENCE_')) {
        this.handlePresenceMessage(msg as CollabPresenceMessage);
        return;
      }

      // Handle Text CRDT Messages
      if ('type' in msg && typeof msg.type === 'string' && msg.type.startsWith('TEXT_')) {
        this.textCrdtEngine.handleIncomingMessage(msg);
        return;
      }

      // Handle Lore CRDT Messages
      this.crdtEngine.handleIncomingMessage(msg as CrdtMessage<LoreEntity>);
    });
  }

  public connect(roomId?: string): void {
    if (roomId && roomId !== this.currentRoomId) {
      this.currentRoomId = roomId;
      if (!this.deps.customTransport && this.broadcastTransport) {
        this.multiTransport.removeAdapter(this.broadcastTransport);
        this.broadcastTransport.close();
        this.broadcastTransport = new BroadcastTransportAdapter(this.currentRoomId);
        this.multiTransport.addAdapter(this.broadcastTransport);
      }
    }

    this.isConnected = true;
    this.activePeers.clear();

    // Broadcast JOIN
    this.broadcastPresence('PRESENCE_JOIN');

    // Initiate CRDT Sync
    this.crdtEngine.initiateSync();

    // Start Heartbeat (every 3000ms)
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.broadcastPresence('PRESENCE_HEARTBEAT');
      }
    }, 3000);

    // Start Dead Peer Cleanup (every 4000ms)
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.cleanupInterval = setInterval(() => {
      this.cleanupStalePeers();
    }, 4000);

    this.updateUi();
    if (this.deps.showToast) {
      this.deps.showToast(`👥 共同編集ルーム「${this.currentRoomId}」に接続しました`);
    }
  }

  public disconnect(): void {
    if (this.isConnected) {
      this.broadcastPresence('PRESENCE_LEAVE');
    }

    this.isConnected = false;
    this.activePeers.clear();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.updateUi();
    if (this.deps.showToast) {
      this.deps.showToast('👥 共同編集を切断しました');
    }
  }

  public setPeerName(name: string): void {
    this.peerName = name;
    this.savePeerName(name);
    if (this.isConnected) {
      this.broadcastPresence('PRESENCE_HEARTBEAT');
    }
    this.updateUi();
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public getPeerName(): string {
    return this.peerName;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getActivePeers(): CollabPeerInfo[] {
    return Array.from(this.activePeers.values());
  }

  public getActivePeerCount(): number {
    return this.isConnected ? this.activePeers.size + 1 : 0; // +1 includes self
  }

  public broadcastLocalLoreSave(entity: LoreEntity): void {
    if (!this.isConnected) return;
    this.crdtEngine.set(entity);
  }

  public broadcastLocalLoreDelete(entityId: string): void {
    if (!this.isConnected) return;
    this.crdtEngine.delete(entityId);
  }

  private populateLocalLoreToCrdt(): void {
    try {
      const loreManager = this.deps.getLoreManager();
      const allEntities = loreManager.getEntities();
      for (const entity of allEntities) {
        this.crdtEngine.set(entity);
      }
    } catch (e) {
      console.warn('Failed to populate local lore to CRDT:', e);
    }
  }

  private handleCrdtUpdate(activeEntities: LoreEntity[]): void {
    try {
      const loreManager = this.deps.getLoreManager();
      let hasChange = false;

      // Update or add incoming entities
      for (const remote of activeEntities) {
        const local = loreManager.getEntity(remote.id);
        if (!local) {
          loreManager.createEntity(remote);
          hasChange = true;
        } else if (JSON.stringify(local) !== JSON.stringify(remote)) {
          loreManager.updateEntity(remote.id, remote);
          hasChange = true;
        }
      }

      // Check for remote deletions (tombstones)
      const remoteIds = new Set(activeEntities.map((e) => e.id));
      const localEntities = loreManager.getEntities();
      for (const local of localEntities) {
        if (!remoteIds.has(local.id)) {
          const crdtRecord = (this.crdtEngine as any).records?.get(local.id);
          if (crdtRecord && crdtRecord.isDeleted) {
            loreManager.deleteEntity(local.id);
            hasChange = true;
          }
        }
      }

      if (hasChange && this.deps.onRemoteLoreUpdate) {
        this.deps.onRemoteLoreUpdate();
      }
    } catch (err) {
      console.warn('Error handling CRDT update in LoreController:', err);
    }
  }

  private broadcastPresence(type: CollabPresenceMessage['type']): void {
    const msg: CollabPresenceMessage = {
      type,
      senderPeerId: this.peerId,
      peerName: this.peerName,
      color: this.peerColor,
      timestamp: Date.now(),
    };

    try {
      this.multiTransport.send(msg as any);
    } catch (err) {
      console.warn('Failed to send presence message:', err);
    }
  }

  private handlePresenceMessage(msg: CollabPresenceMessage): void {
    if (!msg || msg.senderPeerId === this.peerId) return;

    if (msg.type === 'PRESENCE_JOIN') {
      this.activePeers.set(msg.senderPeerId, {
        peerId: msg.senderPeerId,
        peerName: msg.peerName,
        color: msg.color,
        joinedAt: msg.timestamp,
        lastHeartbeat: msg.timestamp,
      });

      // Respond with our presence so the new peer learns about us immediately
      if (this.isConnected) {
        this.broadcastPresence('PRESENCE_HEARTBEAT');
      }
      this.updateUi();
    } else if (msg.type === 'PRESENCE_HEARTBEAT') {
      const existing = this.activePeers.get(msg.senderPeerId);
      if (existing) {
        existing.peerName = msg.peerName;
        existing.color = msg.color;
        existing.lastHeartbeat = msg.timestamp;
      } else {
        this.activePeers.set(msg.senderPeerId, {
          peerId: msg.senderPeerId,
          peerName: msg.peerName,
          color: msg.color,
          joinedAt: msg.timestamp,
          lastHeartbeat: msg.timestamp,
        });
      }
      this.updateUi();
    } else if (msg.type === 'PRESENCE_LEAVE') {
      this.activePeers.delete(msg.senderPeerId);
      this.updateUi();
    }
  }

  private cleanupStalePeers(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of this.activePeers.entries()) {
      if (now - peer.lastHeartbeat > 8000) {
        this.activePeers.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.updateUi();
    }
  }

  public openModal(): void {
    if (this.collabModal) {
      this.collabModal.style.display = 'flex';
      if (this.collabRoomInput) {
        this.collabRoomInput.value = this.currentRoomId;
      }
      if (this.collabNameInput) {
        this.collabNameInput.value = this.peerName;
      }
      this.updateUi();
    }
  }

  public closeModal(): void {
    if (this.collabModal) {
      this.collabModal.style.display = 'none';
    }
  }

  private updateUi(): void {
    const count = this.getActivePeerCount();

    // Badge Count
    if (this.collabPeerCount) {
      this.collabPeerCount.textContent = count > 0 ? `${count}` : '0';
    }

    // Badge styling & title
    if (this.btnCollabBadge) {
      if (this.isConnected) {
        this.btnCollabBadge.style.color = '#10b981'; // Active Green
        this.btnCollabBadge.title = `共同編集接続中: 参加ピア ${count}名 (ルーム: ${this.currentRoomId})`;
      } else {
        this.btnCollabBadge.style.color = 'var(--color-text-dim)';
        this.btnCollabBadge.title = '共同編集: 未接続 (クリックで接続設定)';
      }
    }

    // Modal Status Text & Button
    if (this.collabStatusText) {
      this.collabStatusText.textContent = this.isConnected
        ? `🟢 接続中 (${count}名)`
        : '⚪ 未接続';
      this.collabStatusText.style.color = this.isConnected ? '#10b981' : 'var(--color-text-dim)';
    }

    if (this.btnToggleCollabConnect) {
      this.btnToggleCollabConnect.textContent = this.isConnected ? '切断' : '接続';
      this.btnToggleCollabConnect.className = this.isConnected ? 'ide-btn ide-btn-danger' : 'ide-btn ide-btn-primary';
    }

    // Peer List DOM in Modal
    if (this.collabPeerList) {
      if (!this.isConnected) {
        this.collabPeerList.innerHTML = `<div style="color: var(--color-text-dim); font-size: 11px; padding: 8px;">未接続です。ルームに接続すると参加ピアが表示されます。</div>`;
        return;
      }

      let html = '';
      // Self
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.03); margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${this.peerColor};"></span>
            <span style="font-weight: 600; font-size: 12px; color: var(--color-text-main);">${this.escapeHtml(this.peerName)} (あなた)</span>
          </div>
          <span style="font-size: 10px; color: #10b981;">ホスト/自分</span>
        </div>
      `;

      // Remote Peers
      for (const peer of this.activePeers.values()) {
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.02); margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${peer.color};"></span>
              <span style="font-size: 12px; color: var(--color-text-main);">${this.escapeHtml(peer.peerName)}</span>
            </div>
            <span style="font-size: 10px; color: var(--color-text-dim);">ピア</span>
          </div>
        `;
      }

      this.collabPeerList.innerHTML = html;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // WebRTC Signaling Handlers
  public async handleHostCreateInvite(): Promise<string | null> {
    if (!this.webrtcTransport) return null;
    try {
      if (this.btnGenerateInviteCode) {
        this.btnGenerateInviteCode.disabled = true;
        this.btnGenerateInviteCode.textContent = '⏳ 発行中...';
      }
      const code = await this.webrtcTransport.generateInviteCode();
      if (this.collabInviteCodeArea) {
        this.collabInviteCodeArea.value = code;
        this.collabInviteCodeArea.select();
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(code);
        } catch {}
      }
      if (this.deps.showToast) {
        this.deps.showToast('📋 招待コードを発行しクリップボードにコピーしました！');
      }
      return code;
    } catch (err) {
      console.error('[CollabController] Failed to generate invite code:', err);
      if (this.deps.showToast) {
        this.deps.showToast(`❌ 招待コード発行失敗: ${(err as Error).message}`);
      }
      return null;
    } finally {
      if (this.btnGenerateInviteCode) {
        this.btnGenerateInviteCode.disabled = false;
        this.btnGenerateInviteCode.textContent = '招待コード発行（コピー）';
      }
    }
  }

  public async handleHostAcceptAnswer(): Promise<boolean> {
    if (!this.webrtcTransport) return false;
    const answerCode = this.collabAnswerInputArea?.value.trim();
    if (!answerCode) {
      if (this.deps.showToast) {
        this.deps.showToast('⚠️ 相手の接続応答コードを入力してください');
      }
      return false;
    }

    try {
      await this.webrtcTransport.acceptAnswer(answerCode);
      if (this.deps.showToast) {
        this.deps.showToast('🔗 接続応答コードを受理しました。P2P 接続を確立中...');
      }
      return true;
    } catch (err) {
      console.error('[CollabController] Failed to accept answer code:', err);
      if (this.deps.showToast) {
        this.deps.showToast(`❌ 接続応答エラー: ${(err as Error).message}`);
      }
      return false;
    }
  }

  public async handleGuestCreateAnswer(): Promise<string | null> {
    if (!this.webrtcTransport) return null;
    const inviteCode = this.collabJoinOfferArea?.value.trim();
    if (!inviteCode) {
      if (this.deps.showToast) {
        this.deps.showToast('⚠️ ホストの招待コードを入力してください');
      }
      return null;
    }

    try {
      if (this.btnGenerateAnswerCode) {
        this.btnGenerateAnswerCode.disabled = true;
        this.btnGenerateAnswerCode.textContent = '⏳ 生成中...';
      }
      const answerCode = await this.webrtcTransport.acceptInviteAndGenerateAnswer(inviteCode);
      if (this.collabGeneratedAnswerArea) {
        this.collabGeneratedAnswerArea.value = answerCode;
        this.collabGeneratedAnswerArea.select();
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(answerCode);
        } catch {}
      }
      if (this.deps.showToast) {
        this.deps.showToast('📋 接続応答コードを生成しクリップボードにコピーしました！ホストに返信してください');
      }
      return answerCode;
    } catch (err) {
      console.error('[CollabController] Failed to accept invite code:', err);
      if (this.deps.showToast) {
        this.deps.showToast(`❌ 招待コード受理失敗: ${(err as Error).message}`);
      }
      return null;
    } finally {
      if (this.btnGenerateAnswerCode) {
        this.btnGenerateAnswerCode.disabled = false;
        this.btnGenerateAnswerCode.textContent = '接続応答コード生成（コピー）';
      }
    }
  }

  private updateWebRtcStatusUi(state: WebRtcConnectionState): void {
    if (!this.webrtcStatusIndicator) return;
    const stateMap: Record<WebRtcConnectionState, { text: string; color: string }> = {
      new: { text: '⚪ 未接続', color: 'var(--color-text-dim)' },
      connecting: { text: '🟡 接続試行中...', color: '#f59e0b' },
      connected: { text: '🟢 P2P接続中', color: '#10b981' },
      disconnected: { text: '🟠 一時切断', color: '#f97316' },
      failed: { text: '🔴 接続失敗', color: '#ef4444' },
      closed: { text: '⚪ 切断済', color: 'var(--color-text-dim)' },
    };
    const s = stateMap[state] || stateMap.new;
    this.webrtcStatusIndicator.textContent = `WebRTC: ${s.text}`;
    this.webrtcStatusIndicator.style.color = s.color;
  }

  public getWebRtcTransport(): WebRtcTransportAdapter | undefined {
    return this.webrtcTransport;
  }

  public getMultiTransport(): MultiTransportAdapter {
    return this.multiTransport;
  }

  public destroy(): void {
    this.disconnect();
    if (this.unsubscribeCrdt) {
      this.unsubscribeCrdt();
    }
    this.multiTransport.close();
  }
}
