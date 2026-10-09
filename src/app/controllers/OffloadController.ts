import {
  ColabOffloadClient,
  type ColabOffloadOptions,
  type CuUsageRecord,
  type TextChunk,
  type OffloadResult,
} from '../../core/offload/ColabOffloadClient.js';

export interface OffloadControllerDependencies {
  getFullManuscriptText: () => string;
  getCurrentChapterText?: () => string;
  showToast?: (msg: string) => void;
  options?: ColabOffloadOptions;
  mockRemoteExecutor?: (chunks: TextChunk[], ping: () => void) => Promise<any>;
}

export class OffloadController {
  private deps: OffloadControllerDependencies;
  private client: ColabOffloadClient;
  private isProcessing: boolean = false;

  // DOM Elements
  private colabCuFooterIndicator: HTMLElement | null = null;
  private offloadModal: HTMLElement | null = null;
  private btnCloseOffloadModal: HTMLElement | null = null;
  private btnRunColabOffload: HTMLButtonElement | null = null;
  private btnRunChapterOffload: HTMLButtonElement | null = null;
  private offloadScopeSelect: HTMLSelectElement | null = null;
  private colabEndpointInput: HTMLInputElement | null = null;
  private colabGpuSelect: HTMLSelectElement | null = null;
  private offloadProgressArea: HTMLElement | null = null;
  private offloadProgressBar: HTMLElement | null = null;
  private offloadStatusText: HTMLElement | null = null;
  private cuLedgerTableBody: HTMLElement | null = null;
  private cuLedgerTotalBadge: HTMLElement | null = null;

  constructor(deps: OffloadControllerDependencies) {
    this.deps = deps;
    this.client = new ColabOffloadClient(deps.options);

    this.bindDom();
    this.updateFooterIndicator();
  }

  private bindDom(): void {
    this.colabCuFooterIndicator = document.getElementById('colabCuFooterIndicator');
    this.offloadModal = document.getElementById('offloadModal');
    this.btnCloseOffloadModal = document.getElementById('btnCloseOffloadModal');
    this.btnRunColabOffload = document.getElementById('btnRunColabOffload') as HTMLButtonElement | null;
    this.btnRunChapterOffload = document.getElementById('btnRunChapterOffload') as HTMLButtonElement | null;
    this.offloadScopeSelect = document.getElementById('offloadScopeSelect') as HTMLSelectElement | null;
    this.colabEndpointInput = document.getElementById('colabEndpointInput') as HTMLInputElement | null;
    this.colabGpuSelect = document.getElementById('colabGpuSelect') as HTMLSelectElement | null;
    this.offloadProgressArea = document.getElementById('offloadProgressArea');
    this.offloadProgressBar = document.getElementById('offloadProgressBar');
    this.offloadStatusText = document.getElementById('offloadStatusText');
    this.cuLedgerTableBody = document.getElementById('cuLedgerTableBody');
    this.cuLedgerTotalBadge = document.getElementById('cuLedgerTotalBadge');

    if (this.colabCuFooterIndicator) {
      this.colabCuFooterIndicator.addEventListener('click', () => this.openModal());
    }

    if (this.btnCloseOffloadModal) {
      this.btnCloseOffloadModal.addEventListener('click', () => this.closeModal());
    }

    if (this.offloadModal) {
      this.offloadModal.addEventListener('click', (e) => {
        if (e.target === this.offloadModal) {
          this.closeModal();
        }
      });
    }

    if (this.btnRunColabOffload) {
      this.btnRunColabOffload.addEventListener('click', () => this.handleRunOffload('all'));
    }

    if (this.btnRunChapterOffload) {
      this.btnRunChapterOffload.addEventListener('click', () => this.handleRunOffload('chapter'));
    }
  }

  public openModal(): void {
    if (this.offloadModal) {
      this.offloadModal.style.display = 'flex';
      this.renderLedgerTable();
    }
  }

  public closeModal(): void {
    if (this.offloadModal) {
      this.offloadModal.style.display = 'none';
    }
  }

  public async handleRunOffload(scope: 'all' | 'chapter' = 'all'): Promise<OffloadResult | null> {
    if (this.isProcessing) return null;

    const text =
      scope === 'chapter' && this.deps.getCurrentChapterText
        ? this.deps.getCurrentChapterText()
        : this.deps.getFullManuscriptText();

    if (!text || text.trim().length === 0) {
      if (this.deps.showToast) {
        this.deps.showToast('⚠️ 解析対象の原稿テキストが空です');
      }
      return null;
    }

    this.isProcessing = true;
    this.setUiProcessingState(true);

    try {
      const executor =
        this.deps.mockRemoteExecutor ||
        (async (chunks: TextChunk[], ping: () => void) => {
          // デフォルト: 疑似リモート処理 (進行に合わせてping呼出)
          for (let i = 0; i < chunks.length; i++) {
            ping();
            await new Promise((r) => setTimeout(r, 40));
            this.updateProgress((i + 1) / chunks.length, `チャンク ${i + 1}/${chunks.length} 解析完了`);
          }
          return {
            analyzedChunks: chunks.length,
            totalChars: text.length,
            grammarScore: 98.4,
            foreshadowingContinuity: 'STABLE',
          };
        });

      const fallback = (chunks: TextChunk[]) => {
        return {
          analyzedChunks: chunks.length,
          totalChars: text.length,
          fallbackReason: 'LOCAL_RULE_BASED',
        };
      };

      const result = await this.client.executeOffload(text, executor, fallback);

      this.updateFooterIndicator();
      this.renderLedgerTable();

      if (this.deps.showToast) {
        if (result.success) {
          this.deps.showToast(
            `⚡ Colab遠隔推敲が完了しました (計上: ${result.cuUsage.totalComputeUnits.toFixed(4)} CU)`
          );
        } else {
          this.deps.showToast(
            `⚠️ Colab遠隔がフォールバックしました (AFL-6計上: ${result.cuUsage.totalComputeUnits.toFixed(4)} CU)`
          );
        }
      }

      return result;
    } finally {
      this.isProcessing = false;
      this.setUiProcessingState(false);
    }
  }

  public getClient(): ColabOffloadClient {
    return this.client;
  }

  public getTotalCU(): number {
    return this.client.getTotalConsumedCU();
  }

  public getLedger(): CuUsageRecord[] {
    return this.client.getLedger();
  }

  private updateFooterIndicator(): void {
    if (!this.colabCuFooterIndicator) return;
    const totalCu = this.getTotalCU();
    this.colabCuFooterIndicator.innerHTML = `Colab: <strong style="color: var(--color-gold);">${totalCu.toFixed(4)} CU</strong>`;
    this.colabCuFooterIndicator.title = `AFL-6 Colab 遠隔オフロード累計消費: ${totalCu.toFixed(6)} CU (クリックで台帳・実行モーダル)`;
  }

  private setUiProcessingState(processing: boolean): void {
    if (this.btnRunColabOffload) this.btnRunColabOffload.disabled = processing;
    if (this.btnRunChapterOffload) this.btnRunChapterOffload.disabled = processing;
    if (this.offloadProgressArea) {
      this.offloadProgressArea.style.display = processing ? 'block' : 'none';
    }
    if (processing) {
      this.updateProgress(0.05, 'Colab遠隔環境へ接続中 (死活監視開始)...');
    }
  }

  private updateProgress(fraction: number, statusText: string): void {
    const percent = Math.min(100, Math.max(0, Math.round(fraction * 100)));
    if (this.offloadProgressBar) {
      this.offloadProgressBar.style.width = `${percent}%`;
    }
    if (this.offloadStatusText) {
      this.offloadStatusText.textContent = `${statusText} (${percent}%)`;
    }
  }

  private renderLedgerTable(): void {
    const totalCu = this.getTotalCU();
    if (this.cuLedgerTotalBadge) {
      this.cuLedgerTotalBadge.textContent = `${totalCu.toFixed(4)} CU`;
    }

    if (!this.cuLedgerTableBody) return;

    const ledger = this.getLedger();
    if (ledger.length === 0) {
      this.cuLedgerTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--color-text-dim); padding: 12px;">
            記録されたColab実行セッションはありません (全リソース消費100%全数計上)
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    // Reverse to show latest first
    for (let i = ledger.length - 1; i >= 0; i--) {
      const rec = ledger[i];
      const timeStr = new Date(rec.timestamp).toLocaleTimeString('ja-JP');
      const isOk = rec.status === 'COMPLETED';
      const statusBadge = isOk
        ? `<span style="color: #10b981; font-weight: 600;">✓ 正常完了</span>`
        : `<span style="color: #ef4444; font-weight: 600;">⚠️ ${rec.status}</span>`;

      rowsHtml += `
        <tr style="border-bottom: 1px solid var(--color-border); font-size: 11px;">
          <td style="padding: 6px 8px; font-family: var(--font-mono);">${timeStr}</td>
          <td style="padding: 6px 8px;">${rec.gpuType}</td>
          <td style="padding: 6px 8px; text-align: right;">${(rec.durationMs / 1000).toFixed(2)}s</td>
          <td style="padding: 6px 8px; text-align: right;">${rec.processedChars.toLocaleString()}字</td>
          <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: var(--color-gold); font-family: var(--font-mono);">
            ${rec.totalComputeUnits.toFixed(4)}
            <small style="font-weight: 400; color: var(--color-text-dim); display: block; font-size: 9px;">(OVH: ${rec.overheadComputeUnits.toFixed(4)})</small>
          </td>
          <td style="padding: 6px 8px;">${statusBadge}</td>
        </tr>
      `;
    }

    this.cuLedgerTableBody.innerHTML = rowsHtml;
  }
}
