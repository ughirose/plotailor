import type { SubgraphSlice, NarrativeContext } from '@schema';
import { MAX_PAYLOAD_SIZE } from './SharedMemoryProtocol.js';

export interface NarrativeMethodMap {
  ping: {
    request: { timestamp?: number };
    response: { status: 'ok'; timestamp: number };
  };
  processSlice: {
    request: { slice: SubgraphSlice };
    response: { sliceId: string; nodeCount: number; edgeCount: number; processed: boolean };
  };
  evaluateNarrative: {
    request: { context: NarrativeContext };
    response: { score: number; suggestions: string[]; warnings: string[] };
  };
}

export type NarrativeMethod = keyof NarrativeMethodMap;

export interface NarrativeRpcRequest<M extends NarrativeMethod = NarrativeMethod> {
  id: string;
  method: M;
  params: NarrativeMethodMap[M]['request'];
  timestamp: number;
}

export interface NarrativeRpcResponse<M extends NarrativeMethod = NarrativeMethod> {
  id: string;
  method: M;
  success: boolean;
  result?: NarrativeMethodMap[M]['response'];
  error?: string;
  timestamp: number;
  fallbackUsed?: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function serializeRpcRequest<M extends NarrativeMethod>(req: NarrativeRpcRequest<M>): Uint8Array {
  const jsonStr = JSON.stringify(req);
  const bytes = encoder.encode(jsonStr);
  if (bytes.byteLength > MAX_PAYLOAD_SIZE) {
    // If larger than single packet MAX_PAYLOAD_SIZE, truncate metadata or handle gracefully
    // Standard payload will fit, but if slice is large, we can fallback or handle string
  }
  return bytes;
}

export function deserializeRpcRequest<M extends NarrativeMethod = NarrativeMethod>(bytes: Uint8Array): NarrativeRpcRequest<M> {
  const jsonStr = decoder.decode(bytes);
  return JSON.parse(jsonStr) as NarrativeRpcRequest<M>;
}

export function serializeRpcResponse<M extends NarrativeMethod>(res: NarrativeRpcResponse<M>): Uint8Array {
  const jsonStr = JSON.stringify(res);
  return encoder.encode(jsonStr);
}

export function deserializeRpcResponse<M extends NarrativeMethod = NarrativeMethod>(bytes: Uint8Array): NarrativeRpcResponse<M> {
  const jsonStr = decoder.decode(bytes);
  return JSON.parse(jsonStr) as NarrativeRpcResponse<M>;
}
