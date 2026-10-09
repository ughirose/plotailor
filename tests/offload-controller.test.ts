// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OffloadController } from '../src/app/controllers/OffloadController.js';
import type { TextChunk } from '../src/core/offload/ColabOffloadClient.js';

describe('OffloadController', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <footer>
        <span id="colabCuFooterIndicator">Colab: <strong>0.0000 CU</strong></span>
      </footer>
      <div id="offloadModal" style="display: none;">
        <span id="cuLedgerTotalBadge">0.0000 CU</span>
        <button id="btnCloseOffloadModal">✕</button>
        <button id="btnRunColabOffload">全編一括オフロード解析</button>
        <button id="btnRunChapterOffload">現在の章のみオフロード</button>
        <select id="offloadScopeSelect"></select>
        <input id="collabEndpointInput" value="http://127.0.0.1:8000" />
        <select id="collabGpuSelect">
          <option value="L4" selected>L4</option>
        </select>
        <div id="offloadProgressArea" style="display: none;">
          <span id="offloadStatusText"></span>
          <div id="offloadProgressBar" style="width: 0%;"></div>
        </div>
        <table>
          <tbody id="cuLedgerTableBody"></tbody>
        </table>
      </div>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('initializes with 0 CU and modal DOM bindings', () => {
    const ctrl = new OffloadController({
      getFullManuscriptText: () => 'これはテスト用の原稿テキストです。',
    });

    expect(ctrl.getTotalCU()).toBe(0);
    expect(ctrl.getLedger().length).toBe(0);

    const footer = document.getElementById('colabCuFooterIndicator');
    const modal = document.getElementById('offloadModal');
    const closeBtn = document.getElementById('btnCloseOffloadModal');

    expect(footer?.textContent).toContain('0.0000 CU');

    // Click footer to open modal
    footer?.click();
    expect(modal?.style.display).toBe('flex');

    // Click close to hide modal
    closeBtn?.click();
    expect(modal?.style.display).toBe('none');
  });

  it('executes offload and updates AFL-6 CU ledger and footer indicator', async () => {
    let pingCallCount = 0;
    const ctrl = new OffloadController({
      getFullManuscriptText: () => '第1章 本文テキスト。\n◆◆◆\n第2章 場面転換後のテキスト。',
      getCurrentChapterText: () => '第1章 本文テキスト。',
      mockRemoteExecutor: async (chunks: TextChunk[], ping: () => void) => {
        ping();
        pingCallCount++;
        return { status: 'OK', chunkCount: chunks.length };
      },
    });

    const res = await ctrl.handleRunOffload('all');
    expect(res).not.toBeNull();
    expect(res?.success).toBe(true);
    expect(pingCallCount).toBeGreaterThanOrEqual(1);

    // AFL-6: overhead + base CU is recorded
    expect(ctrl.getTotalCU()).toBeGreaterThan(0.01);
    expect(ctrl.getLedger().length).toBe(1);
    expect(ctrl.getLedger()[0].status).toBe('COMPLETED');

    const footer = document.getElementById('colabCuFooterIndicator');
    expect(footer?.textContent).toContain(ctrl.getTotalCU().toFixed(4));

    // Ledger table rendered in modal
    ctrl.openModal();
    const tableBody = document.getElementById('cuLedgerTableBody');
    expect(tableBody?.innerHTML).toContain('正常完了');
    expect(tableBody?.innerHTML).toContain('L4');
  });

  it('handles timeout and records AFL-6 TIMEOUT_FALLBACK in ledger without suppression', async () => {
    const ctrl = new OffloadController({
      getFullManuscriptText: () => 'タイムアウト検証原稿。',
      options: {
        requestTimeoutMs: 20, // Short timeout
      },
      mockRemoteExecutor: async () => {
        await new Promise((r) => setTimeout(r, 60)); // Exceeds 20ms
        return { status: 'SHOULD_NOT_REACH' };
      },
    });

    const res = await ctrl.handleRunOffload('all');
    expect(res).not.toBeNull();
    expect(res?.usedFallback).toBe(true);
    expect(res?.cuUsage.status).toBe('TIMEOUT_FALLBACK');

    // AFL-6 零握りつぶし原則: Failed session is 100% recorded in ledger
    expect(ctrl.getLedger().length).toBe(1);
    expect(ctrl.getTotalCU()).toBeGreaterThan(0);

    ctrl.openModal();
    const tableBody = document.getElementById('cuLedgerTableBody');
    expect(tableBody?.innerHTML).toContain('TIMEOUT_FALLBACK');
  });
});
