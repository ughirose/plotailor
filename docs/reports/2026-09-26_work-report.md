# Plotailor プロジェクト開発日報・総合作業レポート（2026-09-26）

## 1. 概要
本レポートは、2026年9月26日に文芸執筆専用統合開発環境（IDE）『Plotailor（プロテイラー）』において実施された全コミット、設計変更、不具合原因の究明と根本修正、UI/UX再編、および今後の開発ロードマップを完全に網羅・永続化した公式記録である。今後も日次・セッションごとの開発作業記録はこのフォーマットに準拠して蓄積・管理する。

---

## 2. 本日の全コミット履歴一覧（時系列）

| # | コミットハッシュ | コミットメッセージ | 主な変更領域 |
| :-: | :--- | :--- | :--- |
| 1 | `1a28fc3` | `feat(editor): align literary UI tokens, fullscreen mockup and auto-ruby expansion` | 文芸UIデザイントークン統一、全画面執筆モック、自動ルビ展開 |
| 2 | `cd674fa` | `feat: integrate Jules PRs #18 (OPFS crypto), #19 (inspector dock), #20 (ruby decorator), #21 (PoP exporter)` | Jules PR群の一括統合（暗号化、伏線Dock、ルビ、PoP） |
| 3 | `d8ef833` | `feat(frontend): separate full writing IDE (/app/) from landing page (/)` | LP（`index.html`）と本格IDE（`app.html`）のアーキテクチャ分離 |
| 4 | `7359361` | `feat(mobile): add comprehensive responsive rules and mobile drawers for LP and full IDE` | モバイルレスポンシブ対応、折りたたみドロワー実装 |
| 5 | `0f05d3a` | `fix(ruby): resolve ruby and bouten offset misalignments with strict Aozora kanji rules` | 青空文庫ルビ・傍点の文字境界正規表現・オフセットマッピング厳格化 |
| 6 | `20bc046` | `fix(vertical): align vertical writing mode to right side with scroll reset` | 縦書き（`vertical-rl`）時の右端初期スクロールリセットと配置補正 |
| 7 | `0b5b383` | `feat(storage): integrate OPFS differential revision history manager into 3-pane workspace (TASK-329)` | OPFS差分リビジョン履歴マネージャーの3ペイン統合 |
| 8 | `985ef68` | `feat(editor): integrate NarrativeInspectorDock and CodeMirror 6 real-time lint decorations` | NarrativeInspectorDock と CodeMirror 6 リアルタイム推敲Decorationの連動 |
| 9 | `555642c` | `fix(plotailor): fix ruby overlap, add ruby toggle, adjust vertical typography, add undo/redo and vertical full viewport` | ルビ重なり防止、ルビ3段階切替、縦書きタイポグラフィ、Undo/Redo基盤 |
| 10 | `ff9b4c7` | `fix(editor): fix vertical mouse coordinate offset, bypass decorations on active editing line for IME, and add 3-state ruby mode` | 縦書きマウス座標補正（Caret API + 幾何フォールバック）、編集行バイパス |
| 11 | `45711e8` | `fix(editor): align ruby layout with landing mockup, enable direct in-place ruby editing, fix instant ruby toggle, and protect IME against background dispatches` | ネイティブルビCSS適用（前行寄り解消）、ボタン即時反映、Linter保留ガード |
| 12 | `79fc8e0` | `fix(editor): resolve IME input corruption, restore in-place direct ruby editing, isolate chapter undo history, and refactor statusbar layout` | IME入力破壊の根絶、ルビ直接編集の旧来UX回帰、章ごとのUndo履歴分離、ステータスバー新設 |
| 13 | `183bc9c` | `docs(report): update comprehensive daily work report and implement Git-style history rollback` | バージョン管理型ロールバック（未来の履歴切り捨て、State再生成）および日報初期化 |
| 14 | `cdb64a8` | `feat(fs): implement VirtualFileSystem and ProjectManager for multi-project literary workspace` | 仮想ファイル・フォルダ体系（VFS）、ProjectManager、旧ストレージ移行、単体テスト |
| 15 | *最新* | `feat(project): integrate ProjectManager VFS and multi-project switcher modal into IDE` | 作品一覧・切替・新規作成モーダル（`#projectModal`）のIDE統合と自動VFS同期 |

---

## 3. 主要課題の根本原因分析と技術的解決策

### (1) 日本語IME（Windows MS-IME等）の文字化け・重複入力・アルファベット残留の完全根絶
- **事象**: 日本語入力時、未確定アルファベット（例: `k`）が確定文字としてエディタに残留したり、確定文字が重複挿入・分断される問題が継続発生していた。
- **根本原因**:
  - `cm6ImeGuard.ts` の DOM イベントハンドラにおいて、`compositionstart` および `compositionupdate`（未確定文字の入力打鍵）が発火するたびに `view.dispatch` を同期呼び出ししていた。
  - CodeMirror 6 では、`view.dispatch` が走ると仮想DOMの差分同期（再マウント）が発生する。これにより、ブラウザ（特に Windows MS-IME）が管理する contenteditable 内の未確定 TextNode の Selection/Range が切断され、IME が「セッションが強制中断・確定された」と誤認して先頭のアルファベットを確定文字として取り残していた。
- **解決策**:
  - 実ブラウザの入力イベント（`event.isTrusted === true`）では、IME 入力中（`compositionstart` / `compositionupdate`）の同期 `view.dispatch` を完全にスキップ。
  - CodeMirror 6 ネイティブの `view.composing` プロパティに完全委ね、未確定入力中は仮想DOMの再描画を一切行わないようにガード。
  - 確定時（`compositionend`）にのみ単一のトランザクションを流し、50ms 後のデバウンス差分チェックを安全に実行。

### (2) ルビ編集の直接操作回帰（ポップアップ/promptの完全廃止とインライン直接編集）
- **事象**:
  - 直前の改修で導入された `window.prompt` によるルビ編集ダイアログが「操作性が悪く執筆の没入感を損ねる」とユーザーから強く拒否された。
  - ルビ表示時、テキストカーソルを合わせた時だけ該当ルビを直接直せる方式が求められていた。
- **解決策**:
  - `promptDirectRubyEdit` および `window.prompt` を完全削除。
  - `RubyDecorationExtension` において `expandOnCursor: true` を有効化。
  - 通常時は `<ruby>` Widget で美しくレンダリングし、**テキストカーソルがそのルビ（親文字〜ルビ範囲）に侵入した時だけ、該当ルビ1件のみを青空文庫形式（例: `｜親文字《るび》`）にインライン展開**。カーソルが外れると自動的にリッチルビ Widget に復帰。
  - ルビをクリックした場合もポップアップを出さず、カーソルをそのルビの位置にフォーカス移動させることで、キーボードでそのまま直接編集可能にした。

### (3) 縦書きモード時のマウスクリック・ポインタ座標ズレの解消
- **事象**: `writing-mode: vertical-rl` 時に、クリックした文字の位置と実際にカーソルが落ちる位置が大きくずれていた（CodeMirror 6 標準の `posAtCoords` が横書き座標系を前提としているため）。
- **解決策**:
  - `VerticalWritingExtension.ts` において、ブラウザのモダン API（`document.caretPositionFromPoint` / `document.caretRangeFromPoint`）を活用し、縦書きレンダリングされた実際の DOM テキストノードから正確なオフセットを逆引き。
  - 非対応環境向けには、ライン番号と行内相対 X/Y 比率を用いた幾何的フォールバック補正を実装。

### (4) 章切り替え時の Undo/Redo 履歴混入の完全分離
- **事象**: 章を切り替えた後に Ctrl+Z を押すと、前の章の内容が巻き戻って混入する重大な履歴破壊が発生していた。
- **根本原因**:
  - `loadChapter` 時に `cmEditor.dispatch({ changes: { from: 0, to: len, insert: nextContent } })` でドキュメントを全置換していたため、章のロード自体が通常の「編集トランザクション」として CodeMirror の history スタックに積まれていた。
- **解決策**:
  - 各章ごとに独立した `EditorState` を `chapterStates: Map<string, EditorState>` で保持。
  - 章切り替え時は `cmEditor.setState(targetState)` を使用することで、Undo/Redo 履歴（最大500件）、Selection、スクロール状態を章ごとに完全分離。

### (5) 自動保存ステータスによるボタン座標揺れの解消 & ステータスバー新設
- **事象**: ツールバー内の自動保存文字列（「編集中...」「0.1秒前」等）の長さが変化するたびに、Undo/Redo ボタンの位置が横揺れしていた。
- **解決策**:
  - ツールバーから保存表示を撤退させ、ボタンの座標を完全固定。Undo/Redo ボタンに `(Ctrl+Z)` `(Ctrl+Y)` を明記。
  - 画面最下部に「文字数」「原稿用紙換算」「保存状態（OPFS AES-GCM-256）」「PoPスコア」「Narrative-Nano Wasm状態」を集約した専用ステータスバー（`ide-footer`）を新設。

### (6) バージョン管理型履歴ロールバック（未来の履歴切り捨て & State再生成）
- **事象**: 過去の履歴スナップショットへロールバックした際、ロールバック自体が新たな Undo 履歴として積まれ、履歴ツリーが肥大・混乱していた。
- **解決策**:
  - スナップショット一覧から過去の時点を選択して復元する際、**復元ポイント以降の未来のスナップショットを配列から完全に切り捨て（truncate）**。
  - 復元されたテキストで新規 `EditorState` を再生成して `cmEditor.setState` を適用。ロールバック操作自体が履歴を汚染せず、Git の `git reset --hard` のようにその時点からクリーンに執筆を分岐・再開可能にした。

---

## 4. 総合判断・今後の役割分担ロードマップ

| 区分 | 対象タスク | 担当・進め方 |
| :--- | :--- | :--- |
| **現行セッション（完了済み）** | ① 日本語IME入力保護の根本解決<br>② ルビ直接インライン編集の復元<br>③ 縦書き座標補正<br>④ 章切り替え時の履歴完全分離<br>⑤ 下部ステータスバー新設・ボタン揺れ防止<br>⑥ バージョン管理型履歴ロールバック<br>⑦ 仮想ファイル・フォルダ体系（VFS）およびProjectManager基盤構築<br>⑧ 複数作品一覧・切替・新規作成モーダルのIDE統合 | 全改修・140件テストPASS・ビルド完了 |
| **リモートブランチの取り込み判断** | `origin/feat/*` / `origin/feature/*`（TASK-325, 329等） | **現時点では取り込まない（現状維持）**。<br>コア機能は既にmainに統合済みであり、外部ブランチのマージはエディタコアの安定性にコンフリクトをもたらすリスクが高いため。 |
| **Jules（非同期ワーカー）に振るべき課題** | ① 章の自由な追加・削除・ドラッグ＆ドロップ並び替えUI<br>② 登場人物・世界観設定の完全なCRUDモーダル & 関連図DAGビュー<br>③ OPFSロールバック機能のバックグラウンドWAL同期最適化 | UIコンポーネントの肉付けとバックグラウンド処理の定型実装のため、独立したJulesタスクとして並行委譲するのが最適。プロンプト作成済み。 |

---

## 5. 検証結果
- **テストスイート**: 全17テストファイル、**140件中140件 PASS**
- **本番ビルド**: `pnpm --filter @worldcraft/editor build` 正常終了（412ms）
