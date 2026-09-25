/**
 * WorldCraft Reference Asset: cm6-lore-completion.ts
 * 
 * 日本語IME変換競合防止ガード（view.composing）を備えた
 * CodeMirror 6 世界観用語・ルビ自動補完拡張
 * 
 * 参照構想文書: 20260921_【構想】モバイルファイルIO制約とアトミック保存最適化設計
 */

import {
  CompletionContext,
  CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

export interface LoreDictionaryEntry {
  id: string;
  name: string;          // 正式名称（例: "魔導石"）
  ruby?: string;         // ルビ（例: "マナストーン"）
  category: 'character' | 'term' | 'item' | 'location' | 'faction';
  description?: string;  // 補完窓に表示する短い説明
}

export function createLoreCompletionSource(dictionary: LoreDictionaryEntry[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { view, explicit } = context;

    // 1. IME入力中（未確定状態）であれば、一切の補完探索を行わない
    if (view && (view as EditorView).composing) {
      return null;
    }

    // 2. カーソル直前の単語またはトリガー文字の境界を判定
    // パターンA: '@' で明示的に呼び出された場合
    const explicitMatch = context.matchBefore(/@[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]*/);
    // パターンB: 通常入力（2文字以上のカタカナまたは漢字）
    const implicitMatch = context.matchBefore(/[\u30A0-\u30FF\u4E00-\u9FFF]{2,}/);

    const match = explicitMatch || (explicit ? implicitMatch : null);
    if (!match) return null;

    // 先頭の '@' を除去した検索クエリ
    const query = match.text.startsWith('@') ? match.text.slice(1) : match.text;
    if (!query) return null;

    // 3. 辞書ノードとのプレフィックス・部分一致検索
    const matchedEntries = dictionary.filter((entry) =>
      entry.name.toLowerCase().includes(query.toLowerCase())
    );

    if (matchedEntries.length === 0) return null;

    return {
      from: match.from,
      options: matchedEntries.map((entry) => {
        // ルビが存在する場合はスニペットとして展開（カクヨム・なろう準拠の構文）
        if (entry.ruby) {
          return snippetCompletion(`｜${entry.name}《${entry.ruby}》#{cursor}`, {
            label: entry.name,
            detail: `[${entry.ruby}] ${entry.category}`,
            info: entry.description,
            type: entry.category,
          });
        }

        return {
          label: entry.name,
          detail: entry.category,
          info: entry.description,
          type: entry.category,
        };
      }),
    };
  };
}
