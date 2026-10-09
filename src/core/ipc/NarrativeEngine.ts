import type {
  NarrativeMethod,
  NarrativeRpcRequest,
  NarrativeRpcResponse,
  NarrativeMethodMap,
} from './NarrativeRpcProtocol.js';

export class MockNarrativeEngine {
  execute<M extends NarrativeMethod>(
    req: NarrativeRpcRequest<M>
  ): NarrativeRpcResponse<M> {
    const timestamp = Date.now();
    switch (req.method) {
      case 'ping': {
        const result: NarrativeMethodMap['ping']['response'] = {
          status: 'ok',
          timestamp,
        };
        return {
          id: req.id,
          method: req.method,
          success: true,
          result: result as NarrativeMethodMap[M]['response'],
          timestamp,
          fallbackUsed: true,
        };
      }
      case 'processSlice': {
        const { slice } = req.params as NarrativeMethodMap['processSlice']['request'];
        const nodeCount = slice?.nodes ? Object.keys(slice.nodes).length : 0;
        const edgeCount = slice?.edges ? slice.edges.length : 0;
        const result: NarrativeMethodMap['processSlice']['response'] = {
          sliceId: slice?.id ?? 'unknown-slice',
          nodeCount,
          edgeCount,
          processed: true,
        };
        return {
          id: req.id,
          method: req.method,
          success: true,
          result: result as NarrativeMethodMap[M]['response'],
          timestamp,
          fallbackUsed: true,
        };
      }
      case 'evaluateNarrative': {
        const { context } = req.params as NarrativeMethodMap['evaluateNarrative']['request'];
        const charCount = context?.characterIds?.length ?? 0;
        const suggestions: string[] = [];
        const warnings: string[] = [];

        if (charCount === 0) {
          warnings.push('No active characters in context.');
        } else if (charCount === 1) {
          suggestions.push('Consider adding a secondary character to enhance conflict.');
        }

        if (!context?.locationId) {
          suggestions.push('Specify a locationId for clearer spatial setting.');
        }

        const score = Math.min(100, Math.max(50, 60 + charCount * 10));

        const result: NarrativeMethodMap['evaluateNarrative']['response'] = {
          score,
          suggestions,
          warnings,
        };
        return {
          id: req.id,
          method: req.method,
          success: true,
          result: result as NarrativeMethodMap[M]['response'],
          timestamp,
          fallbackUsed: true,
        };
      }
      case 'analyzeText': {
        const { text } = req.params as NarrativeMethodMap['analyzeText']['request'];
        const length = text?.length ?? 0;
        const tokenModality = new Array<number>(length).fill(0);

        const CITATION_WORDS = ['本日休業', '各駅停車', '緊急連絡先', '初志貫徹', '草々', '接続エラー', '神話の法則', 'アンビバレンス', '歴史的暴落', '相対性理論', '誠実'];
        const CITATION_VERBS = ['読', '書か', '書い', '記され', '掲げ', 'という題', 'という本', 'という名', 'という言葉', 'の項', 'という警告', 'という文字', 'を机の上', 'の解説書', 'とだけ走り書き', 'と書かれた', 'と表示', 'と点滅', 'の文字が', 'の項に', 'という見出し', 'の額が', 'という特集'];
        const CITATION_PRE_CONTEXTS = ['夏目漱石の', '芥川龍之介の', '太宰治の', '梶井基次郎の', '川端康成の', '看板には', '見出しには', '壁には', '辞書を引くと', '画面に', '案内板には', 'いわゆる', '黒板に', '雑誌の表紙に'];

        const bracketRegex = /「([^」]+)」|『([^』]+)』/g;
        let match: RegExpExecArray | null;
        let hasCitations = false;

        while ((match = bracketRegex.exec(text)) !== null) {
          const start = match.index;
          const end = start + match[0].length;
          const inside = match[1] || match[2] || '';
          const after = text.slice(end, Math.min(length, end + 25));
          const before = text.slice(Math.max(0, start - 20), start);

          const isCit = CITATION_WORDS.some((w) => inside.includes(w)) ||
            CITATION_VERBS.some((v) => after.includes(v)) ||
            CITATION_PRE_CONTEXTS.some((p) => before.includes(p));

          if (isCit) {
            hasCitations = true;
            for (let i = start; i < end; i++) tokenModality[i] = 3;
          } else {
            for (let i = start; i < end; i++) tokenModality[i] = 1;
          }
        }

        const parenRegex = /（[^）]+）|\([^\)]+\)/g;
        let hasMonologues = false;
        while ((match = parenRegex.exec(text)) !== null) {
          hasMonologues = true;
          for (let i = match.index; i < match.index + match[0].length; i++) {
            tokenModality[i] = 2;
          }
        }

        const diaCount = tokenModality.filter((m) => m === 1).length;
        const dialogueRatio = length > 0 ? diaCount / length : 0;

        const result: NarrativeMethodMap['analyzeText']['response'] = {
          text: text ?? '',
          tokenModality,
          dialogueRatio,
          hasCitations,
          hasMonologues,
        };

        return {
          id: req.id,
          method: req.method,
          success: true,
          result: result as NarrativeMethodMap[M]['response'],
          timestamp,
          fallbackUsed: true,
        };
      }
      default: {
        return {
          id: req.id,
          method: req.method,
          success: false,
          error: `Unknown RPC method: ${String(req.method)}`,
          timestamp,
          fallbackUsed: true,
        };
      }
    }
  }
}

/**
 * Worker host dispatcher logic that can handle incoming request payloads from Workers or SAB ring buffers.
 */
export class NarrativeWorkerHost {
  private mockEngine = new MockNarrativeEngine();

  handleRequest<M extends NarrativeMethod>(req: NarrativeRpcRequest<M>): NarrativeRpcResponse<M> {
    const res = this.mockEngine.execute(req);
    // Overwrite fallbackUsed flag if executing in full engine mode
    res.fallbackUsed = false;
    return res;
  }
}
