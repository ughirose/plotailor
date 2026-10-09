import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WebRtcTransportAdapter,
  type SignalingPayload,
} from '../src/core/collab/WebRtcTransportAdapter.js';
import type { CrdtMessage } from '../src/core/collab/P2PCrdtSyncEngine.js';

// Mock WebRTC implementations for Node / Vitest environment
class MockRTCDataChannel {
  public label: string;
  public readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'open';
  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((err: any) => void) | null = null;
  public onmessage: ((event: { data: any }) => void) | null = null;
  public sentMessages: string[] = [];

  constructor(label: string) {
    this.label = label;
  }

  public send(data: string): void {
    this.sentMessages.push(data);
  }

  public close(): void {
    this.readyState = 'closed';
    this.onclose?.();
  }

  // Helper for test to simulate incoming message
  public receiveMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

class MockRTCPeerConnection {
  public connectionState: RTCPeerConnectionState = 'new';
  public iceGatheringState: RTCIceGatheringState = 'complete';
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public onicecandidate: ((e: { candidate: any }) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public ondatachannel: ((e: { channel: MockRTCDataChannel }) => void) | null = null;
  public createdDataChannels: MockRTCDataChannel[] = [];
  public addedCandidates: any[] = [];

  constructor(_config?: any) {}

  public createDataChannel(label: string, _options?: any): MockRTCDataChannel {
    const dc = new MockRTCDataChannel(label);
    this.createdDataChannels.push(dc);
    return dc;
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0\r\no=mock-host\r\ns=test' };
  }

  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'v=0\r\no=mock-guest\r\ns=test' };
  }

  public async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
  }

  public async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
  }

  public async addIceCandidate(candidate: any): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  public addEventListener(event: string, handler: any): void {
    if (event === 'icegatheringstatechange') {
      // Immediate execution
      handler();
    }
  }

  public removeEventListener(_event: string, _handler: any): void {}

  public close(): void {
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }
}

describe('WebRtcTransportAdapter', () => {
  beforeEach(() => {
    // Install Mock WebRTC globals
    (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
    (globalThis as any).RTCSessionDescription = function (desc: any) {
      return desc;
    };
    (globalThis as any).RTCIceCandidate = function (cand: any) {
      return cand;
    };
  });

  it('generates a valid Base64 offer invite code with defensive payload schema', async () => {
    const adapter = new WebRtcTransportAdapter({ iceGatheringTimeoutMs: 100 });
    const inviteCode = await adapter.generateInviteCode();

    expect(typeof inviteCode).toBe('string');
    expect(inviteCode.length).toBeGreaterThan(10);

    const payload: SignalingPayload = adapter.decodeSignalingPayload(inviteCode);
    expect(payload.version).toBe(1);
    expect(payload.type).toBe('offer');
    expect(payload.sdp.type).toBe('offer');
    expect(payload.sdp.sdp).toContain('mock-host');
    expect(Array.isArray(payload.candidates)).toBe(true);

    adapter.close();
  });

  it('performs full 3-step serverless signaling handshake (Offer -> Answer -> Accept)', async () => {
    const hostAdapter = new WebRtcTransportAdapter({ iceGatheringTimeoutMs: 100 });
    const guestAdapter = new WebRtcTransportAdapter({ iceGatheringTimeoutMs: 100 });

    let hostState = hostAdapter.getConnectionState();
    hostAdapter.onConnectionStateChange((s) => { hostState = s; });

    let guestState = guestAdapter.getConnectionState();
    guestAdapter.onConnectionStateChange((s) => { guestState = s; });

    // Step 1: Host generates invite code
    const inviteCode = await hostAdapter.generateInviteCode();
    expect(hostState).toBe('connecting');

    // Step 2: Guest accepts invite and generates answer code
    const answerCode = await guestAdapter.acceptInviteAndGenerateAnswer(inviteCode);
    expect(guestState).toBe('connecting');

    const answerPayload = guestAdapter.decodeSignalingPayload(answerCode);
    expect(answerPayload.type).toBe('answer');
    expect(answerPayload.sdp.sdp).toContain('mock-guest');

    // Step 3: Host accepts answer
    await hostAdapter.acceptAnswer(answerCode);

    // Verify mock peer connection state
    const hostPc = (hostAdapter as any).peerConnection as MockRTCPeerConnection;
    const guestPc = (guestAdapter as any).peerConnection as MockRTCPeerConnection;

    expect(hostPc.remoteDescription?.type).toBe('answer');
    expect(guestPc.remoteDescription?.type).toBe('offer');

    hostAdapter.close();
    guestAdapter.close();
  });

  it('sends and receives CrdtMessages over DataChannel with defensive parsing', async () => {
    const adapter = new WebRtcTransportAdapter({ iceGatheringTimeoutMs: 100 });
    await adapter.generateInviteCode();

    const dc = (adapter as any).dataChannel as MockRTCDataChannel;
    expect(dc).toBeDefined();

    // Test Sending
    const testMsg: CrdtMessage = {
      type: 'UPDATE',
      senderPeerId: 'peer-test',
      clock: { 'peer-test': 1 },
      sequenceNumber: 1,
      records: [{ id: 'lore-1', value: { id: 'lore-1' }, timestamp: 1000, peerId: 'peer-test', isDeleted: false, version: 1 }],
    };

    adapter.send(testMsg);
    expect(dc.sentMessages.length).toBe(1);
    expect(JSON.parse(dc.sentMessages[0]).type).toBe('UPDATE');

    // Test Receiving
    const receivedMessages: CrdtMessage[] = [];
    adapter.onMessage((msg) => {
      receivedMessages.push(msg);
    });

    const incoming: CrdtMessage = {
      type: 'SYNC_STEP_1',
      senderPeerId: 'remote-peer',
      clock: { 'remote-peer': 2 },
      sequenceNumber: 1,
    };

    dc.receiveMessage(JSON.stringify(incoming));
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].senderPeerId).toBe('remote-peer');

    // Non-destructive parsing check: Malformed JSON should not throw or crash
    expect(() => {
      dc.receiveMessage('INVALID_JSON_CORRUPTED');
    }).not.toThrow();
    expect(receivedMessages.length).toBe(1); // Still 1

    adapter.close();
    expect(adapter.getConnectionState()).toBe('closed');
  });

  it('rejects invalid signaling codes defensively', () => {
    const adapter = new WebRtcTransportAdapter();

    expect(() => adapter.decodeSignalingPayload('')).toThrow(/non-empty/);
    expect(() => adapter.decodeSignalingPayload('NOT_BASE_64_%%%')).toThrow();
    
    // Valid Base64 but invalid JSON schema
    const invalidJsonBase64 = Buffer.from(JSON.stringify({ some: 'junk' })).toString('base64');
    expect(() => adapter.decodeSignalingPayload(invalidJsonBase64)).toThrow(/validation failed/);
  });
});
