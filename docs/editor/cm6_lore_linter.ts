/**
 * WorldCraft Reference Asset: cm6-lore-linter.ts
 * 
 * IMEガードおよびワンクリック自動置換（QuickFix）を備えた
 * CodeMirror 6 表記ゆれ・レギュレーション違反Linter
 * 
 * 参照構想文書: 20260921_【構想】モバイルファイルIO制約とアトミック保存最適化設計
 */

import { Diagnostic, linter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';

export interface TermRegulation {
  canonical: string;       // 正式表記（例: "魔導石"）
  forbidden: string[];     // 禁止・誤表記（例: ["魔道石", "魔トウ石"]）
  category: string;
}

export function createLoreLinter(regulations: TermRegulation[]) {
  return linter(
    (view: EditorView): Diagnostic[] => {
      // 1. IME未確定中はリントを完全にバイパス（誤判定波線の抑止）
      if (view.composing) {
        return [];
      }

      const diagnostics: Diagnostic[] = [];
      const doc = view.state.doc;
      const text = doc.toString();

      // 2. 登録された誤表記パターンを高速走査
      for (const reg of regulations) {
        for (const wrongTerm of reg.forbidden) {
          let index = text.indexOf(wrongTerm);
          while (index !== -1) {
            const from = index;
            const to = index + wrongTerm.length;

            diagnostics.push({
              from,
              to,
              severity: 'warning',
              message: `【表記ゆれ】正式設定は「${reg.canonical}」です（現在: ${wrongTerm}）`,
              actions: [
                {
                  name: `「${reg.canonical}」に修正`,
                  apply(view, from, to) {
                    view.dispatch({
                      changes: { from, to, insert: reg.canonical },
                    });
                  },
                },
              ],
            });

            index = text.indexOf(wrongTerm, to);
          }
        }
      }

      return diagnostics;
    },
    {
      // 打鍵終了後、一定の静止時間（デバウンス）を置いてから走査
      delay: 400,
    }
  );
}
