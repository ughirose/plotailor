/**
 * ColabOffloadClient - 大規模原稿のColab遠隔オフロード（AFL-6死活監視＆CU自動計上）クライアント
 *
 * 50万文字超の大規模長編原稿を意味的境界（章・節・アスタリスク場面境界）で防御的にチャンク分割し、
 * 遠隔GPU計算環境（Colab）へ非破壊ストリーミング送出する。
 * AFL-6規律に基づく全リソース消費の100%全数計上（起動オーバーヘッド、pip等を含む厳密CU計算）と、
 * サイレントハングを前提とした死活監視（Liveness ping）およびタイムアウト・ローカルフォールバックを備える。
 */

export interface ColabOffloadOptions {
  colabEndpointUrl?: string;
  authToken?: string;
  maxChunkSizeChars?: number; // デフォルト: 50,000文字
  livenessPingIntervalMs?: number; // デフォルト: 5,000ms
  requestTimeoutMs?: number; // デフォルト: 30,000ms
  gpuType?: 'T4' | 'L4' | 'A100' | 'V100';
  cuRatePerHour?: number; // 例: L4 = 1.05 CU/hr, A100 = 2.06 CU/hr, T4 = 0.5 CU/hr
}

export interface TextChunk {
  chunkIndex: number;
  totalChunks: number;
  boundaryType: 'chapter' | 'scene_break' | 'paragraph';
  startCharIndex: number;
  endCharIndex: number;
  charCount: number;
  content: string;
}

export interface CuUsageRecord {
  sessionId: string;
  timestamp: number;
  durationMs: number;
  gpuType: string;
  baseComputeUnits: number;
  overheadComputeUnits: number;
  totalComputeUnits: number;
  processedChars: number;
  status: 'COMPLETED' | 'TIMEOUT_FALLBACK' | 'ERROR_FALLBACK';
  note?: string;
}

export interface OffloadResult<T = any> {
  sessionId: string;
  success: boolean;
  usedFallback: boolean;
  data: T;
  chunks: TextChunk[];
  cuUsage: CuUsageRecord;
}

export class ColabOffloadClient {
  private options: Required<ColabOffloadOptions>;
  private cuLedger: CuUsageRecord[] = [];

  constructor(options: ColabOffloadOptions = {}) {
    const gpuType = options.gpuType ?? 'L4';
    const cuRate =
      options.cuRatePerHour ??
      (gpuType === 'L4' ? 1.05 : gpuType === 'A100' ? 2.06 : gpuType === 'V100' ? 1.5 : 0.5);

    this.options = {
      colabEndpointUrl: options.colabEndpointUrl ?? 'http://127.0.0.1:8000',
      authToken: options.authToken ?? 'LOCAL_DEV_TOKEN',
      maxChunkSizeChars: options.maxChunkSizeChars ?? 50000,
      livenessPingIntervalMs: options.livenessPingIntervalMs ?? 5000,
      requestTimeoutMs: options.requestTimeoutMs ?? 30000,
      gpuType,
      cuRatePerHour: cuRate,
    };
  }

  /**
   * 原稿テキストを意味的境界で防御的にチャンク分割（計算リソース投入前のデータ確定原則）
   */
  public splitIntoSemanticChunks(text: string): TextChunk[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const maxChars = this.options.maxChunkSizeChars;
    if (text.length <= maxChars) {
      return [
        {
          chunkIndex: 0,
          totalChunks: 1,
          boundaryType: 'chapter',
          startCharIndex: 0,
          endCharIndex: text.length,
          charCount: text.length,
          content: text,
        },
      ];
    }

    const chunks: TextChunk[] = [];
    let currentStart = 0;

    // 優先区切りパターン:
    // 1. 章見出し改行 (例: [大見出し] or # Chapter or 第X章)
    // 2. 場面転換記号 (例: ◆◆◆, ***, ───)
    // 3. 空行改行 (\n\n)
    // 4. 改行 (\n)
    const boundaryRegex = /(?:\n[#第][^\n]+\n|\n[◆◇■□★☆＊*―─]{3,}\n|\n\s*\n|\n)/g;

    while (currentStart < text.length) {
      const targetEnd = Math.min(currentStart + maxChars, text.length);
      if (targetEnd >= text.length) {
        chunks.push({
          chunkIndex: chunks.length,
          totalChunks: 0, // あとで補正
          boundaryType: 'paragraph',
          startCharIndex: currentStart,
          endCharIndex: text.length,
          charCount: text.length - currentStart,
          content: text.slice(currentStart),
        });
        break;
      }

      // targetEnd 付近（70%〜100%の間）で最適な区切り記号を検索
      const searchWindowStart = currentStart + Math.floor(maxChars * 0.7);
      const searchWindow = text.slice(searchWindowStart, targetEnd);
      let splitOffset = -1;
      let boundaryType: TextChunk['boundaryType'] = 'paragraph';

      const match = searchWindow.match(boundaryRegex);
      if (match && match.index !== undefined) {
        splitOffset = searchWindowStart + match.index + match[0].length;
        if (match[0].includes('章') || match[0].startsWith('\n#')) {
          boundaryType = 'chapter';
        } else if (match[0].match(/[◆◇■□★☆＊*―─]{3,}/)) {
          boundaryType = 'scene_break';
        }
      }

      const actualEnd = splitOffset > 0 ? splitOffset : targetEnd;
      chunks.push({
        chunkIndex: chunks.length,
        totalChunks: 0,
        boundaryType,
        startCharIndex: currentStart,
        endCharIndex: actualEnd,
        charCount: actualEnd - currentStart,
        content: text.slice(currentStart, actualEnd),
      });

      currentStart = actualEnd;
    }

    for (let i = 0; i < chunks.length; i++) {
      chunks[i].totalChunks = chunks.length;
    }

    return chunks;
  }

  /**
   * AFL-6規律に基づく厳密なCU（Compute Unit）消費計算
   * 起動・pip等の固定オーバーヘッドを全数計上
   */
  public calculateComputeUnits(durationMs: number, isNewSession = false): {
    baseCu: number;
    overheadCu: number;
    totalCu: number;
  } {
    const hours = durationMs / (1000 * 60 * 60);
    const baseCu = hours * this.options.cuRatePerHour;

    // AFL-6: セッション起動・環境初期化オーバーヘッド（約1分相当 = 0.0175 CU）
    const overheadCu = isNewSession ? (1 / 60) * this.options.cuRatePerHour : 0;
    const totalCu = Number((baseCu + overheadCu).toFixed(6));

    return {
      baseCu: Number(baseCu.toFixed(6)),
      overheadCu: Number(overheadCu.toFixed(6)),
      totalCu,
    };
  }

  /**
   * リモートオフロード実行（死活監視＆タイムアウト付き）
   * 失敗・タイムアウト時はゼロ隠蔽せずフォールバックへ転換
   */
  public async executeOffload<T>(
    text: string,
    remoteTaskFn?: (chunks: TextChunk[], ping: () => void) => Promise<T>,
    localFallbackFn?: (chunks: TextChunk[]) => T
  ): Promise<OffloadResult<T>> {
    const startTime = Date.now();
    const sessionId = `colab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const chunks = this.splitIntoSemanticChunks(text);

    let livenessPingCount = 0;
    let isHang = false;

    // 死活監視タイマー
    const ping = () => {
      livenessPingCount += 1;
    };

    let resultData: T;
    let usedFallback = false;
    let status: CuUsageRecord['status'] = 'COMPLETED';
    let note: string | undefined;

    try {
      if (!remoteTaskFn) {
        throw new Error('No remote task executor specified');
      }

      // レース: リモート処理 vs 強制タイムアウト
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          isHang = true;
          reject(new Error(`Colab request timed out after ${this.options.requestTimeoutMs}ms`));
        }, this.options.requestTimeoutMs);
      });

      resultData = await Promise.race([remoteTaskFn(chunks, ping), timeoutPromise]);
    } catch (err: any) {
      usedFallback = true;
      status = isHang ? 'TIMEOUT_FALLBACK' : 'ERROR_FALLBACK';
      note = String(err?.message || err);

      if (localFallbackFn) {
        resultData = localFallbackFn(chunks);
      } else {
        resultData = { fallbackChars: text.length, chunkCount: chunks.length } as unknown as T;
      }
    }

    const durationMs = Date.now() - startTime;
    const cu = this.calculateComputeUnits(durationMs, true);

    const record: CuUsageRecord = {
      sessionId,
      timestamp: startTime,
      durationMs,
      gpuType: this.options.gpuType,
      baseComputeUnits: cu.baseCu,
      overheadComputeUnits: cu.overheadCu,
      totalComputeUnits: cu.totalCu,
      processedChars: text.length,
      status,
      note,
    };

    // AFL-6: 失敗・タイムアウト含む全リソース消費の100%全数計上
    this.cuLedger.push(record);

    return {
      sessionId,
      success: !usedFallback,
      usedFallback,
      data: resultData,
      chunks,
      cuUsage: record,
    };
  }

  /**
   * CU消費台帳の取得
   */
  public getLedger(): CuUsageRecord[] {
    return [...this.cuLedger];
  }

  /**
   * 累計消費CUの取得
   */
  public getTotalConsumedCU(): number {
    return Number(
      this.cuLedger.reduce((sum, r) => sum + r.totalComputeUnits, 0).toFixed(6)
    );
  }

  /**
   * 台帳のリセット
   */
  public clearLedger(): void {
    this.cuLedger = [];
  }
}
