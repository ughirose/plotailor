/**
 * P2PCrdtSyncEngine - P2P/WebRTCローカル共同編集CRDT競合解消エンジン
 *
 * サーバーレス環境において、複数ブラウザ間で設定棚（Lore）・伏線タイムラインの
 * 同時編集を競合フリーで同期する LWW-Element-Set (Last-Write-Wins) および
 * ベクタークロックベースの CRDT 同期エンジン。
 * BroadcastChannel / WebRTC DataChannel を抽象化したトランスポートアダプターを備え、
 * 一時的切断・オフライン編集後の再接続時における状態の強整合性収束（Strong Eventual Consistency）を保証する。
 */

export interface VectorClock {
  [peerId: string]: number;
}

export interface CrdtRecord<T = any> {
  id: string;
  value: T;
  timestamp: number; // LWW 用ミリ秒タイムスタンプ
  peerId: string;
  isDeleted: boolean;
  version: number;
}

export type CrdtMessageType = 'SYNC_STEP_1' | 'SYNC_STEP_2' | 'UPDATE';

export interface CrdtMessage<T = any> {
  type: CrdtMessageType;
  senderPeerId: string;
  clock: VectorClock;
  records?: CrdtRecord<T>[];
  sequenceNumber: number;
}

export interface P2PTransportAdapter {
  send(message: CrdtMessage): void;
  onMessage(callback: (message: CrdtMessage) => void): void;
  close(): void;
}

/**
 * 複数の P2PTransportAdapter を束ねて透過的に送受信する複合トランスポート
 */
export class MultiTransportAdapter implements P2PTransportAdapter {
  private adapters: Set<P2PTransportAdapter> = new Set();
  private messageCallback?: (message: CrdtMessage) => void;

  constructor(initialAdapters: P2PTransportAdapter[] = []) {
    for (const a of initialAdapters) {
      this.addAdapter(a);
    }
  }

  public addAdapter(adapter: P2PTransportAdapter): void {
    if (this.adapters.has(adapter)) return;
    this.adapters.add(adapter);
    adapter.onMessage((msg) => {
      if (this.messageCallback) {
        this.messageCallback(msg);
      }
    });
  }

  public removeAdapter(adapter: P2PTransportAdapter): void {
    this.adapters.delete(adapter);
  }

  public getAdapters(): P2PTransportAdapter[] {
    return Array.from(this.adapters);
  }

  public send(message: CrdtMessage): void {
    for (const a of this.adapters) {
      try {
        a.send(message);
      } catch (err) {
        console.warn('[MultiTransportAdapter] Failed to send via adapter:', err);
      }
    }
  }

  public onMessage(callback: (message: CrdtMessage) => void): void {
    this.messageCallback = callback;
    for (const a of this.adapters) {
      a.onMessage((msg) => {
        if (this.messageCallback) {
          this.messageCallback(msg);
        }
      });
    }
  }

  public close(): void {
    for (const a of this.adapters) {
      try {
        a.close();
      } catch {}
    }
    this.adapters.clear();
  }
}

/**
 * BroadcastChannel を用いた同一マシン／ブラウザ内タブ間 P2P トランスポート
 */
export class BroadcastTransportAdapter implements P2PTransportAdapter {
  private channel?: BroadcastChannel;
  private messageCallback?: (message: CrdtMessage) => void;

  constructor(channelName: string) {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = (event) => {
          if (this.messageCallback && event.data) {
            this.messageCallback(event.data);
          }
        };
      } catch {
        // Fallback for non-supported environments
      }
    }
  }

  public send(message: CrdtMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch (err) {
        console.warn('Failed to broadcast message:', err);
      }
    }
  }

  public onMessage(callback: (message: CrdtMessage) => void): void {
    this.messageCallback = callback;
  }

  public close(): void {
    this.channel?.close();
  }
}

/**
 * インメモリ仮想 P2P トランスポート（テストおよびモック用）
 */
export class InMemoryVirtualTransport implements P2PTransportAdapter {
  private static buses: Map<string, InMemoryVirtualTransport[]> = new Map();
  private busName: string;
  private messageCallback?: (message: CrdtMessage) => void;

  constructor(busName: string) {
    this.busName = busName;
    const list = InMemoryVirtualTransport.buses.get(busName) || [];
    list.push(this);
    InMemoryVirtualTransport.buses.set(busName, list);
  }

  public send(message: CrdtMessage): void {
    const peers = InMemoryVirtualTransport.buses.get(this.busName) || [];
    for (const peer of peers) {
      if (peer !== this && peer.messageCallback) {
        // 非同期配信をシミュレート
        queueMicrotask(() => {
          peer.messageCallback?.(JSON.parse(JSON.stringify(message)));
        });
      }
    }
  }

  public onMessage(callback: (message: CrdtMessage) => void): void {
    this.messageCallback = callback;
  }

  public close(): void {
    const list = InMemoryVirtualTransport.buses.get(this.busName) || [];
    const filtered = list.filter((p) => p !== this);
    InMemoryVirtualTransport.buses.set(this.busName, filtered);
  }

  public static reset(): void {
    this.buses.clear();
  }
}

export class P2PCrdtSyncEngine<T extends { id: string } = any> {
  private peerId: string;
  private clock: VectorClock = {};
  private records: Map<string, CrdtRecord<T>> = new Map();
  private transport?: P2PTransportAdapter;
  private sequenceCounter = 0;
  private changeListeners: Array<(activeEntities: T[]) => void> = [];

  constructor(peerId: string, transport?: P2PTransportAdapter) {
    this.peerId = peerId;
    this.clock[peerId] = 0;
    this.transport = transport;

    if (this.transport) {
      this.transport.onMessage((msg) => this.handleIncomingMessage(msg));
    }
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public getVectorClock(): VectorClock {
    return { ...this.clock };
  }

  public addChangeListener(listener: (activeEntities: T[]) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  /**
   * エンティティのローカル追加または更新 (LWW)
   */
  public set(value: T): CrdtRecord<T> {
    const id = value.id;
    this.clock[this.peerId] = (this.clock[this.peerId] || 0) + 1;
    this.sequenceCounter += 1;

    const existing = this.records.get(id);
    const version = (existing?.version || 0) + 1;

    const record: CrdtRecord<T> = {
      id,
      value: { ...value },
      timestamp: Date.now(),
      peerId: this.peerId,
      isDeleted: false,
      version,
    };

    this.records.set(id, record);
    this.broadcastUpdate([record]);
    this.notifyChange();
    return record;
  }

  /**
   * エンティティのローカル論理削除 (Tombstone)
   */
  public delete(id: string): boolean {
    const existing = this.records.get(id);
    if (!existing || existing.isDeleted) {
      return false;
    }

    this.clock[this.peerId] = (this.clock[this.peerId] || 0) + 1;
    this.sequenceCounter += 1;

    const record: CrdtRecord<T> = {
      id,
      value: existing.value,
      timestamp: Date.now(),
      peerId: this.peerId,
      isDeleted: true,
      version: existing.version + 1,
    };

    this.records.set(id, record);
    this.broadcastUpdate([record]);
    this.notifyChange();
    return true;
  }

  public get(id: string): T | undefined {
    const r = this.records.get(id);
    return r && !r.isDeleted ? r.value : undefined;
  }

  public getAll(): T[] {
    const active: T[] = [];
    for (const r of this.records.values()) {
      if (!r.isDeleted) {
        active.push(r.value);
      }
    }
    return active;
  }

  /**
   * リモートからの差分レコードを LWW (Last-Write-Wins) 競合解消でマージ
   */
  public mergeRecords(remoteRecords: CrdtRecord<T>[]): boolean {
    let hasUpdated = false;

    for (const remote of remoteRecords) {
      if (!remote || !remote.id) continue;

      const local = this.records.get(remote.id);
      if (!local) {
        // 新規レコードの受入
        this.records.set(remote.id, { ...remote });
        hasUpdated = true;
        continue;
      }

      // 競合解消規則 (LWW: タイムスタンプ優先、同値時は peerId の辞書順)
      if (remote.timestamp > local.timestamp) {
        this.records.set(remote.id, { ...remote });
        hasUpdated = true;
      } else if (remote.timestamp === local.timestamp) {
        if (remote.version > local.version) {
          this.records.set(remote.id, { ...remote });
          hasUpdated = true;
        } else if (remote.version === local.version && remote.peerId > local.peerId) {
          this.records.set(remote.id, { ...remote });
          hasUpdated = true;
        }
      }
    }

    if (hasUpdated) {
      this.notifyChange();
    }
    return hasUpdated;
  }

  /**
   * 再接続時の同期ハンドシェイク開始 (Step 1: 自身のベクタークロックを送出)
   */
  public initiateSync(): void {
    if (!this.transport) return;
    this.sequenceCounter += 1;
    this.transport.send({
      type: 'SYNC_STEP_1',
      senderPeerId: this.peerId,
      clock: this.getVectorClock(),
      sequenceNumber: this.sequenceCounter,
    });
  }

  /**
   * 受信メッセージのディスパッチ
   */
  public handleIncomingMessage(msg: CrdtMessage<T>): void {
    if (!msg || msg.senderPeerId === this.peerId) return;

    // ベクタークロックの同期更新
    for (const [peer, count] of Object.entries(msg.clock || {})) {
      this.clock[peer] = Math.max(this.clock[peer] || 0, count);
    }

    if (msg.type === 'SYNC_STEP_1') {
      // 全レコードを応答として送出 (Step 2)
      this.sequenceCounter += 1;
      this.transport?.send({
        type: 'SYNC_STEP_2',
        senderPeerId: this.peerId,
        clock: this.getVectorClock(),
        records: Array.from(this.records.values()),
        sequenceNumber: this.sequenceCounter,
      });
    } else if (msg.type === 'SYNC_STEP_2' || msg.type === 'UPDATE') {
      if (msg.records && msg.records.length > 0) {
        this.mergeRecords(msg.records);
      }
    }
  }

  private broadcastUpdate(records: CrdtRecord<T>[]): void {
    if (!this.transport) return;
    this.transport.send({
      type: 'UPDATE',
      senderPeerId: this.peerId,
      clock: this.getVectorClock(),
      records,
      sequenceNumber: this.sequenceCounter,
    });
  }

  private notifyChange(): void {
    const active = this.getAll();
    for (const listener of this.changeListeners) {
      listener(active);
    }
  }
}
