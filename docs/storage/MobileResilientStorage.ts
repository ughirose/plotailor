/**
 * WorldCraft Reference Asset: MobileResilientStorage.ts
 * 
 * モバイル環境（iOS/iPadOS/Android）におけるObsidianプラグインの
 * ファイルI/O安全性担保・アトミック書き込み・サスペンド耐性ストレージ実装
 * 
 * 参照構想文書: 20260921_【構想】モバイルファイルIO制約とアトミック保存最適化設計
 */

import { DataAdapter, Platform, Plugin } from 'obsidian';

export class MobileResilientStorage {
  constructor(private adapter: DataAdapter, private filePath: string) {}

  /**
   * 安全な多段バリデーション付きアトミック書き込み処理
   * 1. 書き込むJSON文字列の事前構文検証
   * 2. 一時ファイル（.tmp）への先行書き込み
   * 3. OS環境別のアトミック置換（iOSでのEEXIST回避：明示的削除後のrename）
   * 4. 書き込み後のファイルサイズおよび完全性検査
   */
  async writeSafe(content: string): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;

    // 1. 書き込むJSON文字列自体の妥当性を事前検証
    try {
      JSON.parse(content);
    } catch (e) {
      throw new Error(`[WorldCraft] 不正なJSONデータのため書き込みを中断しました: ${e}`);
    }

    try {
      // 2. 一時ファイルへの書き込み
      await this.adapter.write(tempPath, content);

      // 3. モバイル環境特有の置換処理
      if (Platform.isMobile) {
        // iOS/iPadOSのAPFS環境では、宛先が存在する場合の上書きrenameが例外を吐くケースがあるため明示的削除を先行
        if (await this.adapter.exists(this.filePath)) {
          await this.adapter.remove(this.filePath);
        }
        await this.adapter.rename(tempPath, this.filePath);
      } else {
        // デスクトップ環境（Electron/Node.js fs）では標準的な置換を試行
        try {
          await this.adapter.rename(tempPath, this.filePath);
        } catch {
          if (await this.adapter.exists(this.filePath)) {
            await this.adapter.remove(this.filePath);
          }
          await this.adapter.rename(tempPath, this.filePath);
        }
      }

      // 4. 書き込み後の完全性検査（サイズ0バイト検知）
      const verifyContent = await this.adapter.read(this.filePath);
      if (verifyContent.length === 0) {
        throw new Error('[WorldCraft] 書き込み後のファイルサイズが0バイトです。OSサスペンドによる書き込み切断を検知しました。');
      }
    } catch (error) {
      // ロールバック: 残存した一時ファイルのクリーンアップ
      if (await this.adapter.exists(tempPath)) {
        await this.adapter.remove(tempPath).catch(() => {});
      }
      throw error;
    }
  }
}

/**
 * モバイルライフサイクル監視とサスペンド時の即時フラッシュハンドラー
 */
export function registerMobileLifecycleHandlers(
  plugin: Plugin,
  storage: MobileResilientStorage,
  getDirtyState: () => boolean,
  flushCallback: () => Promise<void>
): void {
  const handleAppSuspend = async () => {
    if (getDirtyState()) {
      console.log('[WorldCraft] アプリのサスペンド・バックグラウンド移行を検知。未保存データを強制同期フラッシュします。');
      await flushCallback();
    }
  };

  // ブラウザ／Web標準のライフサイクルイベント
  plugin.registerDomEvent(window, 'pagehide', handleAppSuspend);
  plugin.registerDomEvent(window, 'beforeunload', handleAppSuspend);

  // モバイルネイティブ（Capacitor/Cordova）のサスペンドイベント
  plugin.registerDomEvent(document, 'pause', handleAppSuspend);
}

/**
 * 実行環境に応じた動的デバウンス時間の算出
 * モバイル端末ではバッテリー消費・発熱抑制のため 800〜1200ms に自動延長
 */
export function getOptimizedDebounceMs(): number {
  return Platform.isMobile ? 1000 : 300;
}
