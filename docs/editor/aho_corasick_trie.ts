/**
 * WorldCraft Reference Asset: aho-corasick-trie.ts
 * 
 * 10万文字以上の長編原稿でもCPU負荷をかけずにサブミリ秒で
 * 複数用語・誤表記を走査する Aho-Corasick 多重文字列検索オートマトン
 * 
 * 参照構想文書: 20260921_【構想】モバイルファイルIO制約とアトミック保存最適化設計
 */

export interface MatchResult {
  start: number;
  end: number;
  keyword: string;
  payload: any;
}

class TrieNode {
  children = new Map<string, TrieNode>();
  fail: TrieNode | null = null;
  outputs: Array<{ keyword: string; payload: any }> = [];
}

export class AhoCorasickAutomaton {
  private root = new TrieNode();

  public addPattern(keyword: string, payload: any = null): void {
    let current = this.root;
    for (const char of keyword) {
      let next = current.children.get(char);
      if (!next) {
        next = new TrieNode();
        current.children.set(char, next);
      }
      current = next;
    }
    current.outputs.push({ keyword, payload });
  }

  public build(): void {
    const queue: TrieNode[] = [];

    // Root の深さ 1 のノードはすべて fail = root
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    // BFS で失敗遷移リンク (Failure Link) を構築
    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const [char, childNode] of current.children.entries()) {
        let fallback = current.fail;
        while (fallback && !fallback.children.has(char)) {
          fallback = fallback.fail;
        }
        childNode.fail = fallback ? fallback.children.get(char)! : this.root;

        // 辞書出力リンク (Dictionary Link) の統合
        if (childNode.fail && childNode.fail.outputs.length > 0) {
          childNode.outputs = childNode.outputs.concat(childNode.fail.outputs);
        }

        queue.push(childNode);
      }
    }
  }

  /**
   * テキスト全体を O(N + Z) の線形時間で一括走査
   */
  public search(text: string): MatchResult[] {
    const results: MatchResult[] = [];
    let current = this.root;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      while (current !== this.root && !current.children.has(char)) {
        current = current.fail || this.root;
      }

      current = current.children.get(char) || this.root;

      if (current.outputs.length > 0) {
        for (const out of current.outputs) {
          results.push({
            start: i - out.keyword.length + 1,
            end: i + 1,
            keyword: out.keyword,
            payload: out.payload,
          });
        }
      }
    }

    return results;
  }
}
