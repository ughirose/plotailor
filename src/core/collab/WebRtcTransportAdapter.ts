import type { P2PTransportAdapter, CrdtMessage } from './P2PCrdtSyncEngine.js';

export interface SignalingPayload {
  version: 1;
  type: 'offer' | 'answer';
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
}

export interface WebRtcTransportOptions {
  iceServers?: RTCIceServer[];
  channelName?: string;
  iceGatheringTimeoutMs?: number;
}

export type WebRtcConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * WebRtcTransportAdapter - 完全サーバーレス WebRTC P2P トランスポート
 *
 * シグナリングサーバーを使用せず、招待コード／接続コード（Base64圧縮SDP+ICE）の
 * 手動交換（コピペ）によって遠隔ブラウザ間の RTCDataChannel 接続を確立する。
 */
export class WebRtcTransportAdapter implements P2PTransportAdapter {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private messageCallback?: (message: CrdtMessage) => void;
  private stateChangeCallback?: (state: WebRtcConnectionState) => void;
  private options: Required<WebRtcTransportOptions>;
  private iceCandidates: RTCIceCandidateInit[] = [];
  private connectionState: WebRtcConnectionState = 'new';

  constructor(options: WebRtcTransportOptions = {}) {
    this.options = {
      iceServers: options.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
      channelName: options.channelName || 'plotailor-crdt',
      iceGatheringTimeoutMs: options.iceGatheringTimeoutMs ?? 4000,
    };
  }

  public getConnectionState(): WebRtcConnectionState {
    return this.connectionState;
  }

  public onConnectionStateChange(callback: (state: WebRtcConnectionState) => void): void {
    this.stateChangeCallback = callback;
  }

  private setConnectionState(state: WebRtcConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      if (this.stateChangeCallback) {
        this.stateChangeCallback(state);
      }
    }
  }

  private initPeerConnection(): RTCPeerConnection {
    if (this.peerConnection) {
      this.close();
    }

    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('RTCPeerConnection is not supported in this environment');
    }

    const pc = new RTCPeerConnection({
      iceServers: this.options.iceServers,
    });

    this.iceCandidates = [];

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.iceCandidates.push(event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        this.setConnectionState('connected');
      } else if (state === 'disconnected') {
        this.setConnectionState('disconnected');
      } else if (state === 'failed') {
        this.setConnectionState('failed');
      } else if (state === 'closed') {
        this.setConnectionState('closed');
      } else if (state === 'connecting') {
        this.setConnectionState('connecting');
      }
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    this.peerConnection = pc;
    return pc;
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    this.dataChannel = dc;

    dc.onopen = () => {
      this.setConnectionState('connected');
    };

    dc.onclose = () => {
      this.setConnectionState('disconnected');
    };

    dc.onerror = (err) => {
      console.warn('[WebRtcTransport] DataChannel error:', err);
    };

    dc.onmessage = (event) => {
      if (!this.messageCallback || !event.data) return;
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const parsed = JSON.parse(raw);
        this.messageCallback(parsed);
      } catch (err) {
        console.warn('[WebRtcTransport] Failed to parse incoming message:', err);
      }
    };
  }

  /**
   * ホスト側: 招待コード (Offer + ICE candidates) を生成する
   */
  public async generateInviteCode(): Promise<string> {
    const pc = this.initPeerConnection();
    this.setConnectionState('connecting');

    // ホスト側からデータチャネルを作成
    const dc = pc.createDataChannel(this.options.channelName, { ordered: true });
    this.setupDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this.waitForIceGathering(pc);

    const localDesc = pc.localDescription;
    if (!localDesc) {
      throw new Error('Failed to obtain local description for Offer');
    }

    const payload: SignalingPayload = {
      version: 1,
      type: 'offer',
      sdp: {
        type: localDesc.type,
        sdp: localDesc.sdp,
      },
      candidates: this.iceCandidates,
    };

    return this.encodeSignalingPayload(payload);
  }

  /**
   * ゲスト側: ホストの招待コードを受領し、接続応答コード (Answer + ICE) を生成する
   */
  public async acceptInviteAndGenerateAnswer(inviteCode: string): Promise<string> {
    const payload = this.decodeSignalingPayload(inviteCode);
    if (payload.type !== 'offer') {
      throw new Error(`Invalid signaling type: expected 'offer', got '${payload.type}'`);
    }

    const pc = this.initPeerConnection();
    this.setConnectionState('connecting');

    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

    // ICE Candidate を追加
    for (const cand of payload.candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('[WebRtcTransport] Failed to add remote ICE candidate:', e);
      }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await this.waitForIceGathering(pc);

    const localDesc = pc.localDescription;
    if (!localDesc) {
      throw new Error('Failed to obtain local description for Answer');
    }

    const answerPayload: SignalingPayload = {
      version: 1,
      type: 'answer',
      sdp: {
        type: localDesc.type,
        sdp: localDesc.sdp,
      },
      candidates: this.iceCandidates,
    };

    return this.encodeSignalingPayload(answerPayload);
  }

  /**
   * ホスト側: ゲストの接続応答コードを受領してリモート設定し、接続を確立する
   */
  public async acceptAnswer(answerCode: string): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Cannot accept answer: PeerConnection is not initialized');
    }

    const payload = this.decodeSignalingPayload(answerCode);
    if (payload.type !== 'answer') {
      throw new Error(`Invalid signaling type: expected 'answer', got '${payload.type}'`);
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));

    for (const cand of payload.candidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('[WebRtcTransport] Failed to add remote ICE candidate in host:', e);
      }
    }
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let resolved = false;

      const finish = () => {
        if (!resolved) {
          resolved = true;
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };

      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          finish();
        }
      };

      pc.addEventListener('icegatheringstatechange', check);

      // タイムアウト防護 (最大待機時間経過で強制継続)
      setTimeout(finish, this.options.iceGatheringTimeoutMs);
    });
  }

  public encodeSignalingPayload(payload: SignalingPayload): string {
    const json = JSON.stringify(payload);
    // UTF-8 文字列を安全に Base64 エンコード
    if (typeof btoa !== 'undefined') {
      return btoa(encodeURIComponent(json));
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(json, 'utf-8').toString('base64');
    }
    return btoa(json);
  }

  public decodeSignalingPayload(code: string): SignalingPayload {
    if (!code || typeof code !== 'string') {
      throw new Error('Invalid signaling code: code must be a non-empty string');
    }

    const trimmed = code.trim();
    let json = '';

    try {
      if (typeof atob !== 'undefined') {
        const decodedStr = atob(trimmed);
        try {
          json = decodeURIComponent(decodedStr);
        } catch {
          json = decodedStr;
        }
      } else if (typeof Buffer !== 'undefined') {
        json = Buffer.from(trimmed, 'base64').toString('utf-8');
      }
    } catch (e) {
      throw new Error(`Failed to decode base64 signaling code: ${(e as Error).message}`);
    }

    try {
      const parsed = JSON.parse(json);
      if (!parsed || parsed.version !== 1 || !parsed.type || !parsed.sdp) {
        throw new Error('Signaling payload schema validation failed: missing version, type, or sdp');
      }
      if (!Array.isArray(parsed.candidates)) {
        parsed.candidates = [];
      }
      return parsed as SignalingPayload;
    } catch (e) {
      throw new Error(`Failed to parse signaling JSON: ${(e as Error).message}`);
    }
  }

  public send(message: CrdtMessage): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(message));
      } catch (err) {
        console.warn('[WebRtcTransport] Failed to send message:', err);
      }
    }
  }

  public onMessage(callback: (message: CrdtMessage) => void): void {
    this.messageCallback = callback;
  }

  public close(): void {
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }

    this.setConnectionState('closed');
  }
}
