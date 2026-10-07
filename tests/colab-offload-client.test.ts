import { describe, it, expect, beforeEach } from 'vitest';
import {
  ColabOffloadClient,
  type TextChunk,
} from '../src/core/offload/ColabOffloadClient.js';

describe('ColabOffloadClient', () => {
  let client: ColabOffloadClient;

  beforeEach(() => {
    client = new ColabOffloadClient({
      maxChunkSizeChars: 100, // テスト用に小さく設定
      requestTimeoutMs: 50,  // 高速タイムアウトテスト
      gpuType: 'L4',
    });
  });

  it('splits text into semantic chunks along chapter and scene break boundaries', () => {
    const text =
      '第1章 始まりの刻\n' +
      'これは冒頭のテキストです。'.repeat(4) +
      '\n◆◆◆\n' +
      '場面転換後のテキストです。'.repeat(4);

    const chunks = client.splitIntoSemanticChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].totalChunks).toBe(chunks.length);
    expect(chunks[0].content.length).toBeGreaterThan(0);

    // Chunks should reconstruct original text completely
    const reconstructed = chunks.map((c) => c.content).join('');
    expect(reconstructed).toBe(text);
  });

  it('returns single chunk when text length is within maxChunkSizeChars', () => {
    const text = '短い文章です。';
    const chunks = client.splitIntoSemanticChunks(text);

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].totalChunks).toBe(1);
  });

  it('calculates compute units with startup overhead according to AFL-6', () => {
    // 360,000ms = 0.1 hr on L4 (1.05 CU/hr) = 0.105 base CU
    // Overhead = (1/60) * 1.05 = 0.0175 CU
    const cu = client.calculateComputeUnits(360000, true);

    expect(cu.baseCu).toBeCloseTo(0.105, 3);
    expect(cu.overheadCu).toBeCloseTo(0.0175, 3);
    expect(cu.totalCu).toBeCloseTo(0.1225, 3);
  });

  it('executes successful offload and records COMPLETED in ledger', async () => {
    const text = '正常処理の対象原稿テキスト。';
    const res = await client.executeOffload(
      text,
      async (chunks, ping) => {
        ping();
        return { processedCount: chunks.length };
      }
    );

    expect(res.success).toBe(true);
    expect(res.usedFallback).toBe(false);
    expect(res.data.processedCount).toBe(1);
    expect(res.cuUsage.status).toBe('COMPLETED');

    const ledger = client.getLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].status).toBe('COMPLETED');
    expect(client.getTotalConsumedCU()).toBeGreaterThan(0);
  });

  it('handles timeout hang and downgrades to local fallback with 100% CU accounting', async () => {
    const text = 'タイムアウトの対象原稿テキスト。';
    const res = await client.executeOffload<any>(
      text,
      async () => {
        // Hang indefinitely
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { never: true };
      },
      (chunks) => ({ fallbackSuccess: true, chunkCount: chunks.length })
    );

    expect(res.success).toBe(false);
    expect(res.usedFallback).toBe(true);
    expect(res.data.fallbackSuccess).toBe(true);
    expect(res.cuUsage.status).toBe('TIMEOUT_FALLBACK');

    const ledger = client.getLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].status).toBe('TIMEOUT_FALLBACK');
  });

  it('records ERROR_FALLBACK on remote exception without zero-concealing (AFL-6)', async () => {
    const text = 'エラー発生の原稿テキスト。';
    const res = await client.executeOffload(
      text,
      async () => {
        throw new Error('CUDA Out of Memory (OOM)');
      },
      () => ({ fallback: true })
    );

    expect(res.success).toBe(false);
    expect(res.usedFallback).toBe(true);
    expect(res.cuUsage.status).toBe('ERROR_FALLBACK');
    expect(res.cuUsage.note).toContain('CUDA Out of Memory');
  });
});
