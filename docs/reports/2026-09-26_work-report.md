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

### (7) 章の自由な追加・削除・ドラッグ＆ドロップ並び替えUI & インラインリネーム
- **概要**: 原稿目次ペインにおいて、章の順序をHTML5 Drag & Dropで視覚的に並び替え可能にした。
- **実装内容**:
  - `chapter-item` へのDnDイベント実装（ドラッグ中の半透明化、ドラッグオーバー時の挿入インジケータ描画）。
  - `reorderChapters` によるメモリ上配列およびVFS（`/projects/${id}/manuscript/order.json`）の同期更新。
  - 章タイトルのダブルクリックおよび鉛筆ボタンによるインライン入力フォーム（Enterで確定、Escでキャンセル）。
  - 各章ホバー時のゴミ箱削除ボタン（最後の1章は削除禁止保護、確認ダイアログ付き）。

### (8) 登場人物・世界観設定の完全CRUDモーダル & リアルタイム語句インスペクタ連携
- **概要**: 3ペイン左側の「登場人物・世界観」タブにおいて、設定項目の完全なCRUD（作成・編集・削除・本文挿入）とカテゴリ絞り込みを実装。
- **実装内容**:
  - `LoreEntityManager`（`src/core/lore/LoreEntityManager.ts`）を新設。
  - カテゴリ分類（登場人物・重要用語・武具・伏線・拠点）に応じたカラーバッジとフィルタチップ表示。
  - 設定編集モーダル（`#loreModal`）の統合（名称、種別、肩書、生存/回収ステータス、表記ゆれエイリアス、詳細説明）。
  - 右ペイン「設定・伏線」インスペクタ（`LoreInspectorDock`）への自動辞書エクスポートと、本文中の出現語句ハイライト・正式名称へのワンクリック置換。
  - VFS（`/projects/${id}/lore/entities.json`）およびローカルストレージへの二重永続化。

### (9) 因果DAGビュー & Tarjan SCC閉路・循環矛盾検出エンジン
- **概要**: 登場人物や出来事、伏線の因果関係を視覚的な有向グラフ（DAG）として右ペインにインタラクティブ描画。
- **実装内容**:
  - `CausalDagEngine`（`src/core/causality/CausalDagEngine.ts`）を新設。
  - Tarjanの強連結成分（SCC）アルゴリズムによる因果ループ・循環依存の高速検査（`✓ 循環なし (Valid DAG)`）。
  - Kahnのアルゴリズムによるトポロジカルソート。
  - 階層化レイアウトとベジェ曲線、矢印マーカー、関係性ラベルを備えたSVG自動描画（`renderSvgGraph`）。
  - ノードクリックによる設定サマリのポップアップ表示。

---

### (10) 執筆ケイデンス（打鍵リズム・IKI）連動ステートマシン
- **概要**: タイピング打鍵間隔（Inter-Keystroke Interval: IKI）を解析し、執筆者の心理状態に合わせたUI動態制御。
- **実装内容**:
  - `TypingCadenceMachine`（`src/core/editor/TypingCadenceMachine.ts`）。
  - 高速打鍵時（IKI < 200ms）: `burst` 状態（UIノイズ抑制、サイドペイン透明度0.05へ自動遷移）。
  - 短休止（400ms 〜 1000ms）: `short_pause` 状態（UI通常復旧）。
  - 深層推敲（> 1500ms）: `deep_pause` 状態（リント・推敲支援のフェードイン）。

### (11) 多層装飾（物理アンカー・伏線・POV違反検知）衝突調停エンジン
- **概要**: CodeMirror 6 において意味論の異なる複数のテキスト装飾を競合なく重畳描画。
- **実装内容**:
  - `MultiLayerDecoration`（`src/core/editor/MultiLayerDecoration.ts`）。
  - レイヤー優先度調停: Layer 0（物理名詞アンカー）、Layer 1（伏線語句アンカー）、Layer 2（視点主以外の内面心理描写・POV逸脱警告）。
  - 重複範囲の自動分割・優先度適用とホバーツールチップ情報統合。

### (12) 二重時間軸（Sjuzhet vs Fabula）& ファジー時間（TrFN）モデル
- **概要**: 読者体験軸（Sjuzhet: 本文登場順）と作中客観時間軸（Fabula: 出来事の発生順）を対比描画し、回想（フラッシュバック）や伏線回収アークを可視化。
- **実装内容**:
  - `DualTrackTimeline`（`src/core/timeline/DualTrackTimeline.ts`）。
  - 3次ベジェ曲線スプラインによる二軸接続、Analepsis（回想）の逆流ハイライト、台形ファジー数（TrFN: Trapezoidal Fuzzy Number）による不確定年代の包含度計算。

### (13) 未配置設定（Shelved Lore）の自動退避ライフサイクル
- **概要**: 執筆進行に伴い本文から消滅・放置された設定エンティティを自動検知し、未配置棚へ退避・ワンクリック復帰。
- **実装内容**:
  - `ShelvedLoreLifecycle`（`src/core/lore/ShelvedLoreLifecycle.ts`）。
  - スコアリング式 $S_{manual} = 0.4 \times (1 - \text{sim}) + 0.3 \times \text{dangling} + 0.3 \times \text{elapsed}$ による退避候補判定。
  - Alt+P による未配置設定の再バインド（Promote）ショートカット。

---

## 4. 総合判断・今後の役割分担ロードマップ

| 区分 | 対象タスク | 担当・進め方 |
| :--- | :--- | :--- |
| **現行セッション（完遂済み）** | ① 日本語IME入力保護の根本解決<br>② ルビ直接インライン編集の復元<br>③ 縦書き座標補正<br>④ 章切り替え時の履歴完全分離<br>⑤ 下部ステータスバー新設・ボタン揺れ防止<br>⑥ バージョン管理型履歴ロールバック<br>⑦ 仮想ファイル・フォルダ体系（VFS）およびProjectManager基盤構築<br>⑧ 複数作品一覧・切替・新規作成モーダルのIDE統合<br>⑨ 章DnD・削除UI & インラインリネーム<br>⑩ 登場人物・世界観設定の完全CRUDモーダル & 語句インスペクタ連携<br>⑪ 因果DAGビュー & Tarjan SCC循環検知エンジン<br>⑫ Playwrightブラウザ画面操作E2Eテスト自動化 & スクリーンショット検証 | 全改修・150件単体テストPASS・E2Eテスト3件PASS・本番ビルド完了 |
| **外部同期・バックグラウンド最適化（次回スコープ）** | ① OPFSロールバック機能のバックグラウンドWAL同期最適化<br>② 大規模連載（100万字超）向けDAGレイアウトの仮想スクロール | バックグラウンド処理のパフォーマンスチューニング |

---

## 5. プロセス改善とルール永続化（過剰テスト・動揺ループの防止）
- **ユーザー指摘の反省と自己批判**:
  - 単体テストで全ロジックが保証されていたにもかかわらず、CodeMirror内部の仮想DOMセレクタを待ち続ける不安定なPlaywright E2Eテストを繰り返し、Vite環境競合と合わせて無応答ハングを発生させた。
- **恒久的対策の永続化（`AGENTS.md`）**:
  1. **テスト階層規律**: 単体テスト（Vitest）最優先。E2Eブラウザテストは基本スモークテストに限定し、仮想DOMセレクタのポーリング待機を厳禁化。
  2. **動揺・空回り防止サーキットブレーカー**: 3分無応答の即時KILLと、同一コマンド2回連続失敗時の即時メタ認知（3回目の同種再試行禁止）。

---

## 6. 検証結果
- **単体テストスイート**: 全22テストファイル、**173件中173件 PASS**（1.17s）
  - 新設: `tests/cadence-machine.test.ts`（6件 PASS）
  - 新設: `tests/multilayer-decoration.test.ts`（4件 PASS）
  - 新設: `tests/dual-track-timeline.test.ts`（7件 PASS）
  - 新設: `tests/shelved-lore-lifecycle.test.ts`（6件 PASS）
- **本番ビルド**: `pnpm --filter @worldcraft/editor build` 正常終了（434ms）
- **画面キャプチャ資産**: 全7件正常格納（`docs/reports/screenshots/01_plotailor_chapter_dnd.png` 〜 `07_plotailor_shelved_lore.png`）

