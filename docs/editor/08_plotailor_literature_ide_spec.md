# 08_plotailor_literature_ide_spec

## 【機能・実装仕様書】Plotailor：長編文芸特化ローカル統合執筆環境（Literature IDE）
- 文書ID: 08_plotailor_literature_ide_spec.md
- 対象プロダクト: Plotailor Studio / WorldCraft Literature IDE Engine
- アーキテクチャ特性: 完全Local-First（OPFS / Wasm SIMD / Merkle-Hash Chain）
- ステータス: 新規開発用確定仕様書
- 制定日: 2026-09-24


### 1. プロダクト概要と設計思想
#### 1.1 ビジョンとポジショニング
Plotailor（プロテイラー）は、10万字を超える長編小説・Web小説・ライトノベル・劇伴シナリオの執筆に特化した完全ローカル完結型の文芸統合開発環境（Literature IDE）である。 WorldCraftが「世界全体の物理・因果・マクロ設定（世界のOS）」を担うのに対し、Plotailorは「日々の散文執筆、組版、リアルタイムな設定整合性監査（執筆者の作業台）」を担当する。
#### 1.2 コア設計原則（The Literature IDE Manifesto）
- 本文エディタこそが唯一の真実の源泉（Editor as SSOT）: 設定資料を手作業で手入れさせる「二重管理の罠（Double-Entry Fatigue）」を全廃する。作家が本文を書くそばから設定と時系列が自動抽出され、散文を織ることで世界が立ち上がるラウンドトリップ構造を堅持する。
- 執筆フローの絶対不可侵（Zero Friction & Cadence Alignment）: タイピング中の思考を妨げるポップアップモーダルを全面禁止する。打鍵速度（ケイデンス）に追従してUIノイズを動的に消去する。
- 完全ローカルファーストとデータの不可侵性（Local-First Sovereignty）: 原稿データおよび推論処理は外部クラウドへ一切送信しない。OPFS（Origin Private File System）およびブラウザ内Git/Merkle構造により、機内やオフラインでも全機能がミリ秒単位で稼働する。


### 2. 3ペイン統合IDEレイアウト仕様
画面構成は思考を中断させない「Docked Quadrant」レイアウトを採用し、単発ポップアップ（XxxModal.tsx）を完全排除する。

┌───────────────────────────────────────────────────────────────────────────────┐

│ ヘッダー上段: プロジェクト名 / 保存状態(Local Sync) / 検索(Cmd+K) / エクスポート │

│ ヘッダー下段: [執筆 (Editor)] [プロット (Plot)] [タイムライン] [世界設定 (World)] │

├───────┬───────────────────────────────────────────────────────┬───────────────┤

│ 左    │ 中央メインビュー (Main Viewport: 60%)                 │ 右詳細ドロワー │

│ 側    │                                                       │ (DetailDrawer:│

│ ナ    │ ・CodeMirror 6 縦書き/横書きエディタ                   │  25%)         │

│ ビ    │ ・青空文庫ルビ / 傍点 / 縦中横 / 約物自動整形         │               │

│ ツ    │ ・インライン多層装飾 (物理事実 / 伏線 / POVエラー)    │ ・設定インスペ│

│ リ    │ ・クイックフィックス・インラインポップオーバー        │   クタ        │

│ ｜    │                                                       │ ・未配置ストッ│

│ (15%) │                                                       │   ク(Shelved) │

├───────┴───────────────────────────────────────────────────────┴───────────────┤

│ 下部ドック (Bottom Dock): 上下並列デュアル軸タイムライン / Lint Roller 診断   │

└───────────────────────────────────────────────────────────────────────────────┘
#### 2.1 タイピングケイデンス連動ステートマシン
打鍵間隔（Inter-Keystroke Interval: IKI）に基づき、UIの不透明度および静的解析フィードバックを制御する。

| 状態名 | 判定条件 (IKI) | ペイン不透明度 | トランジション時間 | 描画規則 |
| --- | --- | --- | --- | --- |
| Typing Burst | < 200 ms 連続 | opacity: 0.05 | 300ms (ease-out) | Linter波線・装飾を完全非表示。視界ノイズを遮断 |
| Short Pause | 400〜1,000 ms | opacity: 0.40 | 400ms (ease-in-out) | Layer 2（POV機密漏洩エラー）のみフェードイン |
| Deep Pause | > 1,500 ms 経過 | opacity: 1.00 | 600ms (ease-in) | 全装飾・警告を表示。右ドロワーに対象情報を同期 |

#### 2.2 多層装飾（Decoration）のZ-Indexと競合調停
同一テキスト範囲に複数のアノテーションが重なった場合の描画仕様：

- Layer 0 (物理事実アンカー / Physical Anchor):
  - スタイル: border-bottom: 1px dotted rgba(56, 189, 248, 0.6)（縦書き時は左側）
  - 優先度: Z-Index 10
- Layer 1 (伏線ハイライト / Foreshadowing):
  - スタイル: background-color: rgba(245, 158, 11, 0.15); border-radius: 2px
  - 優先度: Z-Index 20
- Layer 2 (POV機密漏洩エラー / POV Violation):
  - スタイル: text-decoration: wavy underline #ef4444 1.5px（縦書き時は右側）
  - 優先度: Z-Index 30
- 競合調停規則:
  - 縦書きの行間干渉を防ぐため、Layer 2（波線）が存在する場合、Layer 0（点線）を完全マスクする。
  - 背景色は乗算合成（mix-blend-mode: multiply）を適用する。


### 3. 未配置設定（Shelved Lore）のライフサイクル仕様
本文を大幅に推敲・カットした際、丹念に作り込んだ設定が道連れで消滅するのを防止する。
#### 3.1 手動加筆スコア（$S_{manual}$）の計算式
$$S_{manual} = w_l \cdot \ln(L_{note} + 1) + w_f \cdot N_{fields} + w_s \cdot I_{secret} + w_r \cdot N_{relations}$$

- $L_{note}$: 設定ノートの総文字数（重み $w_l = 1.2$）
- $N_{fields}$: ユーザー変更属性数（重み $w_f = 2.0$）
- $I_{secret}$: 最重要機密フラグの有無 1 or 0（重み $w_s = 5.0$）
- $N_{relations}$: 関連リンク数（重み $w_r = 1.5$）
- 判定閾値: $\theta_{shelf} = 4.0$
#### 3.2 状態遷移規則
- 本文からアンカーが消失したエンティティは直ちに DANGLING 状態へ移行（Undoバッファで保護）。
- コミット確定時:
  - $S_{manual} \ge \theta_{shelf}$ $\rightarrow$ SHELVED（未配置棚）へ恒久退避。
  - $S_{manual} < \theta_{shelf}$ $\rightarrow$ 一時的トークンとみなし PURGED（自動消去）。
- 他のシーンで同一固有名詞が入力された場合、インラインに微細な通知（[?]）を点灯させ、右ドロワーから Alt + P（Promote）で即座に本文へ再バインド可能とする。


### 4. デュアル軸タイムラインと接続スプライン仕様
#### 4.1 構造と描画トポロジー
- 読者体験軸（Discourse Track / Sjuzhet）:
  - シーンブロックを文字数比率で線形配置。読者が感じるテンポ感を可視化。
- 客観時間軸（Story Track / Fabula）:
  - 通算絶対日（Continuous Tick）の実時間スケールで配置。時間省略（Ellipsis）は空白として表現。
- 接続スプライン（Connecting Splines）:
  - 上下トラックの対応シーンを三次ベジェ曲線で結合。
  - 順行: 通常の右下がり直線。
  - 回想（アナルプシス）: 左下がり交差曲線（シアン〜青色発光）。
  - 予見（プロレプシス）: 急勾配の右下がり曲線（紫色発光）。
- 伏線回収アーク（Foreshadowing Arcs）:
  - Discourse軸上部に架橋。未回収のまま指定章・部を超過した場合、赤色点滅破線（DANGLING）へ遷移。
#### 4.2 台形ファジー数（TrFN）による曖昧時間モデル
- 4つ組 $\tilde{A} = (a_1, a_2, a_3, a_4)$ による時間区間表現。
- Web Worker 上で $O(1)$ の区間代数演算（$\tilde{A} \oplus \tilde{B}$）を実行し、厳密な年月日が定まっていない設定同士の時系列矛盾を判定。


### 5. 創作プロセス証明（Proof of Process / PoP）
#### 5.1 目的と構成
作家自身の試行錯誤（タイピング履歴、推敲チャーン、思考ポーズ）を暗号学的に担保し、生成AIによる丸投げ嫌疑からクリエイターを防衛する。
#### 5.2 メトリクスと暗号署名
- 人間主体的関与スコア（HCIS）: $$CR = \frac{\Delta_{ins} + \Delta_{del}}{L_{final}}$$ 深層推敲では $CR \approx 1.2 \sim 2.5$ に到達。
- Merkle-Hash Chain: 各編集トランザクションをEd25519秘密鍵でローカル署名し、改ざん不能な監査ログ（Audit Log）をOPFSに追記。
### 6. 日本語IME競合保護および通信フォールバック仕様
#### 6.1 IME変換中（isComposing）の装飾凍結ロック:
- 日本語縦書き環境におけるHeightMap再計算とキャレット跳躍・文字消失を防ぐため、compositionstartからcompositionendの間はWasmからのDecoration適用を完全凍結し、未確定文字列確定後に一括リベースする。
#### 6.2 COOP/COEP未供給環境でのIPCフォールバック:
- crossOriginIsolated === false の環境（サードパーティ埋め込みやヘッダー非対応サーバー）では、SharedArrayBufferから標準の postMessage (Transferable ArrayBuffer) によるチャンク転送へ自動フォールバックする。