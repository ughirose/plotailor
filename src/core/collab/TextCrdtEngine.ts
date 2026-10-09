/**
 * TextCrdtEngine - RGA (Replicated Growable Array) ベースの分散テキストCRDTエンジン
 *
 * サーバーレス P2P / WebRTC 環境において、CodeMirror 6 本文テキストの
 * 競合フリー同時編集（Strong Eventual Consistency: 強整合性収束）を実現する。
 * 各文字に Lamport タイムスタンプとピア識別子を付与し、ネットワーク遅延や
 * パケット到着順序の入れ替わりがあっても全ピアで同一のテキストに決定論的に収束する。
 */

import type { P2PTransportAdapter } from './P2PCrdtSyncEngine.js';

export interface CrdtCharNode {
  id: string; // 'peerId:counter'
  originId: string; // 直前の文字ノードID ('root' または 'peerId:counter')
  value: string;
  lamport: number;
  peerId: string;
  isDeleted: boolean;
}

export interface RemoteCursorInfo {
  peerId: string;
  peerName: string;
  color: string;
  chapterId: string;
  from: number;
  to: number;
  updatedAt: number;
}

export type TextCrdtMessageType =
  | 'TEXT_INSERT'
  | 'TEXT_DELETE'
  | 'TEXT_SYNC_REQ'
  | 'TEXT_SYNC_RESP'
  | 'TEXT_CURSOR';

export interface TextCrdtMessage {
  type: TextCrdtMessageType;
  chapterId: string;
  senderPeerId: string;
  nodes?: CrdtCharNode[];
  deletedIds?: string[];
  cursor?: RemoteCursorInfo;
  timestamp: number;
}

export interface LocalTextChange {
  from: number;
  to: number;
  inserted: string;
}

export interface RemoteTextChange {
  chapterId: string;
  from: number;
  to: number;
  text: string;
}

export class ChapterTextCrdt {
  public chapterId: string;
  private peerId: string;
  private lamport: number = 0;
  private counter: number = 0;

  // ダミー先頭ノード
  private static readonly ROOT_ID = 'root';
  private nodes: CrdtCharNode[] = [];
  private nodeMap: Map<string, CrdtCharNode> = new Map();
  private pendingNodes: Map<string, CrdtCharNode[]> = new Map();

  constructor(chapterId: string, peerId: string, initialText: string = '') {
    this.chapterId = chapterId;
    this.peerId = peerId;

    if (initialText.length > 0) {
      let prevId = ChapterTextCrdt.ROOT_ID;
      for (let i = 0; i < initialText.length; i++) {
        const char = initialText[i];
        const id = `init:${i + 1}`;
        const node: CrdtCharNode = {
          id,
          originId: prevId,
          value: char,
          lamport: i + 1,
          peerId: 'init',
          isDeleted: false,
        };
        this.nodes.push(node);
        this.nodeMap.set(id, node);
        prevId = id;
      }
      this.lamport = initialText.length;
    }
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public getLamport(): number {
    return this.lamport;
  }

  /**
   * 現在の可視テキスト（isDeleted === false）を組み立てて返す
   */
  public getText(): string {
    let result = '';
    for (const node of this.nodes) {
      if (!node.isDeleted) {
        result += node.value;
      }
    }
    return result;
  }

  /**
   * 可視テキスト上のインデックスから、その位置の直前にあるノードID（originId）を取得する
   */
  private getOriginIdAt(visibleIndex: number): string {
    if (visibleIndex <= 0) {
      return ChapterTextCrdt.ROOT_ID;
    }

    let count = 0;
    for (const node of this.nodes) {
      if (!node.isDeleted) {
        count++;
        if (count === visibleIndex) {
          return node.id;
        }
      }
    }
    // 末尾の場合
    return this.nodes.length > 0 ? this.nodes[this.nodes.length - 1].id : ChapterTextCrdt.ROOT_ID;
  }

  /**
   * ローカルでの文字挿入操作（複数文字対応）
   */
  public insertAt(index: number, text: string): CrdtCharNode[] {
    if (text.length === 0) return [];

    let originId = this.getOriginIdAt(index);
    const createdNodes: CrdtCharNode[] = [];

    for (let i = 0; i < text.length; i++) {
      this.counter++;
      this.lamport++;
      const char = text[i];
      const id = `${this.peerId}:${this.counter}`;

      const node: CrdtCharNode = {
        id,
        originId,
        value: char,
        lamport: this.lamport,
        peerId: this.peerId,
        isDeleted: false,
      };

      this.insertNodeInternal(node);
      createdNodes.push(node);
      originId = id;
    }

    return createdNodes;
  }

  /**
   * ローカルでの文字削除操作（範囲指定）
   */
  public deleteAt(index: number, length: number): string[] {
    if (length <= 0) return [];

    const deletedIds: string[] = [];
    let count = 0;
    let targetMet = 0;

    for (const node of this.nodes) {
      if (!node.isDeleted) {
        if (count >= index && targetMet < length) {
          node.isDeleted = true;
          deletedIds.push(node.id);
          targetMet++;
        }
        count++;
      }
    }

    return deletedIds;
  }

  /**
   * RGAノードの内部挿入ロジック（決定論的ソート）
   */
  private insertNodeInternal(newNode: CrdtCharNode): number {
    this.nodeMap.set(newNode.id, newNode);

    // 挿入基点（originId）のインデックスを特定
    let originIdx = -1;
    if (newNode.originId !== ChapterTextCrdt.ROOT_ID) {
      originIdx = this.nodes.findIndex((n) => n.id === newNode.originId);
    }

    // originIdxの直後から挿入位置を探索
    let insertIdx = originIdx + 1;

    while (insertIdx < this.nodes.length) {
      const nextNode = this.nodes[insertIdx];

      // 次のノードの基点が originId より手前なら、探索終了
      const nextOriginIdx =
        nextNode.originId === ChapterTextCrdt.ROOT_ID
          ? -1
          : this.nodes.findIndex((n) => n.id === nextNode.originId);

      if (nextOriginIdx < originIdx) {
        break;
      }

      // 同じ基点（originId）を持つノード間の競合解決
      if (nextOriginIdx === originIdx) {
        // Lamportクロックが大きい方を左（手前）に配置
        if (
          newNode.lamport > nextNode.lamport ||
          (newNode.lamport === nextNode.lamport && newNode.peerId > nextNode.peerId)
        ) {
          break;
        }
      }

      insertIdx++;
    }

    this.nodes.splice(insertIdx, 0, newNode);
    return insertIdx;
  }

  /**
   * 単一ノードを挿入し、このノードの到着を待っていたペンディングノードも連鎖解決する
   */
  private resolveNodeAndPending(node: CrdtCharNode, changes: { from: number; text: string }[]): void {
    if (this.nodeMap.has(node.id)) {
      return;
    }

    // 親ノードがまだ到着していない場合はペンディングに保管
    if (node.originId !== ChapterTextCrdt.ROOT_ID && !this.nodeMap.has(node.originId)) {
      const list = this.pendingNodes.get(node.originId) || [];
      list.push(node);
      this.pendingNodes.set(node.originId, list);
      return;
    }

    this.lamport = Math.max(this.lamport, node.lamport) + 1;
    const insertIdx = this.insertNodeInternal(node);

    // 可視テキスト上のインデックス（from）を算出
    let visiblePos = 0;
    for (let i = 0; i < insertIdx; i++) {
      if (!this.nodes[i].isDeleted) {
        visiblePos++;
      }
    }

    changes.push({
      from: visiblePos,
      text: node.value,
    });

    // このノードを親として待っていたペンディングノードを連鎖解決
    const waiting = this.pendingNodes.get(node.id);
    if (waiting && waiting.length > 0) {
      this.pendingNodes.delete(node.id);
      for (const child of waiting) {
        this.resolveNodeAndPending(child, changes);
      }
    }
  }

  /**
   * リモートからの挿入ノード列を適用し、CodeMirrorに適用すべき差分範囲を算出
   */
  public applyRemoteInsert(incomingNodes: CrdtCharNode[]): { from: number; text: string }[] {
    const changes: { from: number; text: string }[] = [];

    for (const node of incomingNodes) {
      this.resolveNodeAndPending(node, changes);
    }

    return changes;
  }

  /**
   * リモートからの削除ID列を適用し、CodeMirrorに適用すべき差分範囲を算出
   */
  public applyRemoteDelete(deletedIds: string[]): { from: number; to: number }[] {
    const changes: { from: number; to: number }[] = [];

    for (const id of deletedIds) {
      const node = this.nodeMap.get(id);
      if (!node || node.isDeleted) {
        continue;
      }

      // 削除前の可視インデックスを算出
      let visiblePos = 0;
      for (const n of this.nodes) {
        if (n.id === id) {
          break;
        }
        if (!n.isDeleted) {
          visiblePos++;
        }
      }

      node.isDeleted = true;
      changes.push({
        from: visiblePos,
        to: visiblePos + 1,
      });
    }

    return changes;
  }

  /**
   * 全ノードのコピーをエクスポート（同期ハンドシェイク用）
   */
  public exportNodes(): CrdtCharNode[] {
    return this.nodes.map((n) => ({ ...n }));
  }

  /**
   * 全ノードをインポート（初期同期・再接続時）
   */
  public importNodes(incomingNodes: CrdtCharNode[]): void {
    for (const node of incomingNodes) {
      const existing = this.nodeMap.get(node.id);
      if (existing) {
        if (node.isDeleted && !existing.isDeleted) {
          existing.isDeleted = true;
        }
      } else {
        this.lamport = Math.max(this.lamport, node.lamport);
        this.insertNodeInternal({ ...node });
      }
    }
  }
}

/**
 * TextCrdtEngine - 複数章のCRDTおよびP2Pトランスポート連携を統括するクラス
 */
export class TextCrdtEngine {
  private peerId: string;
  private peerName: string;
  private peerColor: string;
  private transport?: P2PTransportAdapter;
  private chapterCrdts: Map<string, ChapterTextCrdt> = new Map();
  private remoteCursors: Map<string, RemoteCursorInfo> = new Map();

  private onRemoteDocChangeCallbacks: Array<(change: RemoteTextChange) => void> = [];
  private onRemoteCursorChangeCallbacks: Array<(cursors: RemoteCursorInfo[]) => void> = [];

  constructor(
    peerId: string,
    peerName: string,
    peerColor: string,
    transport?: P2PTransportAdapter
  ) {
    this.peerId = peerId;
    this.peerName = peerName;
    this.peerColor = peerColor;
    this.transport = transport;

    if (this.transport) {
      this.transport.onMessage((msg) => this.handleIncomingMessage(msg));
    }
  }

  public setTransport(transport: P2PTransportAdapter): void {
    this.transport = transport;
    this.transport.onMessage((msg) => this.handleIncomingMessage(msg));
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public getOrCreateChapterCrdt(chapterId: string, initialText: string = ''): ChapterTextCrdt {
    let crdt = this.chapterCrdts.get(chapterId);
    if (!crdt) {
      crdt = new ChapterTextCrdt(chapterId, this.peerId, initialText);
      this.chapterCrdts.set(chapterId, crdt);
    }
    return crdt;
  }

  public getChapterText(chapterId: string): string {
    const crdt = this.chapterCrdts.get(chapterId);
    return crdt ? crdt.getText() : '';
  }

  public onRemoteDocChange(callback: (change: RemoteTextChange) => void): () => void {
    this.onRemoteDocChangeCallbacks.push(callback);
    return () => {
      this.onRemoteDocChangeCallbacks = this.onRemoteDocChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  public onRemoteCursorChange(callback: (cursors: RemoteCursorInfo[]) => void): () => void {
    this.onRemoteCursorChangeCallbacks.push(callback);
    return () => {
      this.onRemoteCursorChangeCallbacks = this.onRemoteCursorChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * ローカルでのテキスト挿入（CodeMirrorからの通知を受けて発行）
   */
  public handleLocalInsert(chapterId: string, from: number, text: string): void {
    const crdt = this.getOrCreateChapterCrdt(chapterId);
    const nodes = crdt.insertAt(from, text);
    if (nodes.length === 0) return;

    this.broadcastMessage({
      type: 'TEXT_INSERT',
      chapterId,
      senderPeerId: this.peerId,
      nodes,
      timestamp: Date.now(),
    });
  }

  /**
   * ローカルでのテキスト削除（CodeMirrorからの通知を受けて発行）
   */
  public handleLocalDelete(chapterId: string, from: number, length: number): void {
    const crdt = this.getOrCreateChapterCrdt(chapterId);
    const deletedIds = crdt.deleteAt(from, length);
    if (deletedIds.length === 0) return;

    this.broadcastMessage({
      type: 'TEXT_DELETE',
      chapterId,
      senderPeerId: this.peerId,
      deletedIds,
      timestamp: Date.now(),
    });
  }

  /**
   * ローカルのカーソル移動・選択範囲のブロードキャスト
   */
  public broadcastCursor(chapterId: string, from: number, to: number): void {
    const cursor: RemoteCursorInfo = {
      peerId: this.peerId,
      peerName: this.peerName,
      color: this.peerColor,
      chapterId,
      from,
      to,
      updatedAt: Date.now(),
    };

    this.broadcastMessage({
      type: 'TEXT_CURSOR',
      chapterId,
      senderPeerId: this.peerId,
      cursor,
      timestamp: Date.now(),
    });
  }

  /**
   * 章テキスト同期リクエストの発行（新規接続・章オープン時）
   */
  public requestChapterSync(chapterId: string): void {
    this.broadcastMessage({
      type: 'TEXT_SYNC_REQ',
      chapterId,
      senderPeerId: this.peerId,
      timestamp: Date.now(),
    });
  }

  public getRemoteCursors(chapterId?: string): RemoteCursorInfo[] {
    const now = Date.now();
    const active: RemoteCursorInfo[] = [];
    for (const [_, c] of this.remoteCursors.entries()) {
      if (now - c.updatedAt < 15000) {
        if (!chapterId || c.chapterId === chapterId) {
          active.push(c);
        }
      }
    }
    return active;
  }

  private broadcastMessage(msg: TextCrdtMessage): void {
    if (!this.transport) return;
    try {
      this.transport.send(msg as any);
    } catch (err) {
      console.warn('[TextCrdtEngine] Broadcast error:', err);
    }
  }

  public handleIncomingMessage(msg: any): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.senderPeerId === this.peerId) return;

    const message = msg as TextCrdtMessage;
    if (!message.type || !message.type.startsWith('TEXT_')) return;

    const chapterId = message.chapterId;

    switch (message.type) {
      case 'TEXT_INSERT': {
        if (message.nodes && message.nodes.length > 0) {
          const crdt = this.getOrCreateChapterCrdt(chapterId);
          const changes = crdt.applyRemoteInsert(message.nodes);
          for (const ch of changes) {
            for (const cb of this.onRemoteDocChangeCallbacks) {
              cb({
                chapterId,
                from: ch.from,
                to: ch.from,
                text: ch.text,
              });
            }
          }
        }
        break;
      }

      case 'TEXT_DELETE': {
        if (message.deletedIds && message.deletedIds.length > 0) {
          const crdt = this.getOrCreateChapterCrdt(chapterId);
          const changes = crdt.applyRemoteDelete(message.deletedIds);
          for (const ch of changes) {
            for (const cb of this.onRemoteDocChangeCallbacks) {
              cb({
                chapterId,
                from: ch.from,
                to: ch.to,
                text: '',
              });
            }
          }
        }
        break;
      }

      case 'TEXT_SYNC_REQ': {
        const crdt = this.chapterCrdts.get(chapterId);
        if (crdt) {
          this.broadcastMessage({
            type: 'TEXT_SYNC_RESP',
            chapterId,
            senderPeerId: this.peerId,
            nodes: crdt.exportNodes(),
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'TEXT_SYNC_RESP': {
        if (message.nodes) {
          const crdt = this.getOrCreateChapterCrdt(chapterId);
          const oldText = crdt.getText();
          crdt.importNodes(message.nodes);
          const newText = crdt.getText();
          if (oldText !== newText) {
            for (const cb of this.onRemoteDocChangeCallbacks) {
              cb({
                chapterId,
                from: 0,
                to: oldText.length,
                text: newText,
              });
            }
          }
        }
        break;
      }

      case 'TEXT_CURSOR': {
        if (message.cursor) {
          this.remoteCursors.set(message.senderPeerId, message.cursor);
          const active = this.getRemoteCursors();
          for (const cb of this.onRemoteCursorChangeCallbacks) {
            cb(active);
          }
        }
        break;
      }
    }
  }
}
