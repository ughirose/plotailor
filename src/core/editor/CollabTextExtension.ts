/**
 * CollabTextExtension - CodeMirror 6 協調執筆・本文テキストCRDT同期エクステンション
 *
 * TextCrdtEngine と連携し、ユーザーのローカル入力を CRDT デルタとして送信し、
 * リモートピアからの編集を非破壊的に dispatch 適用する。
 * また、接続中ピアのリモートカーソル・選択範囲を縦書き・横書き双方で高精度に描画する。
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import {
  StateField,
  StateEffect,
  Annotation,
  type Extension,
  Range,
} from '@codemirror/state';
import type { TextCrdtEngine, RemoteCursorInfo, RemoteTextChange } from '../collab/TextCrdtEngine.js';

export const collabRemoteAnnotation = Annotation.define<boolean>();
export const updateRemoteCursorsEffect = StateEffect.define<RemoteCursorInfo[]>();

/**
 * リモートピアのカーソルキャレット Widget
 */
class RemoteCaretWidget extends WidgetType {
  private peerName: string;
  private color: string;
  private isVertical: boolean;

  constructor(peerName: string, color: string, isVertical: boolean = true) {
    super();
    this.peerName = peerName;
    this.color = color;
    this.isVertical = isVertical;
  }

  public eq(other: RemoteCaretWidget): boolean {
    return (
      this.peerName === other.peerName &&
      this.color === other.color &&
      this.isVertical === other.isVertical
    );
  }

  public toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-collab-cursor';
    wrap.style.position = 'relative';
    wrap.style.display = 'inline-block';
    wrap.style.pointerEvents = 'none';
    wrap.style.userSelect = 'none';

    // Caret Bar
    const bar = document.createElement('span');
    bar.className = 'cm-collab-cursor-bar';
    bar.style.position = 'absolute';
    bar.style.backgroundColor = this.color;
    bar.style.zIndex = '40';
    bar.style.pointerEvents = 'none';

    if (this.isVertical) {
      // 縦書き: 文字の上部または横に水平ライン
      bar.style.top = '-2px';
      bar.style.left = '0';
      bar.style.right = '0';
      bar.style.height = '2px';
      bar.style.boxShadow = `0 0 4px ${this.color}`;
    } else {
      // 横書き: 垂直ライン
      bar.style.top = '0';
      bar.style.bottom = '0';
      bar.style.left = '-1px';
      bar.style.width = '2px';
      bar.style.height = '1.2em';
      bar.style.boxShadow = `0 0 4px ${this.color}`;
    }

    // Name Label Pill
    const label = document.createElement('span');
    label.className = 'cm-collab-cursor-label';
    label.textContent = this.peerName;
    label.style.position = 'absolute';
    label.style.backgroundColor = this.color;
    label.style.color = '#ffffff';
    label.style.fontSize = '10px';
    label.style.fontFamily = 'sans-serif';
    label.style.fontWeight = '600';
    label.style.padding = '1px 5px';
    label.style.borderRadius = '3px';
    label.style.whiteSpace = 'nowrap';
    label.style.zIndex = '50';
    label.style.opacity = '0.9';
    label.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
    label.style.transition = 'opacity 0.2s ease';

    if (this.isVertical) {
      label.style.top = '-1.4em';
      label.style.left = '0';
    } else {
      label.style.top = '-1.3em';
      label.style.left = '0';
    }

    wrap.appendChild(bar);
    wrap.appendChild(label);
    return wrap;
  }
}

/**
 * リモートカーソルと選択範囲の StateField
 */
export const remoteCursorField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // ドキュメント変更に合わせて既存の装飾位置をリベース
    let nextDecos = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(updateRemoteCursorsEffect)) {
        const cursors = effect.value;
        const ranges: Range<Decoration>[] = [];
        const docLen = tr.newDoc.length;

        for (const cursor of cursors) {
          const from = Math.min(Math.max(0, cursor.from), docLen);
          const to = Math.min(Math.max(0, cursor.to), docLen);

          // 選択範囲がある場合 (from !== to)
          if (from !== to) {
            const start = Math.min(from, to);
            const end = Math.max(from, to);
            if (start < end) {
              ranges.push(
                Decoration.mark({
                  attributes: {
                    style: `background-color: ${cursor.color}33; border-radius: 2px;`,
                    class: 'cm-collab-selection-mark',
                  },
                }).range(start, end)
              );
            }
          }

          // カーソルキャレット
          ranges.push(
            Decoration.widget({
              widget: new RemoteCaretWidget(cursor.peerName, cursor.color, true),
              side: 1,
            }).range(to)
          );
        }

        // DecorationSet 構築（昇順ソート必須）
        ranges.sort((a, b) => a.from - b.from || a.to - b.to);
        nextDecos = Decoration.set(ranges);
      }
    }

    return nextDecos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface CollabTextExtensionOptions {
  textCrdtEngine: TextCrdtEngine;
  getCurrentChapterId: () => string;
  isVertical?: () => boolean;
}

/**
 * CodeMirror 6 用 協調執筆エクステンションを生成する
 */
export function createCollabTextExtension(options: CollabTextExtensionOptions): Extension {
  const { textCrdtEngine, getCurrentChapterId, isVertical } = options;

  let cursorDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ViewUpdate リスナー: ローカル入力を検知して CRDT デルタを発行
  const listener = EditorView.updateListener.of((update: ViewUpdate) => {
    const chapterId = getCurrentChapterId();

    // 1. ローカルでのテキスト編集検知
    if (update.docChanged) {
      const isRemoteTransaction = update.transactions.some((tr) =>
        tr.annotation(collabRemoteAnnotation)
      );

      if (!isRemoteTransaction) {
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          const deleteLen = toA - fromA;
          if (deleteLen > 0) {
            textCrdtEngine.handleLocalDelete(chapterId, fromA, deleteLen);
          }
          if (inserted.length > 0) {
            textCrdtEngine.handleLocalInsert(chapterId, fromA, inserted.toString());
          }
        });
      }
    }

    // 2. ローカルでのカーソル移動検知
    if (update.selectionSet || update.docChanged) {
      if (cursorDebounceTimer) clearTimeout(cursorDebounceTimer);
      cursorDebounceTimer = setTimeout(() => {
        const sel = update.state.selection.main;
        textCrdtEngine.broadcastCursor(chapterId, sel.from, sel.to);
      }, 50);
    }
  });

  // ViewPlugin: リモートからの変更受信時に view.dispatch を実行
  const plugin = ViewPlugin.fromClass(
    class {
      private unsubDoc?: () => void;
      private unsubCursor?: () => void;

      constructor(view: EditorView) {
        // リモートからのドキュメント更新を受信
        this.unsubDoc = textCrdtEngine.onRemoteDocChange((change: RemoteTextChange) => {
          if (change.chapterId !== getCurrentChapterId()) return;

          const docLen = view.state.doc.length;
          const from = Math.min(Math.max(0, change.from), docLen);
          const to = Math.min(Math.max(0, change.to), docLen);

          view.dispatch({
            changes: { from, to, insert: change.text },
            annotations: [collabRemoteAnnotation.of(true)],
          });
        });

        // リモートからのカーソル更新を受信
        this.unsubCursor = textCrdtEngine.onRemoteCursorChange((cursors: RemoteCursorInfo[]) => {
          const activeChapterId = getCurrentChapterId();
          const filtered = cursors.filter((c) => c.chapterId === activeChapterId);
          view.dispatch({
            effects: [updateRemoteCursorsEffect.of(filtered)],
          });
        });
      }

      public destroy(): void {
        this.unsubDoc?.();
        this.unsubCursor?.();
      }
    }
  );

  return [remoteCursorField, listener, plugin];
}
