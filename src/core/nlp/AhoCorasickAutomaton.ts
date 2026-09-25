/**
 * AhoCorasickAutomaton - Multi-keyword linear-time scanner for long-form literature IDE
 * 
 * Promoted from Gemini Chat prototype asset: aho_corasick_trie.ts
 */

export interface MatchResult<T = unknown> {
  start: number;
  end: number;
  keyword: string;
  payload: T;
}

class TrieNode<T> {
  children = new Map<string, TrieNode<T>>();
  fail: TrieNode<T> | null = null;
  outputs: Array<{ keyword: string; payload: T }> = [];
}

export class AhoCorasickAutomaton<T = unknown> {
  private root = new TrieNode<T>();
  private isBuilt = false;

  public addPattern(keyword: string, payload: T = null as unknown as T): void {
    if (!keyword) return;
    this.isBuilt = false;
    let current = this.root;
    for (const char of keyword) {
      let next = current.children.get(char);
      if (!next) {
        next = new TrieNode<T>();
        current.children.set(char, next);
      }
      current = next;
    }
    current.outputs.push({ keyword, payload });
  }

  public build(): void {
    const queue: TrieNode<T>[] = [];

    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const [char, childNode] of current.children.entries()) {
        let fallback = current.fail;
        while (fallback && !fallback.children.has(char)) {
          fallback = fallback.fail;
        }
        childNode.fail = fallback ? fallback.children.get(char)! : this.root;

        if (childNode.fail && childNode.fail.outputs.length > 0) {
          childNode.outputs = childNode.outputs.concat(childNode.fail.outputs);
        }

        queue.push(childNode);
      }
    }

    this.isBuilt = true;
  }

  public search(text: string): MatchResult<T>[] {
    if (!this.isBuilt) {
      this.build();
    }

    const results: MatchResult<T>[] = [];
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
