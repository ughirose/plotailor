# 20260924_【リサーチ】WorldCraft競合分析：NolaとCWstudio

## WorldCraft競合分析：NolaとCWstudio
https://gemini.google.com/app/e717d009d646d8b4

User prompt: WorldCraftにおいて、設定資料（エンティティ・時系列）と本文エディタを連携させ、矛盾検知や動的サジェストを実現するためのデータ構造とアーキテクチャ設計について詳しく解説してください。
Response: 世界観設定と本文エディタを緊密に統合し、矛盾検知や動的サジェストを破綻なく動作させるためには、文書データと設定データを独立して管理するのではなく、「ナレッジグラフ（知識グラフ）」と「時系列（タイムライン）」をエディタのドキュメントモデル（AST）にマッピングするアーキテクチャが基盤になると考えられます。
単一の巨大なLLM呼び出しに依存すると、推論コストの高騰やハルシネーション（誤検知・見落とし）、レイテンシの悪化を招くリスクが想定されるため、決定論的なグラフ・アルゴリズムと確率的な言語モデルを組み合わせたハイブリッド設計の妥当性を検証します。
### 1. データ構造設計：設定と時系列のモデル化
世界観の整合性を論理的に検証するためには、キャラクターやアイテムなどの静的な属性だけでなく、「いつ、どこで、誰が、何をしたか」「その時点でどの状態にあったか」という動的な状態遷移を表現できる構造が求められます。
 [Entity: Character] ──(located_at [t1, t2])──> [Entity: Location]         │    (possesses)         ▼  [Entity: Item] ──(state_change [t3])──> "Destroyed"
#### (1) ラベル付きプロパティグラフ（LPG）モデル
各設定要素をノード、関係性をエッジとして定義します。
- Node（エンティティ）:
  - id: UUID
  - type: Character, Location, Faction, Item, Rule/MagicSystem
  - properties: 属性データ（別名・呼称、種族、基礎ステータスなど）
- Edge（リレーション）:
  - source_id, target_id
  - relation_type: FAMILY_OF, HOSTILE_TO, LOCATED_IN, OWNS
  - valid_time_range: 有効期間（例: [t_start, t_end]）
  - properties: 関係性の詳細（感情値、契約条件など）
#### (2) バイテンポラル（二重時間軸）時系列モデル
物語の構造を破綻なく追跡するために、2つの異なる時間軸を分離して保持する手法が有効と考えられます。

| 時間軸 | 定義 | 用途・検証項目 |
| --- | --- | --- |
| 物語内時間（Narrative Time / World Time） | 作中の暦・タイムライン（例: 帝国暦742年4月12日） | 「その時点で死亡しているか」「同時に二箇所に存在していないか（瞬間移動矛盾）」の検証 |
| 執筆・読者提示順（Discourse Time / Chapter Index） | エピソードや章節の並び順（回想、倒叙、視点変更など） | 読者への情報開示状況（伏線が既出か未出か）、ミステリ構造の整合性確認 |

このモデルにより、「第5章で過去の回想（作中時間: 10年前）を描く際、その時点で死亡していないか」を論理的に切り分けて判定することが可能になります。
### 2. 本文エディタとのバインディング機構
エディタ側（ProseMirrorやTipTapなどのブロックエディタ基盤を想定）では、平文のテキストストリームとグラフエンティティをリアルタイムに対応付ける仕組みが必要となります。
 [Editor Document (ProseMirror)]   └─ Block: Paragraph        ├─ TextNode: "城門前で、"        ├─ TextNode: "アレン" <Mark: entity_id="char_001", state="active">        ├─ TextNode: "は剣を抜いた。"
#### (1) インライン・エンティティ・スパン（Marks / Inline Decorators）
テキスト内の特定トークンに対し、エンティティIDを付与したメタデータ（Mark）を付加します。
- 同期性: ユーザーが本文を編集するたびに、位置オフセット（Start/End Index）がズレる課題に対し、CRDT（Conflict-free Replicated Data Types）やProseMirrorのTransformシステムを利用してインデックスの整合性を担保します。
- 別名解決: キャラクターが「アレン」「彼」「黒髪の騎士」など複数の表現で呼ばれるケースに対応するため、エンティティ辞書にエイリアス配列を保持させます。
#### (2) Aho-Corasick法による高速エンティティ抽出
タイピングごとのサジェストや未リンク単語の検出をLLMに任せると遅延が発生するため、フロントエンド（Web Worker / WASM）でAho-Corasick法（文字列照合アルゴリズム）を走らせる方式が有力視されます。 登録された数千件の固有名詞・別名を辞書木（Trie）として保持し、テキスト入力に対して O(n) （n は入力テキスト長）で瞬時に完全一致・前方一致候補を抽出可能です。
### 3. 矛盾検知・検証パイプラインのアーキテクチャ
すべての検査をリアルタイムに行うとエディタの入力応答性（フレームレート）を損なうため、検査のレイヤーを負荷と即時性に応じて分離する設計が現実的です。
 [User Input]       │      ├─ (Immediate / Client-side) ──> [Aho-Corasick & Local Trie] ──> 動的サジェスト      │      ├─ (Debounced ~500ms) ──────────> [L1: Symbolic Constraint Engine] ──> 静的矛盾警告（下線表示）      │      └─ (Background / On-Demand) ────> [L2: Graph + LLM Verifier] ────────> 意味論的矛盾レポート
#### L1: シンボリック制約エンジン（決定論的・即時実行）
エディタのデバウンス（入力停止後数百ミリ秒）を契機に、クライアント側または軽量なAPIで実行するルール検査です。
- 状態の二重定義チェック:
  - 現在のシーンの「作中時間」において、エンティティの lifespan や status が無効（例: status == "Dead" のキャラクターが発話している）でないかをグラフの属性参照のみで即座に判定。
- 距離・移動速度の制約検査:
  - 直前のシーンでの所在地と現在の所在地、および経過時間から、移動速度が世界観の許容値（徒歩、馬車、転移魔法などの制約）を超過していないかを計算。
#### L2: セマンティック整合性検証（確率的・非同期実行）
章の保存時やユーザーのリクエスト時に、LLMとナレッジグラフを組み合わせたRAG（GraphRAG）パイプラインを非同期ワーカーで実行します。
- 口調・呼称のドリフト検知:
  - エンティティ設定にある「一人称（僕）」「二人称（お前）」「敬語・タメ口」の制約と、本文中の発話ログを照合。
- 知識境界（Knowledge Cutoff）の検証:
  - 「キャラAはキャラBが裏切り者であることを知っているか？」を作中タイムラインのイベント伝播グラフから導き、知り得ない情報を前提に発言している矛盾を検出。
### 4. 技術選定のトレードオフとROI検証
技術スタックの採用にあたっては、開発・インフラ運用コストと得られるユーザー体験のバランスを精査する必要があります。

| 構成要素 | 候補A: グラフDB専任型（Neo4j / Memgraph） | 候補B: リレーショナル＋拡張（PostgreSQL + CTE + pgvector） | 候補C: ローカル完結型（SQLite / PGlite + WASM） |
| --- | --- | --- | --- |
| アーキテクチャ | エディタ用RDBとグラフDBのポリグロット構成 | 単一DB内でJSONB・再帰クエリ・ベクトル検索を統合 | クライアント（ブラウザ）内で全検証ロジックを完結 |
| 整合性検証能力 | グラフ探索クエリ（Cypher）による高度な経路探索・制約検査が容易 | 階層構造や多対多リレーションはCTEで表現可能だが、複雑化するとクエリ性能が低下 | 単純なルール検査は超高速だが、大規模データや高度な意味解析には不向き |
| インフラコスト | 高（マネージドグラフDBのホスティング費用が継続発生） | 中（既存の一般的なクラウドRDBリソースを活用可能） | 極小（サーバーサイドのコンピュート負荷がほぼゼロ） |
| レイテンシ | ネットワーク往復が発生（~50-100ms） | ネットワーク往復が発生（~30-80ms） | ゼロレイテンシ（即時UI反映） |
| 事業フェーズ適合性 | スケール後、世界観データが巨大化した場合に検討余地あり | 初期〜中期のMVP・商用化フェーズに最適 | オフライン対応・プライバシー重視ツールとして競争力あり |

#### 初期〜成長期における推奨アプローチの検証
初期開発段階において専任グラフDBを導入することは、スキーマ移行の二重管理やインフラ費用の観点からオーバーヘッドが大きいと推察されます。 まずは PostgreSQL（バックエンド）＋ 軽量なクライアントサイドキャッシュ（IndexedDB / Trie） の構成をとり、以下のように責務を分担させる構成が、開発速度およびROIの観点から合理的である可能性が高いと考えられます。
- クライアント側: Aho-Corasickと軽量Trieにより、タイピングを阻害しない動的サジェスト（名前、地名の自動補完）を提供。
- バックエンド側: シーンのメタデータ（登場人物、場所、作中時間）をもとに、リレーショナルDBから関連する制約を抽出し、静的ルール検証を実施。
- オンデマンドLLM連携: 全文走査ではなく、グラフから抽出した「関連エンティティとその状態」のみをコンテキストに含めて推論を行うことで、トークン消費量を最小限に抑えつつ高精度な整合性チェックを実現。

User prompt: すでに検討済みのものが多く含まれているように思うのでドキュメントなど精査して
Response: WorldCraftのアーキテクチャ設計およびドキュメント群（Local-First長編文芸IDEとしての基本方針、OPFS、Z3 WASMによる二重DAG監査、ローカルMCPサーバー機能、多層世界モデル等）に立脚し、前回の一般的なWeb/RDB前提の提案を是正した上で、NolaおよびCWstudioとの構造的差異と技術・ビジネス上の論点を精査・再整理します。
### 1. 検討済みアーキテクチャと前提の再同期
WorldCraftが既に策定している設計仕様は、一般的な「Webベースのテキストエディタ＋クラウドDB」ではなく、「IDE（統合開発環境）水準の形式検証とLocal-Firstなデータ主権」を中核に据えている点に本質的な特徴があります。

| 設計領域 | 既存の一般的な執筆ツール（Nola / CWstudio等） | WorldCraftの策定済み設計仕様 |
| --- | --- | --- |
| データ所有・基盤 | クラウド集中型RDB（マルチテナント） | Local-First（OPFS + 物理ファイル chap_XXX.log） |
| エディタ基盤 | リッチテキスト / 各種独自エディタ | CodeMirror 6（多段階AST変換パイプライン） |
| 検証エンジン | ルールベース文字列照合 / 汎用LLM問い合わせ | Z3 WASMによる二重DAG監査（形式手法・SMTソルバ） |
| 世界観モデル | 単一の属性テーブル / ノート機能 | 多層世界モデル（物理時空層・因果関係層・認識論理層） |
| 外部連携・拡張性 | 閉じたSaaS（自社エコシステム内完結） | ローカルMCPサーバーによる外部エディタ・エージェント連携 |
| 執筆との同期 | 手動参照（Split Viewなど視覚的参照） | ラウンドトリップ構造（本文抽出 ⇔ 制約注入の双方向循環） |

### 2. 競合2製品に対するWorldCraftの自律的ポジション検証
NolaおよびCWstudioの設計思想を踏まえると、WorldCraftの立ち位置は「エディタの使いやすさの改善」という同一レイヤーの競争ではなく、「文芸創作をソフトウェアエンジニアリング（状態管理・静的解析・コンパイル）に近い水準へ引き上げるIDE」としての独自領域を形成していると捉えられます。
 [Nola]               商業化・型重視（フォーム入力＋プラットフォーム囲い込み）   │ [CWstudio]           執筆体験重視（Split View＋自由記述＋組版出力）   │ [WorldCraft]         作劇論理・整合性重視（Local-First IDE＋Z3 WASM＋多層因果モデル）
#### (1) Nolaとの構造的差異：固定フォーム vs 多層世界モデル
- 固定フォームの限界に対するアプローチ:
  - Nolaはキャラクターシート等の「定型項目」を用意することで初等的な構造化を図っていますが、作中の時間経過による状態遷移や、キャラクター間の認識の非対称性（「AはBの裏切りを知らない」）を表現する論理構造を持ちません。
  - WorldCraftの「物理時空・因果・認識」の3層分離モデルは、伏線アークや叙述トリックを形式的に監査可能にする設計であり、長編文芸特有の論理破綻を抑止するアプローチとして高い差別化要因になり得ます。
- 計算リソースとプライバシーの対比:
  - Nolaはクラウド側で「Fish（従量課金）」を介して校正やAI処理を提供しますが、WorldCraftはオンデバイスSLMおよびZ3 WASMによるクライアント完結型推論を指向しています。作家にとって最も機密性の高い未公開原稿・プロットをローカル境界内に留められる点は、データ主権（Privacy-First）の観点から明確な強みとなります。
#### (2) CWstudioとの構造的差異：受動的参照 vs 能動的ラウンドトリップ
- 画面分割（Split View）の先にある体験:
  - CWstudioは「左に設定、右に本文」を並べることで人間の視線移動による手動確認をサポートしています。
  - 対してWorldCraftの設計意図は、CodeMirror 6上の本文から状態変化イベントをパース（リバース）し、逆に世界観モデルの制約をエディタ側へインライン投影（フォワード）する「機械的支援」にあります。作家自身のワーキングメモリに依存した照合負荷をシステム側へオフロードする設計思想です。
### 3. 競合機能から見たWorldCraftの未着手・検証課題
既存ドキュメントにおいて「E2Eテスト」「デスクトップ移行」「オントロジー拡張」が検討課題として挙げられている文脈を踏まえ、競合分析から得られる示唆を検証します。
#### (1) オントロジー拡張と「形式手法の過剰性」のバランス
- 課題の所在:
  - Z3 WASMを用いた厳密な二重DAG監査は、論理破綻の検知において強力な裏付けを持つ一方、オントロジー（概念体系）を複雑化しすぎると、作家側に入力・モデリングの過剰な負担（Formalization Overhead）を強いる危険性があります。
  - Nolaのレビューにおいて「多機能すぎて使い方が直感的にわからない」という離脱要因が発生している点は留意が必要です。
- 検証の方向性:
  - オントロジーの入力を作家に強要するのではなく、Aho-Corasick法によるエンティティ認識とオンデバイス推論を介して、「本文を書くだけでバックグラウンドでDAGが半自動構築される」補助輪的なUXが不可欠になると考えられます。
#### (2) デスクトップ移行（Tauri/Electron）とローカルMCPのシナジー
- 技術・ビジネス価値:
  - CWstudioはWeb/PWAベースの同期を売りにしていますが、WorldCraftがデスクトップアプリ化を進める場合、ローカルMCPサーバー機能の価値が飛躍的に高まります。
  - ローカルファイル（chap_XXX.log）に対する直接アクセス、OSレベルのファイルシステム監視、およびローカルLLM実行ランタイム（Ollama等）との同一マシン内高速IPC通信が可能になり、クラウドインフラ費用ゼロで「高度なAIエージェント協働」を提供できるROI上の優位性が生まれます。
#### (3) 実務的デリグラフィ（組版・エクスポート）の優先度
- 競合の強みからの逆照射:
  - CWstudioはPDF組版（縦書き、ノンブル、柱、目次）やpixiv/青空文庫形式へのエクスポートを実装し、執筆から同人誌印刷・投稿までのラストワンマイルを押さえています。
  - WorldCraftのマスタープランにおいて、世界観モデルの厳密性にリソースを配分しつつも、CodeMirror 6のASTから最終成果物（投稿用テキストやEPUB/PDF）を生成するパイプラインをどのフェーズでどの程度作り込むかが、実利用への定着率（Retention）を左右する論点になると想定されます。

User prompt: 下記のXの一部の意見も参考にしてみてください Nolaの校正および執筆環境に対するユーザーの反応・考察 校正精度の厳密さと執筆テンポのバランス 投稿内では「同じ助詞が続いている」といった細部の指摘が機能している様子がうかがえます。構文や表現の重複を機械的に検知できる利便性がある一方で、リズムや文体を重視する創作者にとっては指摘の頻度が執筆の勢いと干渉し得る側面もあり、通知の受け止め方には個人差が生じる可能性が考えられます。 校正機能・執筆支援に対する評価 評価の方向性具体的なユーザーの意見・感想強み・メリット・表記ゆれや小説特有のルール（助動詞の使い方など）の指摘がWord等よりも適確。 ・自動字下げや、三点リーダー（……）、ダッシュ（――）、カギカッコのワンクリック入力が執筆速度向上に直結している。 ・校正指摘の多さに驚きつつも、その精度の高さから課金を検討する声や、アシスタント猫に褒められることでモチベーションを維持する声がある。 仕様への不満・課題・「算用数字を漢数字に変換する」といった提案に対し、独自のローカルルールすぎると感じるユーザーが存在。 ・校正提案画面上で手動で書き換えたテキストが反映・保存されず、システムの提案を受容するしかない仕様への不満。 ・小説投稿サイトの「生成AI不使用」規定に対し、Nolaの自動校正機能がこれに該当するのか判断に迷う懸念の声。 機能の柔軟性・自分の文体を優先したい場合、校正機能自体をOFFにできる点が好意的に受け止められている。 デスクトップβ版に対するフィードバック 現在テスト中のPC向けデスクトップアプリに対して、UI/UXの観点から多くの実践的な意見が交わされています。 高く評価されている点：オフライン環境を挟んだ作業後の同期・差分比較の案内が親切。プロット入力画面やフォルダを畳めるサイドメニューがWeb版より直感的になり、資料を並べて表示できる機能も有用とされています。 改善が求められている点：保存ボタンなどの重要なUIの視認性（同系色で分かりにくい）、縦書き表示時のページ区切り・ページ番号表示の要望、原稿上端のクリック判定の甘さ。「ベータ版では校正の修正候補が出ない」という指摘もあり、現状ではWeb版を完全に代替するまでには至っていないという意見も見られます。 執筆ワークフローにおけるNolaの立ち位置 ユーザーの多くはNola単体で全工程を完結させるのではなく、各ツールの強みを組み合わせたエコシステムの一部として活用しています。 一般的な連携パイプライン：Googleドキュメントやスマホのメモ（初稿） ➔ Nola（クラウド同期・推敲・校正） ➔ 一太郎や縦式、Novel Supporter（最終校正・組版・PDF化） スマホアプリ（フリック入力）とPCやiPad間で瞬時に原稿を同期できる利便性が高く評価されており、「場所を選ばずどこでも書ける」ことが、Nolaが執筆ツールとして選ばれ続ける中核的な理由となっています。
Response: 提示されたX上のフィードバックや利用実態からは、単なる機能の有無にとどまらず、「作家の認知的フロー（執筆テンポ）」「提案UIの柔軟性」「コンテスト規約に対するコンプライアンス意識」「マルチツール前提のワークフロー」といった、創作者が現場で直面している具体的な摩擦（フリクション）が読み取れます。
これらの知見をWorldCraftの設計仕様（Local-First、CodeMirror 6、Z3 WASMによる二重DAG監査、多層世界モデル、ローカルMCP）と照らし合わせ、どのような技術的・プロダクト的判断が妥当か検証を進めます。
### 1. 創作者のリアルな反応から見える設計課題の検証
#### (1) 厳密さと執筆テンポのトレードオフ（フロー状態の阻害）
- 実態の観察:
  - 助詞の連続や表現重複などの機械的指摘は歓迎される一方で、執筆中に過剰な警告や赤い波線が出続けると、作家の思考の流れ（フロー状態）を分断する要因になり得ます。
  - 小説執筆においては「意図的な文体崩し」「倒叙やリズム重視の文脈」が存在するため、一律のルール適用はストレスを生みやすい構造が確認できます。
- WorldCraftへの示唆:
  - Z3 WASMによる因果・時空の二重DAG監査やオントロジー検証は極めて厳密である反面、これをタイピングのたびにインラインで即時警告（Blocking）すると、執筆体験を著しく損なう懸念があります。
  - コンパイル型の思想を取り入れ、「タイピング中（執筆モード）」は最小限の軽量サジェスト（Aho-Corasick）に留め、章の節目や明示的なアクション時（「世界観ビルド / 整合性チェック実行」）にDAG監査を走らせるといった、実行レイヤーの明確な分離が有効と考えられます。
#### (2) 校正提案画面の「非可逆性」と編集権限の断絶
- 実態の観察:
  - 「提示された差分をそのまま適用するか、却下するか」の二者択一しか選べず、提案画面上で直接リライトした内容が保存されない点に不満が集まっています。
  - 作家にとって校正の指摘は「修正のトリガー」に過ぎず、指摘を受けて自らの手で別の表現へ書き直す作業が本質です。
- WorldCraftへの示唆:
  - CodeMirror 6のAST（抽象構文木）と連携したUI設計において、提案はモーダルで確定させる閉じたものではなく、エディタ本文とシームレスに同期している必要があります。
  - 指摘箇所をクリックするとエディタ側の該当ノードにフォーカスが当たり、ユーザーが手動でリライトした瞬間にASTが再パースされ、警告が自然に消去（または再評価）されるような双方向エディタ体験が求められると推察されます。
#### (3) 「生成AI不使用規定」とシンボリックAIのコンプライアンス価値
- 実態の観察:
  - 公募や小説投稿サイトで「生成AIによる本文生成の禁止」が明文化されるケースが増加しており、ツール内のAIアシスタント機能を使うこと自体が出品資格の剥奪につながるのではないかという不安がユーザー層に存在します。
- WorldCraftのポジショニング優位性:
  - WorldCraftのコアである「Z3 WASMを用いたDAG監査」や「Aho-Corasick法によるエンティティ追跡」は、確率的な生成モデル（LLM）ではなく、完全に論理的・決定論的な「シンボリックAI / 形式検証アルゴリズム」です。
  - 「本文を勝手に生成・補完するAIではなく、文芸用の静的解析・型チェッカー（Linter / Compiler）である」という技術的境界を明確に示すことは、公募や商業化を目指す作家にとって「作品のオリジナリティを法制・規約面で証明できる」という強力なビジネス価値（信頼性）になり得ます。
### 2. ワークフローの分断とWorldCraftの責務境界
Xのユーザー観察において最も特徴的なのは、「初稿（スマホ/GDrive） ➔ 推敲・校正（Nola） ➔ 最終組版（一太郎/縦式/Novel Supporter）」というパイプラインの多段化です。Nolaですら、執筆から最終出力までの全工程を独占できているわけではありません。
この実態を踏まえると、WorldCraftが目指すべきプロダクト境界について、2つの異なる戦略的スタックが考えられます。

| 観点 | 方針A: オールインワン型（垂直統合） | 方針B: コアIDE＋オープンパイプライン型（UNIX思想） |
| --- | --- | --- |
| 設計アプローチ | 初稿メモからプロット、執筆、組版PDF出力までを自社アプリ内に抱え込む。 | 世界観の論理モデル化・整合性検証に特化し、入出力はオープン標準で他ツールと連携する。 |
| 技術的整合性 | モバイルUI、縦書き組版エンジン、PDFレンダラ等の開発負荷が極めて大きい。 | WorldCraft Open Specification、ローカルMCPサーバー、物理ログ（chap_XXX.log）の強みを直結できる。 |
| ユーザー移行障壁 | 既存の一太郎やスマホ執筆環境を完全に捨てさせる必要があり、乗り換えコストが高い。 | 普段の執筆環境（Obsidian、VSCode、各種エディタ）を維持したまま、MCP経由でWorldCraftの検証機能だけを外付けできる。 |
| ROI / 開発効率 | 単一機能の不備（例: 縦書きの余白調整など）でツール全体が敬遠されるリスク大。 | 差別化の中核である「因果推論・世界線シミュレーション」に開発リソースを集中投下可能。 |

Nolaのデスクトップ版に対する要望（ページ番号の表示、クリック判定、保存ボタンの視認性など）に見られるように、組版やリッチなGUIエディタの作り込みは保守コストが肥大化しやすい領域です。 WorldCraftがLocal-FirstおよびローカルMCPを前提としているのであれば、「世界観と作劇因果の整合性を司るヘッドレスなエンジン（あるいは専任IDE）」としての立ち位置を確立し、外部エディタや既存の組版ツールと疎結合に連携できる設計をとる方が、初期のプロダクトマーケットフィット（PMF）およびROIの観点から合理的である可能性が考えられます。
### 3. Nolaのユーザー課題に対するWorldCraftの設計マッピング

| Nolaユーザーから挙がっている課題 | 根本原因 | WorldCraftにおける技術的裏付け・解決アプローチの検証 |
| --- | --- | --- |
| 細かすぎる指摘が文体やリズムを阻害する | 校正ルールの画一的適用と、執筆中の過剰な割り込み通知 | 監査レイヤーの二段階分離:  執筆中はタイピングを阻害せず、ビルド実行時（または章単位）にZ3 WASMが二重DAGを走査して構造的矛盾をバッチ検証。文体ルールはプロジェクト固有に無効化可能な設計。 |
| 校正画面で手動修正した文章が反映されない | 提案ビューと原稿データが別管理（一方通行のマージ機構） | CodeMirror 6 ASTによる単一情報源（SSOT）:  指摘箇所から直接インライン編集が可能。テキスト編集イベントが直接ASTを更新し、DAGの状態遷移ログ（chap_XXX.log）へ即時反映されるラウンドトリップ構造。 |
| 生成AI利用規約への抵触リスクの不安 | クラウドLLMを用いた機能と従来型機能の境界が曖昧 | 決定論的検証（シンボリック手法）の明示:  Z3やAho-Corasickによる静的解析であることをログや仕様で明示。外部生成AIに依存しない「自己完結型Linter」としてブランディング。 |
| 「どこでも書ける」スマホ同期の要求 | モバイル端末での初稿執筆・アイデア記録ニーズの高さ | OPFSと物理ログを活かした非同期マージ:  重厚なIDE機能をモバイルに移植するのではなく、最小限のテキストログ（chap_XXX.log）を同期・受容し、デスクトップ環境で開いた際に世界観モデルへコンパイルする設計。 |


User prompt: 作家のフロー状態を維持するためのインライン軽量解析と、Z3 WASMによるコンパイル型バッチ検証を分離するアーキテクチャ設計について詳しく検討してください。
Response: 作家の執筆リズム（フロー状態）を阻害せず、かつ文芸作品としての論理的破綻を厳密に排除するためには、プログラミング言語のIDEにおける「シンタックスチェック（即時）」と「静的解析・コンパイル（バッチ）」の責務分離パターンを導入することが有効なアプローチと考えられます。
CodeMirror 6のリアクティブな拡張設計と、Z3 WASMによる形式検証を組み合わせるにあたり、以下の多層レイヤー構造およびパイプラインの妥当性を検証します。
### 1. 2層検証アーキテクチャの全体像
メインスレッドの描画処理（60fps）を死守しつつ、計算負荷の高いSMTソルバを安全に運用するため、処理系を明確に分離する構成が想定されます。

| 評価軸 | Layer 1: インライン軽量解析（フロー維持） | Layer 2: コンパイル型バッチ検証（論理担保） |
| --- | --- | --- |
| 実行タイミング | キーストローク毎（デバウンス 16〜50ms） | 章の保存時、明示的「ビルド」実行時、長時間アイドル時 |
| 実行ランタイム | メインスレッド ＋ Lightweight Worker | Dedicated Web Worker（Z3 WASM専任） |
| 主たるアルゴリズム | Aho-Corasick法、正規表現、増分AST走査 | Z3 SMTソルバ、二重DAGトポロジカルソート |
| 対象データ | 現在編集中のアクティブブロック周辺 | プロジェクト全体の多層世界モデル ＋ chap_XXX.log |
| 検出対象 | 固有名詞サジェスト、表記揺れ、約物ルール | 物理時空の矛盾、因果関係の逆転、認識の非対称性破綻 |
| UIフィードバック | ゴーストテキスト、補完候補、非侵襲なインライン点線 | Diagnosticsパネル（ビルドエラー一覧）、グラフ可視化 |
| 計算複雑度 | O(N)（テキスト長に比例する線形時間） | NP完全〜 decidableフラグメント（最悪ケース指数時間） |

 [User Input]       │      ├─(Immediate / Main Thread) ──> CodeMirror 6 EditorView (60fps Render)      │      ├─(Debounced ~30ms) ──────────> [Worker 1: Aho-Corasick] ──> Inline Decorator / Suggest      │      └─(Save / Idle / Build) ──────> [Worker 2: AST Parser]                                            │ (chap_XXX.log)                                            ▼                                      [Worker 3: Z3 WASM Engine] ──> Diagnostics Panel
### 2. Layer 1: インライン軽量解析の設計（フロー保護）
執筆中の作家の視界に過度なノイズ（真っ赤な波線や警告ポップアップ）を侵入させないため、Layer 1の責務は「補助」と「未確定情報のトラッキング」に限定することが合理的と考えられます。
#### (1) CodeMirror 6 ViewPluginとAho-Corasickの連携
- Viewport限定スキャン:
  - 原稿全体ではなく、現在画面内に表示されている可視領域（Viewport）とその前後数千文字のみを対象にAho-Corasick法を適用します。これにより、数十万字の長編であってもキーストローク時のCPU負荷を数ミリ秒以内に抑えられる可能性が高まります。
- 非侵襲なデコレーション（Decoration.mark）:
  - 検出されたエンティティ（キャラクター名、地名等）には、視覚的に目立たない極薄のアンダーラインや文字色変更のみを付与し、タイピングを妨げる警告メッセージはインラインでは表示しません。
- 先読みサジェスト（Autocomplete）:
  - 作家が固有名詞の一部を入力した段階で、世界観オントロジーから候補を提示します。既存のNola等に見られる「後から直す」スタイルではなく、「入力時点で正式名称を確定させる」ことで、表記揺れ自体の発生を予防する設計です。
### 3. Layer 2: Z3 WASMによるコンパイル型バッチ検証の設計
物理時空・因果・認識の3層にまたがる論理検証は、充足可能性問題（SAT/SMT）として解法を導くため、これをエディタ操作と同期的に実行することは避けるべき要素です。
#### (1) ログ抽出とアサーション変換パイプライン
執筆本文から直接Z3の制約式を組み立てるのではなく、中間表現として物理ファイル（chap_XXX.log）を経由させる多段階パイプラインが整合的と考えられます。
- ASTからのイベント抽出:
  - 章が保存された契機で、パーサーがCodeMirror 6のASTを走査し、「誰が、どこで、何を所持し、誰と対話したか」のイベントタプルを抽出。
- chap_XXX.log への追記:
  - 抽出された状態変更差分をローカルのOPFSストレージ上にあるログファイルへシリアライズ。
- SMT-LIB2 / Z3 ASTへのマッピング:
  - 専用ワーカーがログを読み込み、多層世界モデルの定義（公理）と本文イベント（アサーション）を論理式に展開。
#### (2) Z3 WASMの制約モデリング例
例えば、「物理時空層」と「認識論理層」の交差検証は以下のような公理系としてZ3に投入することが想定されます。
- 物理制約（同時存在の禁止）:∀c,l1​,l2​,t. (Located(c,l1​,t)∧Located(c,l2​,t)⟹l1​=l2​)
- 認識制約（情報伝播の因果律）:Knows(c,FactA​,t)⟹∃t′≤t. Witnessed(c,FactA​,t′)∨∃c′. Told(c′,c,FactA​,t′)
Z3ソルバが check-sat を実行し、結果が UNSAT（充足不能） となった場合、矛盾が発生していると判定されます。さらに get-unsat-core を呼び出すことで、「どの章のどの記述が公理と衝突しているか」を最小の制約集合として特定可能です。
#### (3) タイムアウトと計算量トラップの回避
SMTソルバは複雑な非線形制約や量化子が含まれると停止性が保証されないリスク（タイムアウト）を孕んでいます。
- Z3 WASMインスタンスに対して厳格なタイムアウト制限（例: 2000ms）を設定し、超過時は検証を打ち切って「検証未完了（Unknown）」として扱うフォールバック機構が運用上不可欠になると考えられます。
- また、公理系の記述には可能な限り量化子を含めない「Quantifier-Freeフラグメント（QF_UF, QF_LIA等）」を採用し、解の判定を決定的な時間内に収めるチューニングが現実的です。
### 4. UI/UXにおける認知的負荷の制御
Nolaユーザーのフィードバックにあった「指摘の多さが執筆の勢いと干渉する」という摩擦を回避するため、検証結果の提示方法には段階的なフィルタリングが求められます。
 [Writing Phase: 集中執筆]   └─ 画面内: テキストと薄いエンティティ認識のみ（警告ゼロ）   └─ ステータスバー: 静かなインジケータ（○ Clean / ● Pending Check） [Inspection Phase: 推敲・ビルド]   └─ ショートカット or 保存を契機に「世界観整合性ビルド」が走行   └─ 画面下部 / サイドパネルにDiagnosticsとして問題点を集約表示
- Diagnosticsパネルの階層化:
  - Error（赤）: Z3が検知した論理破綻（死亡キャラの行動、瞬間移動、知り得ない事実の言及）。クリックで該当ブロックへジャンプし、エディタ上で直接修正可能。
  - Warning（黄）: 伏線が長期未回収、時系列の不自然な空白など。
  - Info/Style（青）: 助詞の連続、表記揺れなど文体上の指摘（ユーザー設定で一括非表示が可能）。
- 手動修正の即時追従:
  - Nolaのように「モーダル上で提案を受け入れるか否か」の二者択一にするのではなく、Diagnosticsパネルの項目をクリックすると本文の該当行にカーソルが移動し、ユーザー自身が通常通りリライトできる設計をとります。リライトによりchap_XXX.logが更新されると、バックグラウンドで再検証がスケジュールされ、問題が解消されれば自動的にエラー一覧から消失する動的バインディングが望ましい姿と考えられます。
### 5. 技術的裏付けとROI（ビジネス価値）の検証
このアーキテクチャを採用することによる、開発コストと事業価値のバランスを整理します。

| 評価項目 | 単一LLM/全同期型チェック | 本アーキテクチャ（L1インライン＋L2バッチWASM） |
| --- | --- | --- |
| クラウドアセット原価 | 執筆のたびにAPIコールが発生し、従量課金コストが高騰する。 | $0（全処理がクライアント端末内完結、Local-First）。 |
| オフライン動作 | 不可。通信環境に依存し、モバイルサスペンド時に切断リスク。 | 完全動作。OPFSとWeb Workerのみで自己完結。 |
| 誤検知率（False Positive） | LLMのハルシネーションにより、意図した文体も誤検知されやすい。 | 極小。Z3の数理論理判定による決定論的なエラーのみを報告。 |
| コンプライアンス | 生成AI利用規約に抵触する懸念を作家に抱かせる。 | 「決定論的静的解析（Linter/Compiler）」として規約抵触リスクを排除。 |
| 初期開発負荷 | プロンプト調整のみで着手可能（開発初期は低コスト）。 | 高（Z3公理系の定義、AST抽出器、Worker間通信パイプラインの構築が必要）。 |

初期の設計・実装コストは一定規模を要するものの、サーバーランニングコストの完全な排除、作家のデータ主権（プライバシー）の保護、および「論理的整合性の形式証明」という競合他社が容易に追従できない技術的参入障壁（Moat）を構築できる観点から、長期的なROIは十分に成立するアプローチであると推察されます。

User prompt: CodeMirror 6のASTからchap_XXX.logへ出力するイベントタプルのスキーマ仕様と、それをZ3 WASM用のアサーションに変換するマッピングロジックについて詳しく解説してください。
Response: CodeMirror 6のAST（抽象構文木）から抽出される状態変化を中間ログ（chap_XXX.log）として構造化し、それをZ3 WASM（SMTソルバ）の充足可能性判定用のアサーションへ落とし込むパイプラインについて、データ仕様と変換アルゴリズムの両面から検証を進めます。
### 1. CodeMirror 6 ASTからイベントタプルへの抽出仕様
CodeMirror 6（Lezerパーサー）が構築する構文木に対し、インラインのエンティティ参照（Aho-Corasick法等で解決されたID）と構文パターン（述語・格構造）を組み合わせて、物語のイベントタプルを生成します。
 [CodeMirror 6 Lezer AST]       │       ▼ (Pattern Matcher & Entity Mapper) [Event Tuple Generator]       │       ▼ (Append-only write to OPFS) [chap_XXX.log (JSON-Lines)]
#### (1) chap_XXX.log イベントタプルのスキーマ設計
物理ファイル chap_XXX.log には、1行1イベントのJSON-Lines形式で差分ログを永続化する構成が、パースの独立性と追記性能（Append-Only）の観点から合理的と考えられます。
interface EventTuple {  // イベント固有識別子（Z3のアサーション追跡用ラベルと1:1対応）  id: string; // 例: "ev_chap01_0042"    // 原稿エディタ上の位置座標（逆マッピング用）  source_range: {    chapter: number;    from: number; // CodeMirror 6 Document Offset    to: number;    line: number;  };  // 二重時間軸  time: {    discourse_order: number; // 記述順序（作中の提示順）    narrative_time: number;  // 物語内絶対時間（エポック秒や作中カレンダー刻み）  };  // 多層世界モデルの対象レイヤー  layer: "PHYSICAL" | "CAUSAL" | "EPISTEMIC";  // 状態遷移アクションの定義  action:     // 物理時空層    | "LOCATE" | "MOVE" | "STATE_CHANGE"    // 作劇因果層    | "TRANSFER_ITEM" | "CONSUME" | "KILL"    // 認識論理層    | "WITNESS" | "INFORM" | "CONCEAL";  // 関与エンティティ  actor_id: string;    // 主体（キャラクター、勢力など）  target_id?: string;   // 対象（相手キャラクター、アイテム、場所など）    // ペイロード・制約値  payload: {    origin_loc?: string;      // 移動元    dest_loc?: string;        // 移動先    item_id?: string;         // 対象アイテム    prop_key?: string;        // 変更されたプロパティ（"is_alive", "durability"等）    old_value?: string | boolean | number;    new_value?: string | boolean | number;    proposition_id?: string;  // 伝達・認識された命題（情報単位）  };}
#### (2) イベントタプル実例（JSON-Lines）
第1章のテキスト「城門でアレンはカインから銀の鍵を受け取った」からパースされるタプル例です。
{"id":"ev_c01_015","source_range":{"chapter":1,"from":1240,"to":1262,"line":48},"time":{"discourse_order":15,"narrative_time":10500},"layer":"CAUSAL","action":"TRANSFER_ITEM","actor_id":"char_kain","target_id":"char_aren","payload":{"item_id":"item_silver_key"}}{"id":"ev_c01_016","source_range":{"chapter":1,"from":1240,"to":1262,"line":48},"time":{"discourse_order":16,"narrative_time":10500},"layer":"EPISTEMIC","action":"WITNESS","actor_id":"char_aren","payload":{"proposition_id":"prop_key_transferred"}}
### 2. イベントタプルからZ3 WASMへのマッピングロジック
Z3のSMT-LIB2空間へマッピングする際、全事象を一からソルバに解かせると探索空間が爆発（State Space Explosion）するため、「ドメイン公理（不変則）」をベースに敷き、イベントタプルを「個別のアサーション（事実）」として注入するアプローチが妥当と考えられます。
 [World Model Ontology (Axioms)] ────┐                                     ▼ [Event Tuples (chap_XXX.log)] ───> [Z3 AST / SMT-LIB2 Generator] ──> [Z3 WASM Solver]                                                                            │                                                                   check-sat / get-unsat-core
#### (1) ソート（型）と非解釈関数の宣言
計算量を抑えるため、非線形な述語を排し、未解釈関数（Uninterpreted Functions: QF_UF）と線形整数算術（QF_LIA）のフラグメント内に収めるモデリングが推奨されます。
;; ソートの定義(declare-sort Character)(declare-sort Location)(declare-sort Item)(declare-sort Proposition);; 状態を表現する関数（時間 T におけるスナップショット）;; 物理層: キャラクターの所在地(declare-fun loc (Character Int) Location);; 物理層: 生死状態 (True: 生存, False: 死亡)(declare-fun alive (Character Int) Bool);; 因果層: アイテムの所持者(declare-fun owner (Item Int) Character);; 認識層: キャラクターが命題を知っているか(declare-fun knows (Character Proposition Int) Bool)
#### (2) ドメイン公理（Axioms）の定義
物理法則や因果律を公理として定義します。
;; 公理1: 死亡したキャラクターは自発的アクションを行えない（移動不可）;; 任意のキャラ c が時間 t で死亡している場合、位置は変化しない(assert (forall ((c Character) (t Int))  (=> (not (alive c t))      (= (loc c (+ t 1)) (loc c t)))));; 公理2: 認識の伝播条件;; 時間 t+1 で命題 p を知っているならば、時間 t で既に知っていたか、;; あるいは時間 t で誰かから伝えられた（Inform）か目撃（Witness）したかのいずれかである(assert (forall ((c Character) (p Proposition) (t Int))  (=> (knows c p (+ t 1))      (or (knows c p t)          (witnessed c p t)          (exists ((sender Character))             (and (informed sender c p t)                 (knows sender p t)))))))
#### (3) イベントタプルからアサーションへの変換ルール
マッピング器は、chap_XXX.log の各イベントを走査し、時間軸 t に沿った等式・命題のアサーションを生成します。この際、各アサーションにイベントIDと同じラベルを付与（Named Assertion）することが、後の逆引きにおいて決定的な役割を果たします。

| イベントアクション | SMT-LIB2 アサーション変換マッピング |
| --- | --- |
| LOCATE (actor, dest, t) | (assert (! (= (loc actor t) dest) :named ev_id)) |
| KILL (target, t) | (assert (! (and (alive target t) (not (alive target (+ t 1)))) :named ev_id)) |
| TRANSFER_ITEM (from, to, item, t) | (assert (! (and (= (owner item t) from) (= (owner item (+ t 1)) to)) :named ev_id)) |
| WITNESS (actor, prop, t) | (assert (! (and (witnessed actor prop t) (knows actor prop (+ t 1))) :named ev_id)) |

### 3. ラウンドトリップ：UNSAT Coreからエディタへの逆マッピング
Z3 WASMが論理破綻を検知した場合、ソルバは unsat を返します。ここから「本文エディタのどこにエラーを表示するか」を特定するトレーサビリティの設計が不可欠です。
 [Z3: unsat]     │     ├─> (get-unsat-core) ──> ["ev_c01_015", "ev_c03_089"]     │     ▼ (Lookup in chap_XXX.log index) [Fault Range Identifier]     │     ▼ (Map to CodeMirror 6 State) [Diagnostics / Underline Decoration at Chapter 3, Line 112]
#### (1) 最小矛盾集合（UNSAT Core）の抽出
名前付きアサーション（:named）を使用しているため、Z3の get-unsat-core 命令を実行することで、矛盾を形成する最小のイベントIDリストを取得できます。
(check-sat);; => unsat が返った場合(get-unsat-core);; => (ev_c01_015 ev_c03_089 ax_death_immobility)
この出力により、「第1章のイベント15」と「第3章のイベント89」と「死亡公理」が相互排他的であることが判明します。
#### (2) CodeMirror 6 Rangeへの還元
- インデックス参照:
  - WASMワーカー側で保持しているログのメモリマップから、抽出された ev_c03_089 のメタデータを引きます。
  - { chapter: 3, from: 3410, to: 3455, line: 112 }
- 診断情報の構築（Diagnostics Payload）:interface DiagnosticMessage {  from: number;  to: number;  severity: "error";  message: "論理矛盾: 第1章(L48)で死亡したキャラクターが移動しています。";  relatedLocations: Array<{ chapter: number; from: number; to: number; line: number }>;}
- エディタへの適用:
  - ワーカーからメインスレッドへ診断配列をポストし、CodeMirror 6の lint 拡張または StateField<DecorationSet> をディスパッチして、対象のRangeへインラインの下線や警告アイコンを描画します。
### 4. パフォーマンスと計算複雑性のトレードオフ検証
Z3 WASMをブラウザ内のWeb Workerで稼働させるにあたり、実用性を左右する計算限界と対策を整理します。

| 課題領域 | 潜在的リスク | WorldCraftにおける技術的緩和アプローチ |
| --- | --- | --- |
| 量化子による停止性喪失 | forall や exists の展開によるE-matchingの無限ループ | グラウンディング（Grounding）の事前実行:  可能な限り公理内の量化子を変数展開し、関与する実エンティティのみの命題論理・等式（Ground Instances）に変換してソルバへ渡す。 |
| 長編化に伴うアサーション肥大化 | 全章（数十万字分）のイベントを都度投入するとメモリと解法時間が増大 | 時間枠スライシング（Windowing）:  現在チェック対象の章から作中時間で前後N日（または因果関係のある先行イベント群）のみを有向グラフ探索で抽出し、スコープを絞ってZ3へ投入。 |
| WASMヒープ制約 | ブラウザのメモリ割当制限（通常2GB〜4GB、モバイルではより厳しい） | ソルバの再初期化サイクル:  ビルド毎に (reset) を呼ぶか、Workerプロセス自体を定期的にリサイクルし、WASM線形メモリの断片化を防止。 |

このアーキテクチャを採用することにより、テキストの記述順序（Discourse）に惑わされることなく、多層世界モデルが規定する厳密な因果関係の監査が、ローカル環境内で完結した形で担保可能になると考えられます。

User prompt: Z3 WASMでの計算量爆発を回避するために、公理系の量化子を事前展開（Grounding）して命題論理・等式へ変換するプリプロセッサの具体的な実装設計を教えてください。
Response: Z3 WASMにおいて量化子（∀,∃）を含む一階述語論理式をそのまま解かせると、E-matchingによる無限ループやメモリ枯渇を招くリスクが高まるため、検証対象に関連する具体的なエンティティと離散時間のみに絞り込んで展開する「グラウンディング（Grounding / Instantiation）プリプロセッサ」をパイプラインの前段に配置する設計が有力視されます。
この処理により、ソルバへ渡す論理式を決定論的かつ高速に解ける無量化子断片（QF_UF や QF_LIA）に落とし込むことが可能になります。
### 1. グラウンディング処理の全体アーキテクチャ
単に全エンティティと全作中時間に対して量化子を展開（Brute-force Unrolling）すると、組合せ数が O(∣Entities∣k×∣TimeSteps∣) で爆発するため、プリプロセッサには「検証に関わる最小ドメイン（Active Domain）の動的スライシング」が求められます。
 [chap_XXX.log (Event Tuples)] ────┐                                   ▼ [Ontology Schema] ──────────> [1. Active Domain Harvester]                                   │ (抽出されたキャラ・アイテム・時刻の集合)                                   ▼ [Parametric Axiom Templates] ─> [2. Instantiation Engine (Unroller)]                                   │ (全称→連言 ∧, 存在→選言 ∨)                                   ▼                               [3. Named SMT-LIB2 Formatter]                                   │ (QF_UF / QF_LIA 準拠)                                   ▼                              [Z3 WASM Solver (Worker)]
### 2. プリプロセッサの処理ステップとデータ設計
TypeScriptでWeb Worker内に実装することを想定した、4つの変換ステップの設計です。
#### Step 1: 有効ドメインの収集（Active Domain Harvesting）
検証対象とする章のイベントタプル群から、直接登場するエンティティおよび参照される時間ステップを抽出します。
interface ActiveDomain {  characters: Set<string>;  locations: Set<string>;  items: Set<string>;  propositions: Set<string>;  timeSteps: number[]; // 昇順にソートされた離散時間インデックス}function harvestActiveDomain(events: EventTuple[]): ActiveDomain {  const domain: ActiveDomain = {    characters: new Set(),    locations: new Set(),    items: new Set(),    propositions: new Set(),    timeSteps: []  };  const rawTimes = new Set<number>();  for (const ev of events) {    if (ev.actor_id) domain.characters.add(ev.actor_id);    if (ev.target_id) {      // ターゲットの種別をIDプレフィックスやオントロジーから判定      if (ev.target_id.startsWith("char_")) domain.characters.add(ev.target_id);      if (ev.target_id.startsWith("item_")) domain.items.add(ev.target_id);      if (ev.target_id.startsWith("loc_")) domain.locations.add(ev.target_id);    }    if (ev.payload.dest_loc) domain.locations.add(ev.payload.dest_loc);    if (ev.payload.origin_loc) domain.locations.add(ev.payload.origin_loc);    if (ev.payload.item_id) domain.items.add(ev.payload.item_id);    if (ev.payload.proposition_id) domain.propositions.add(ev.payload.proposition_id);    rawTimes.add(ev.time.narrative_time);    // 状態遷移の次ステップ (+1) もドメインに含める    rawTimes.add(ev.time.narrative_time + 1);  }  domain.timeSteps = Array.from(rawTimes).sort((a, b) => a - b);  return domain;}
#### Step 2: パラメトリック公理テンプレートの定義
公理は量化子を持つハードコードされた文字列ではなく、プレースホルダーを持つテンプレート関数として定義します。
interface AxiomTemplate {  name: string;  layer: "PHYSICAL" | "CAUSAL" | "EPISTEMIC";  // どのドメイン要素を展開パラメータとするかの指定  params: ("Character" | "Location" | "Item" | "Proposition" | "TimeStep")[];  // 具象パラメータを代入してSMT式（文字列）を返すジェネレータ  generate: (bindings: Record<string, string | number>) => string | null;}const axioms: AxiomTemplate[] = [  {    name: "ax_death_immobility",    layer: "PHYSICAL",    params: ["Character", "TimeStep"],    generate: ({ char, t }) => {      // 死亡したキャラは t から t+1 へ移動できない: (!alive(c, t)) => loc(c, t+1) == loc(c, t)      return `(=> (not (alive ${char} ${t})) (= (loc ${char} (+ ${t} 1)) (loc ${char} ${t})))`;    }  },  {    name: "ax_epistemic_propagation",    layer: "EPISTEMIC",    params: ["Character", "Proposition", "TimeStep"],    generate: ({ char, prop, t }, activeDomain) => {      // 存在量化 (exists sender) を、その時点で有効な他キャラ全員の選言 (or ...) に展開      const otherChars = Array.from(activeDomain.characters).filter(c => c !== char);      const informedClauses = otherChars.map(sender =>         `(and (informed ${sender} ${char} ${prop} ${t}) (knows ${sender} ${prop} ${t}))`      );      const causeClause = informedClauses.length > 0        ? `(or (witnessed ${char} ${prop} ${t}) ${informedClauses.join(" ")})`        : `(witnessed ${char} ${prop} ${t})`;      // knows(c, p, t+1) => knows(c, p, t) or 目撃 or 誰かから聞いた      return `(=> (knows ${char} ${prop} (+ ${t} 1)) (or (knows ${char} ${prop} ${t}) ${causeClause}))`;    }  }];
#### Step 3: 量化子の展開と具象インスタンス化
Active Domainのデカルト積（Cartesian Product）を計算し、具体的なSMT-LIB2のアサーション群へ展開します。この際、UNSAT Coreの逆引きを担保するため、展開された各アサーションに「元公理名＋パラメータ」を結合した識別子を付与します。
function instantiateAxioms(  axioms: AxiomTemplate[],  domain: ActiveDomain): { smtCode: string[]; assertionCount: number } {  const assertions: string[] = [];  let count = 0;  for (const ax of axioms) {    // パラメータに対応するドメイン配列を取得    const lists: (string | number)[][] = ax.params.map(p => {      switch (p) {        case "Character": return Array.from(domain.characters);        case "Location": return Array.from(domain.locations);        case "Item": return Array.from(domain.items);        case "Proposition": return Array.from(domain.propositions);        case "TimeStep": return domain.timeSteps;      }    });    // 展開対象が空集合の場合はスキップ    if (lists.some(list => list.length === 0)) continue;    // デカルト積の計算    const combinations = cartesianProduct(lists);    for (const comb of combinations) {      const bindings: Record<string, string | number> = {};      ax.params.forEach((param, idx) => {        const key = param === "Character" ? "char"                  : param === "Proposition" ? "prop"                  : param === "TimeStep" ? "t"                  : param.toLowerCase();        bindings[key] = comb[idx];      });      const formula = ax.generate(bindings, domain);      if (formula) {        // 名前付きアサーションとして出力        const label = `${ax.name}_${Object.values(bindings).join("_")}`;        assertions.push(`(assert (! ${formula} :named ${label}))`);        count++;      }    }  }  return { smtCode: assertions, assertionCount: count };}
### 3. 変換前後のSMT-LIB2比較
具象化プリプロセッサを通すことで、論理構造がどのように変化するかを対比します。
#### 変換前（一階述語論理・量化子あり）
ソルバ側でヒューリスティックなパターンマッチ（E-matching）が必要となり、停止性やメモリ消費が不安定になりやすい形式です。
;; 汎用公理: 存在量化を含む(assert (forall ((c Character) (p Proposition) (t Int))  (=> (knows c p (+ t 1))      (or (knows c p t)          (witnessed c p t)          (exists ((s Character))            (and (informed s c p t) (knows s p t)))))))
#### 変換後（Grounding済・QF_UF 形式）
aren, kain の2名、命題 prop_betrayal、時刻 t=10 に限定して展開された状態です。量化子が完全に除去され、真偽判定が高速なSATソルバ＋合同閉包法（Congruence Closure）の範囲で解ける形になります。
;; アレンに対する t=10 の具象化アサーション（カインからの伝達を選言展開）(assert (! (=> (knows aren prop_betrayal 11)               (or (knows aren prop_betrayal 10)                   (witnessed aren prop_betrayal 10)                   (and (informed kain aren prop_betrayal 10)                         (knows kain prop_betrayal 10))))           :named ax_epistemic_aren_prop_betrayal_10));; カインに対する t=10 の具象化アサーション（アレンからの伝達を選言展開）(assert (! (=> (knows kain prop_betrayal 11)               (or (knows kain prop_betrayal 10)                   (witnessed kain prop_betrayal 10)                   (and (informed aren kain prop_betrayal 10)                         (knows aren prop_betrayal 10))))           :named ax_epistemic_kain_prop_betrayal_10))
### 4. 計算爆発を抑止するガードレール設計
Groundingは量化子のリスクを解消する一方で、「展開後のアサーション数が肥大化する」という別のトレードオフを生みます。これに対処するための運用制御が不可欠です。

| 潜在リスク | 発生条件 | プリプロセッサ側での制御・回避ロジック |
| --- | --- | --- |
| アサーション数の急増 | キャラクター数や時間ステップ数が多い場合（N×M の積） | 事前計算リミッター:  展開前のデカルト積サイズを事前評価し、規定値（例: 合計5,000式）を超える場合は検証スコープを「直前Nシーン」に自動縮退。 |
| 存在量化の選言肥大化 | 登場人物が100人規模の場合の ∃ 展開（100個の or） | スコーレム化（Skolemization）の検討:  選言展開ではなく、目撃者・伝達者を指すスコーレム関数を導入し、事実ログと単一マッチさせる構造への切り替え。 |
| 時間軸の疎密問題 | 作中時間が数日〜数年飛ぶ場合、整数 t を1ずつインクリメントすると無駄な展開が発生 | 密な時間インデックス（Event Time Index）の採用:  実時間の数値ではなく、状態変化イベントが発生したタイミングのみを t0​,t1​,t2​… と離散ステップ化してナンバリング。 |

このグラウンディング層を挟むことで、Z3 WASMは常に数千式以内の閉じた命題・等式系として処理を完結できるようになり、Web Worker内での安定したミリ秒オーダーの充足判定が現実的な設計になると考えられます。

User prompt: 原稿編集のたびに全展開し直すコストを抑えるため、Z3のpush/popスタックを用いたインクリメンタル（漸増的）検証の設計について詳しく教えてください。
Response: 原稿を1文字または1段落修正するたびに、すべての公理系と過去章のイベントをゼロからZ3に再投入して解かせる方式は、長編化に伴って探索空間と通信オーバーヘッドが累積し、エディタの応答性を悪化させる要因になり得ます。
Z3が提供するバックトラッキング機構（push / pop によるアサーションスコープのスタック管理）を文芸執筆のコンテキストに適合させ、確定済みの世界観・過去章の状態をキャッシュしながら、編集中の差分のみを高速に反復検証するアーキテクチャの妥当性を検証します。
### 1. インクリメンタル・スコープスタックの階層設計
Z3のソルバインスタンス内部に、変更頻度に応じた階層的なアサーションスタックを構築することが有効と考えられます。下層ほど静的で変更頻度が低く、上層ほど揮発性が高い構造をとります。
 [Stack Level 2]  Active Scope     : 現在編集中の章・未保存イベント (頻繁に pop / push)        │ [Stack Level 1]  History Scope    : 過去の確定章 (chap_001 〜 chap_K-1) の状態        │ [Stack Level 0]  Base Axiom Scope : 世界観の公理系 (物理・因果・認識のGrounding済み式)

| スタック深度 | スコープ種別 | 投入されるデータ | 変更・再評価のトリガー |
| --- | --- | --- | --- |
| Level 0 | Base Axioms | ソート宣言、未解釈関数、世界観の不変則（物理・因果・認識の共通公理） | プロジェクトの世界観設定（オントロジー定義）の変更時のみ |
| Level 1 | Committed History | 確定済みの先行章（第1章〜第 K−1 章）の全イベントタプル | 先行章の原稿が直接リライトされた場合のみ（低頻度） |
| Level 2 | Active Chapter | 現在エディタで開いている章（第 K 章）のイベントタプル | タイピングに伴うAST再パース（デバウンス後 / 数百ms〜数秒） |
| Level 3 (任意) | Draft Hypothesis | ユーザーが「もしこのキャラをここで殺したら？」と試行する仮想ブランチ | 「世界線プレビュー」実行時のみ一時的に push / pop |

### 2. 編集ライフサイクルに応じたスタック遷移ロジック
エディタ側で発生するイベント種別に応じて、破棄（pop）と再投入（push）の境界をコントロールするパイプラインが求められます。
 [Editor Event: 第K章のパラグラフ編集]       │       ▼ [Check: 現在のスタック深度 == 2 ?]       ├─ Yes ──> Z3.pop(1)  // Level 2 のみを巻き戻し       └─ No  ──> 必要深度まで pop       │       ▼ [Grounding Engine] ──> 編集された第K章の差分イベントのみをSMT式へ展開       │       ▼ [Z3.push()] ─────────> 新しい Level 2 スコープを開始       │       ▼ [Z3.assert()] ───────> 展開された式を投入       │       ▼ [Z3.check-sat()] ────> 判定 (UNSATの場合は get-unsat-core)
#### (1) 同一章内の連続編集（ホットパス）
- 処理フロー:
  - solver.pop(1) を発行し、前回の検証時に投入したLevel 2（該当章のイベント群）を一括破棄。
  - Level 0（公理）およびLevel 1（先行章の確定事実）はZ3内部のデータ構造（E-graphや節データベース）に保持されたまま維持される。
  - CodeMirror 6のASTから新しく抽出された第 K 章のイベントタプルをグラウンディング。
  - solver.push() で新たなLevel 2を作成し、アサーションを投入して check-sat を実行。
- 効果: 先行章の数千〜数万のアサーションの再パースや再事前推論が省略され、ソルバの解法時間は現在編集中の章の局所的な制約充足問題の計算量に抑えられる可能性が高まります。
#### (2) 章の切り替え（コンテキストスイッチ）
- 第 K 章から第 M 章へフォーカスが移動した場合、直前の第 K 章の扱いによって分岐させます。
  - K 章が確定・保存された場合: Level 2を破棄するのではなく、それをLevel 1の履歴チェーンにマージして統合（フラット化）し、新たな章のために改めてLevel 2を切る運用が考えられます。
  - K 章の編集を破棄・中断した場合: 単に solver.pop(1) を行い、第 M 章用のイベントを展開して push します。
#### (3) 過去章の遡行修正（キャッシュ破綻への対処）
第10章を執筆中に第2章の記述を修正した場合、Level 1の前提条件そのものが変化します。このケースでは部分的な巻き戻しが困難となるため、solver.pop(2)（または完全な再初期化）を実行し、Level 1を再構築するフォールバック処理を設ける設計が整合的です。
### 3. Z3 WASM特有のメモリ肥大化とハイブリッド運用
Z3の push / pop はアルゴリズム上非常に洗練されている反面、長時間の稼働においてはWASMランタイム特有の制約とトレードオフが存在することに留意が必要です。
#### (1) 学習節（Learned Clauses）とヒープ断片化の課題
- 内部状態の残存:
  - Z3は探索中に学習した節（Lemmas）の一部を、pop 実行後も内部キャッシュやヒープ領域に保持し続ける挙動を示す場合があります。
  - 長時間の執筆セッションで push と pop を数百回繰り返すと、論理的にはスタックが戻っていてもWASMの線形メモリ（Linear Memory）が肥大化し、最悪の場合はブラウザのメモリクォータ上限（1GB〜2GB程度）に達してクラッシュする懸念があります。
- ガベージコレクションの制約:
  - WASM内のC++ネイティブメモリ確保（malloc/free）はブラウザのJSエンジンによるGCの直接管理外にあるため、断片化によるパフォーマンス低下を招くリスクが想定されます。
#### (2) ハイブリッド・リセット戦略（世代管理）
このメモリ課題を回避するため、厳密な push / pop だけでなく、「条件付きハードリセット」を組み合わせた二重のライフサイクル管理が実用上有効と考えられます。
class IncrementalVerificationManager {  private solver: Z3Solver;  private pushCount = 0;  private readonly MAX_PUSH_CYCLES = 50; // 50回の編集ごとに完全リフレッシュ  async runIncrementalCheck(activeChapterEvents: EventTuple[]): Promise<CheckResult> {    // 一定サイクル数を超過、または先行章の書き換えが発生した場合は完全再初期化    if (this.pushCount >= this.MAX_PUSH_CYCLES || this.requiresFullRebuild) {      await this.hardReset();    } else {      // 直前のアクティブ章スコープを巻き戻し      await this.solver.pop(1);    }    // アクティブ章の投入    await this.solver.push();    await this.injectActiveChapter(activeChapterEvents);    this.pushCount++;    return await this.solver.checkSat();  }  private async hardReset(): Promise<void> {    await this.solver.reset(); // Z3内部状態を完全クリア    await this.injectBaseAxioms();      // Level 0: 公理系の再投入    await this.solver.push();    await this.injectCommittedHistory(); // Level 1: 過去章の再投入    this.pushCount = 0;    this.requiresFullRebuild = false;  }}
### 4. 計算性能とビジネス価値（ROI）の検証
インクリメンタル方式を採用した場合と、毎回ゼロベースで検証（フルリビルド）した場合の特性を比較します。

| 評価軸 | 毎回フルリビルド方式 | push/pop インクリメンタル方式（本設計） |
| --- | --- | --- |
| 1回あたりの検証時間 | 章数 N に比例して線形〜多項式的に増大（長編では数秒〜十数秒） | ほぼ一定（数十ms〜数百ms）。 アクティブ章のサイズのみに依存 |
| キーストロークへの追従性 | 入力ごとに走らせることは不可能（執筆後のバッチ実行に限定） | デバウンスを挟むことで、「段落の書き終え」ごとの準リアルタイム検証が可能 |
| CPU・電力消費量 | 毎回全構文解析・全探索が走るため、端末の発熱・バッテリー消費大 | 差分探索のみで完結するため、ノートPC環境等での省電力性に優れる |
| システム複雑性 | 低（都度初期化して投げるだけ） | 中〜高（スタック深度の追跡、メモリ肥大化の監視とリセット制御が必要） |

インクリメンタル検証の導入により、長編小説（数十万字・数十話規模）であっても、作家が現在執筆している最新章の整合性を、タイピングのリズムを崩さない速度で継続的にチェックできる環境が整います。 これは、クラウドへの依存を排したLocal-Firstアーキテクチャでありながら、デスクトップIDEとしての快適な操作性を両立させるための基盤技術として、極めて投資対効果の高い設計判断であると考えられます。

User prompt: WorldCraftにおいて、複数のプロット分岐（もしこの展開を選んだら？）を同時に比較検証するために、Z3のpush/popスタックをツリー状に管理するブランチ検証アーキテクチャについて詳しく教えてください。
Response: Z3が内部で保持するアサーションスコープは線形スタック（LIFO: 後入れ先出し）であるのに対し、プロットの分岐（「もしAのルートに進んだら」「もしBでキャラが生存していたら」）は木構造（ツリーまたはDAG）の形状をとります。
この構造的なギャップを埋め、単一または少数のZ3 WASMインスタンスで複数の世界線を破綻なく横断検証するためには、ツリー探索アルゴリズム（共通祖先ノードへのバックトラッキング）とZ3のネイティブ機能を組み合わせた複数のアプローチが考えられます。
### 1. ツリー表現とZ3線形スタックを調停する3つのアプローチ
プロット分岐をZ3上で検証する手法としては、主に以下の3方式が候補となり、それぞれ計算量・メモリ消費・実装複雑性に明確なトレードオフが存在します。

| 評価軸 | 方式A: DFS差分トラバーサル（共通祖先巻き戻し） | 方式B: 仮定付き解法（check-sat-assuming） | 方式C: マルチWorkerプール（並列インスタンス） |
| --- | --- | --- | --- |
| Z3制御 | 木の深さ優先探索に沿って pop(N) と push() を反復 | ガード命題（is_branch_A）を付与し、解法時に仮定を指定 | 分岐ごとに独立したWeb Worker / Z3インスタンスを生成 |
| メモリ効率 | 極めて高い（単一インスタンスのスタック領域のみ消費） | 中（全分岐の論理式が1つのソルバ内に共存するため肥大化） | 低（分岐数に比例してWASMヒープが数倍に増大） |
| 分岐切替速度 | 祖先ノードの深さに依存（浅い分岐なら数ミリ秒、幹に近いと再投入コスト発生） | 最速（ゼロオーバーヘッド）。スタック操作なしで仮定を切り替えて check-sat | インスタンス間の同期コストのみ。ただしリソース競合のリスク大 |
| 適用領域 | 章単位の大規模なプロット分岐（中〜長編のルート分岐） | パラグラフ単位の局所的If試行（「この場で剣を抜くか否か」等） | UI上で左右に並べて常時リアルタイム比較する2〜3分岐の並列監視 |

### 2. 方式A: 最近共通祖先（LCA）に基づくDFS差分トラバーサル
大規模な世界線ツリーを効率的に巡回・検証する場合、Gitのブランチ切り替えと同様に「現在地と遷移先の最近共通祖先（Lowest Common Ancestor: LCA）」を特定し、最小限の pop と push でスタックを再同期させるアルゴリズムが基本骨子になると考えられます。
       [Base Axioms] (Stack Level 0)             │       [Root: 第1章〜第3章] (Stack Level 1)        /          \  [Branch Alpha]   [Branch Beta]   (第4章: 同盟成立)   (第4章: 決裂)      │                │  (Level 2)        (Level 2)
#### (1) スタック状態遷移のアルゴリズム
現在 Branch Alpha を検証中のソルバに対し、ユーザーがエディタ上で Branch Beta を選択した際の遷移ロジックです。
interface WorldlineNode {  id: string;              // 例: "branch_alpha_c04"  parentId: string | null; // 親ノードID  depth: number;           // スタック深度  events: EventTuple[];    // 当該ブランチ固有のイベント}class BranchTraverser {  private currentPath: WorldlineNode[] = []; // 現在Z3スタックに積まれているノード経路  async switchBranch(targetNode: WorldlineNode, solver: Z3Solver): Promise<void> {    // 1. 現在のスタック経路とターゲット経路から、最近共通祖先 (LCA) を算出    const targetPath = this.buildPathToRoot(targetNode);    const lcaIndex = this.findLCAIndex(this.currentPath, targetPath);    // 2. 共通祖先より上の分岐（不要になった深さ）を一括 pop    const popsNeeded = this.currentPath.length - 1 - lcaIndex;    if (popsNeeded > 0) {      await solver.pop(popsNeeded);    }    // 3. 共通祖先からターゲットノードまでの差分ブランチを順次 push    for (let i = lcaIndex + 1; i < targetPath.length; i++) {      const nodeToPush = targetPath[i];      await solver.push();      const smtAssertions = groundEvents(nodeToPush.events);      await solver.assertNamed(smtAssertions);    }    // 4. 現在経路を更新    this.currentPath = targetPath;  }}
- 利点: 共通の過去（第1章〜第3章）のアサーションや学習節（Learned Clauses）を破棄せずに維持できるため、根本から全件リビルドするのに比べて大幅な時間短縮が見込めます。
### 3. 方式B: ガード命題による check-sat-assuming（局所Ifの即時比較）
作家が「このシーンでキャラAを退場させるか、生存させるか」をエディタ上でトグルしながら試行錯誤するようなユースケースでは、スタックの push / pop すらオーバーヘッドになる可能性があります。 ここでは、SMTソルバの仮定（Assumption）機能を用いた設計が極めて高い即応性を発揮すると推察されます。
 全事象をガード付きで単一スコープに投入:   (assert (! (=> branch_A (not (alive kain 15))) :named ev_kill))   (assert (! (=> branch_B (alive kain 15))        :named ev_survive)) 検証時のクエリ:   (check-sat-assuming (branch_A)) ──> 結果: SAT / UNSAT   (check-sat-assuming (branch_B)) ──> 結果: SAT / UNSAT
#### (1) 実行モデルの利点と境界
- ゼロ遅延スイッチング:
  - スタックの巻き戻し処理が一切発生しないため、UI上のトグルスイッチの切り替えに合わせて数十ミリ秒以内で両世界線の整合性を即座に判定可能です。
- 適用限界:
  - 世界線全体のイベント数が数千件規模に達すると、単一のソルバインスタンスが保持する節（Clauses）が膨大になり、メモリ枯渇や解法速度の低下を招くリスクが生じます。
  - したがって、「長編の章レベル分岐は方式A（DFSトラバーサル）」で扱い、「同一章内の選択肢分岐は方式B（Assuming）」で処理するハイブリッド構成が実用的な境界線と考えられます。
### 4. ブランチ検証ツリーのデータ構造とOPFSファイル配置
Local-Firstなデータ整合性を維持するため、世界線ツリーの状態はメモリ内だけでなく、OPFS（Origin Private File System）上の物理ファイル構造と疎結合に同期させる設計が整合的です。
 [OPFS Storage Root]   ├─ ontology/   │    └─ axioms.json           # 世界観の不変則（Level 0）   ├─ commits/   │    ├─ c_root_001.log        # 幹となる共通確定ログ   │    ├─ c_alpha_002.log       # 分岐Alphaの差分ログ   │    └─ c_beta_002.log        # 分岐Betaの差分ログ   └─ worldlines.json            # DAGツリーのトポロジー定義
#### (1) worldlines.json（DAGトポロジーメタデータ）
Gitのコミットグラフに類似した構造を持たせ、各ブランチがどのベースログからフォークしたかを追跡します。
{  "active_worldline": "wl_beta",  "nodes": {    "node_base": {      "log_file": "commits/c_root_001.log",      "parent": null,      "narrative_time_range": [0, 12000]    },    "node_alpha": {      "log_file": "commits/c_alpha_002.log",      "parent": "node_base",      "fork_narrative_time": 10500,      "description": "第4章: 同盟受諾ルート"    },    "node_beta": {      "log_file": "commits/c_beta_002.log",      "parent": "node_base",      "fork_narrative_time": 10500,      "description": "第4章: 単独潜入ルート"    }  }}
### 5. 複数世界線における競合検知と作家体験（UI/UX）
複数のプロット分岐を管理する際、作家にとって最も価値があるのは「それぞれの世界線が成立しているか」だけでなく、「世界線同士でどのような因果の分岐（発散）が発生しているか」の可視化です。
 [Worldline Comparison Matrix] ─────────────────────────────────────────────────────────────  エンティティ / 状態      │ Branch Alpha (同盟) │ Branch Beta (単独) ─────────────────────────────────────────────────────────────  カインの生死 (t=15)      │ 死亡 (UNSAT検知: なし)│ 生存 (整合性 OK)  聖剣の所持者 (t=18)      │ アレン              │ 不明 (未回収伏線警告)  王国の崩壊フラグ         │ 回避 (SAT)          │ 発生 (SAT) ─────────────────────────────────────────────────────────────
#### (1) 非破壊的な並行検証ワークフロー
- バックグラウンド投機的検証:
  - 作家がメインエディタで執筆している間、別スレッドのWorkerが未選択のオルタナティブルート（Branch Beta）に対してもLCAトラバーサルを実行し、バックグラウンドで整合性を監査。
- 発散ポイント（Divergence Point）の自動提示:
  - 「Branch Alphaを選ぶと第7章の伏線Cが回収不能になりますが、Branch Betaであれば回収可能です」といった、作劇上の選択によるトレードオフを静的解析結果からレポート。
- マージとチェリーピックの安全性担保:
  - もし作家が「Branch Betaの特定のイベントだけをメインルート（Alpha）に組み込みたい」と考えた場合、Z3を用いてマージ後の整合性を事前に形式検証し、破綻（UNSAT）が発生しないことを証明した上で統合を許可するガードレールを提供。
### 6. 技術的裏付けとビジネス価値（ROI）の検証
プロット分岐の検証エンジンをZ3 WASM上にツリー構造として構築する投資価値を整理します。

| 評価項目 | 従来型の手動管理（付箋・メモ・複数ファイル） | WorldCraftのブランチ形式検証アーキテクチャ |
| --- | --- | --- |
| 整合性担保コスト | 分岐が増えるたびに作家の脳内ワーキングメモリが飽和し、破綻見落としが頻発。 | 数学的証明（SAT/UNSAT）により、分岐数が増加しても論理破綻を確実に排除。 |
| リライト時の心理的抵抗 | 「プロットを大きく変えると過去のどこが壊れるかわからない」恐怖から執筆が停滞。 | LCA差分検証により、変更の影響範囲（Affected Scope）が瞬時に特定され、試行錯誤が容易。 |
| 計算インフラ費用 | クラウドで複数世界線の全文を都度LLMに投げる場合、トークン費用が分岐数に応じて急増。 | $0（ローカル端末内でZ3 WASMが決定論的に判定、完全Local-First）。 |
| 実装・設計の複雑度 | 低（プレーンテキストを別名保存するのみ）。 | 高（LCAアルゴリズム、仮定付き実行制御、OPFS非同期I/Oの統合が必要）。 |

Z3のスコープスタックをツリー探索モデル（LCAトラバーサルおよびAssuming）へと拡張する設計は、実装の難易度は高いものの、「分岐プロットの自由な実験」と「作劇破綻の絶対的な防止」をローカル環境で両立させるための、極めて強固な技術基盤（Moat）になり得ると考えられます。

User prompt: 作家が執筆中にプロット分岐や因果の発散ポイントを直感的に把握・操作できるようにするための、CodeMirror 6エディタとWorldline DAG可視化パネルの連携UI/UX設計について詳しく教えてください。
Response: 世界線（Worldline）の分岐や因果の発散を把握しながら執筆を進める環境において、エディタとグラフ可視化パネルが単に「並んで表示されているだけ」では、作家の認知負荷（視線移動とコンテキスト切り替え）を増大させる要因になり得ます。
CodeMirror 6のリアクティブな拡張機構（StateField, ViewPlugin, WidgetType）と、グラフ視覚化エンジンを双方向に密結合させ、作家のフロー状態を維持しながら構造的把握を可能にするUI/UX設計の妥当性を検証します。
### 1. ワークスペースのレイアウトと画面構成
作家が「執筆に没入するフェーズ」と「世界線の因果を俯瞰・操作するフェーズ」をシームレスに行き来できるよう、可変幅のデュアルペイン構造を採用することが合理的と考えられます。
 ┌───────────────────────────────────────┬───────────────────────────────┐ │ CodeMirror 6 Editor Pane              │ Worldline DAG Pane            │ │ (主執筆領域: フォーカス優先)            │ (因果・分岐可視化: 構造把握)    │ ├───────────────────────────────────────┼───────────────────────────────┤ │ [Gutter] [Text Buffer]                │   (Root: 第1章〜第3章)        │ │                                       │            │                  │ │   10   城門の前で足を止める。         │     [Fork: 運命の選択]        │ │   11   カインは剣を抜いた。           │     /              \          │ │ ⑂ 12 ◆ 「ここで決着をつけよう」       │ [★Alpha]        [Beta]       │ │   13                                  │ (同盟ルート)    (単独潜入)    │ │        ┌────────────────────────────┐ │   │ [SAT]        │ [UNSAT]    │ │        │ Ghost: Betaルート (差分表示)│ │   │              │ (因果衝突) │ │        └────────────────────────────┘ │   ▼              ▼            │ └───────────────────────────────────────┴───────────────────────────────┘

| 構成ペイン | 主たる役割 | 採用コンポーネント / 設計要件 |
| --- | --- | --- |
| Editor Pane（左〜中央） | テキスト執筆・差分編集 | CodeMirror 6 Core  ・Gutter（分岐アイコン、検証ステータス表示）  ・Inline Widget（発散ポイントの要約タグ）  ・Ghost Decoration（他世界線の文脈プレビュー） |
| Worldline DAG Pane（右） | 因果構造・分岐ツリーの俯瞰と切替 | 軽量グラフレンダラ（SVG / Canvas）  ・ノード：章またはキーイベント群  ・エッジ：因果関係・時間の流れ  ・ステータスバッジ：Z3の判定結果（SAT / UNSAT / Pending） |
| Status / Inspector Bar（下部） | 局所的な因果衝突・状態サマリ | 選択中ノードにおける主要キャラのステータス一覧（生死、所持品、認識フラグ） |

### 2. CodeMirror 6とDAGパネルの双方向同期メカニズム
二つのペインが孤立せず、リアルタイムに相互作用するためのイベントバインディングパイプラインの設計です。
 [User Actions in Editor]                     [User Actions in DAG]  ・Cursor movement / Line scroll              ・Click node to inspect  ・Fork branch action at Line X               ・Switch active worldline              │                                            │              ▼                                            ▼ ┌────────────────────────────────────────────────────────────────────────┐ │                      Editor-DAG Syncer (State Manager)                 │ └────────────────────────────────────────────────────────────────────────┘              │                                            │              ▼                                            ▼ [Editor Reflection]                          [DAG Reflection]  ・Update active line mark                    ・Highlight matching node  ・Render inline ghost text                   ・Pan / Zoom to focus  ・Gutter icon color change                   ・Update SAT / UNSAT states
#### (1) エディタ操作からDAGへの前方同期（Editor ➔ DAG）
- カーソル追従（Breadcrumb Highlight）:
  - 作家がエディタ上でカーソルを移動させると、CodeMirror 6の EditorView.updateListener が現在のオフセット（from/to）に対応するイベントタプルIDを解決。
  - DAGパネル側で、そのイベントが属するブランチおよびノードが自動的にハイライトされ、画面外にある場合はスムーズスクロール（Auto-pan）で追従。
- 発散点（Fork Point）の生成:
  - エディタのGutter（行番号の横）に配置された「⑂（分岐アイコン）」をクリック、あるいはショートカットを実行することで、現在の行を基点とした新規ブランチ（Branch Beta）をDAG上に瞬時にフォーク。
#### (2) DAG操作からエディタへの後方同期（DAG ➔ Editor）
- 世界線のゼロ摩擦切り替え:
  - DAG上のノード（例: Branch Beta）をクリックすると、LCA（最近共通祖先）アルゴリズムに基づきZ3スタックが切り替わると同時に、CodeMirror 6のドキュメント状態（EditorState）が対象ブランチのバッファへトランジション。
- フォーカスジャンプ:
  - DAG上で「因果衝突（UNSAT）」の警告バッジが付いたノードをクリックすると、エディタ側がその矛盾の原因となった記述行へ瞬時にジャンプし、該当箇所をフォーカス選択。
### 3. 発散ポイント（Divergence Point）のインラインUX設計
世界線が分岐する境界点において、作家が「何が原因で因果が枝分かれしたのか」を本文中で直感的に認識できるようにするためのUI要素の検証です。
#### (1) Gutterマーカーとステータスバッジ
CodeMirror 6の gutter 拡張を利用し、各行の左端に控えめなインジケータを配置します。
- 分岐トリガー（⑂ アイコン）: その行のイベント（例: 「鍵を受け取った」「キャラを殺害した」）によって世界線が派生していることを示す。ホバーすると、派生先の世界線名（Alpha: 同盟, Beta: 決裂）がポップオーバーで出現。
- 検証シグナル（カラーバー）:
  - 薄い緑（Clean）: Z3監査で全公理を満たしている（SAT）。
  - 赤のアンダーライン（Conflict）: 後続の記述や他世界線との前提で論理破綻が発生している（UNSAT）。
  - 黄色の点線（Dangling Arc）: 伏線やイベントが発生しているが、以後の章で長期間参照・回収されていない。
#### (2) ゴースト・デコレーション（Ghost Text / Diff View）
ブランチ間で文章がどのように分岐しているかを比較する際、画面全体を別タブに切り替えるのではなく、エディタ内に「他世界線の文章をうっすらインライン表示する（Ghost Mode）」機能が有効と考えられます。
// CodeMirror 6 WidgetType によるインライン差分プレビューの実装イメージclass GhostBranchWidget extends WidgetType {  constructor(private branchName: string, private diffText: string) {    super();  }  toDOM() {    const wrap = document.createElement("div");    wrap.className = "cm-ghost-branch-preview";    wrap.innerHTML = `      <span class="badge">別世界線: ${this.branchName}</span>      <p class="ghost-text">${this.diffText}</p>    `;    return wrap;  }}
作家はメインの執筆を継続しながら、直下に半透明で表示される「もう一つの可能性のテキスト」を参照し、表現の重複や展開の重複を視覚的にチェック可能になります。
### 4. グラフ描画エンジンの技術選定とレンダリングトレードオフ
DAGパネルの描画技術は、描画性能、インタラクション性、バンドルサイズの観点から慎重な選定が求められます。

| 選定候補 | メリット | デメリット / リスク | 判定 |
| --- | --- | --- | --- |
| Svelte Flow / React Flow | ノード内にリッチなHTML/UI（ボタン、アバター、バッジ）を直接埋め込み可能。操作系が成熟。 | DOMノード数が増加するとメモリ・描画負荷が急増。数十〜数百ノードの巨大長編でカクつきの懸念。 | 初期〜中規模MVPに最適（UIカスタマイズ性が極めて高い） |
| Cytoscape.js | グラフ理論に特化しており、自動レイアウト（DAG配置、階層ソート）の計算アルゴリズムが標準搭載。 | ノードの装飾（CSS/HTML）に一定の制約があり、リッチなエディタ連携UIの構築に工数がかかる。 | 大規模プロット（数千イベント）の探索に強み |
| カスタム Canvas / WebGL | メモリ消費が極小で、数千ノードを60fpsで描画可能。Local-First思想に合致。 | クリック判定、ホバー、テキスト選択などのUI実装コストが極めて高い。 | 初期投資としては過剰設計のリスク |

#### 推奨アプローチの検証
初期から中期フェーズにおいては、React Flow / Svelte Flow等のHTMLベースのフローライブラリを採用し、ノード数を「章単位（Chapter-level）」または「主要プロットポイント」に抽象化して集約表示する設計が、開発速度とユーザー体験のバランスの観点から合理的と考えられます。イベント単位の微細なノードはクリック時にアコーディオン展開することで、DOM描画負荷の爆発を回避可能です。
### 5. 技術的裏付けとビジネス価値（ROI）の検証
CodeMirror 6とDAGのシームレスなUI連携を実現することによる、プロダクト競争力と開発投資の妥当性を整理します。

| 評価軸 | 既存の画面分割ツール（CWstudio等） | WorldCraft（エディタ・DAG動的連携） |
| --- | --- | --- |
| 発散ポイントの認知 | 作家自身がメモや別ウィンドウを見比べて記憶に頼る。 | エディタ内のインラインアイコンやゴースト表示により、0秒で把握。 |
| ブランチ試行の心理コスト | 差分ファイルの複製（copy_v2.txt）が増殖し、バージョン管理が破綻。 | DAG上でワンクリック分岐し、不要なら安全に破棄可能（Gitライクな体験）。 |
| 破綻への即応性 | 推敲段階で通読するまで、分岐による前提崩れに気づけない。 | Z3の検証結果がDAGノードとエディタGutterに常時同期、早期検知。 |
| 開発投資と保守性 | 低（標準的なテキストエリアを2つ並べるのみ）。 | 高（CodeMirror 6 State拡張、LCAトラバーサル、グラフ描画の統合が必要）。 |

UIの実装難易度は高いものの、競合（Nola、CWstudio）が「平文のメモを横に置く」という静的な体験に留まっているのに対し、「執筆動作そのものが世界線のトポロジーと直結する」という唯一無二のIDE体験を提示できるため、プロやヘビーな設定構築層を惹きつける強力な参入障壁（プロダクトの堀）として機能する可能性が高いと考えられます。

User prompt: 作家がキーボードから手を離さずに世界線を高速に行き来・比較するための、ショートカットおよびコマンドパレットの操作体系設計について詳しく教えてください。
Response: 執筆に没頭している作家にとって、「キーボードから手を離してマウスに持ち替え、グラフノードを探してクリックする」という動作は、集中力（フロー状態）を途絶えさせる大きな認知的フリクションになり得ます。
CodeMirror 6のキーマップ拡張と、VS Code等の統合開発環境（IDE）で実証されているコマンドパレット設計を応用し、指のホームポジションを維持したままプロット分岐を自在に操作・比較するための体系設計について検証を進めます。
### 1. キーボード操作体系の設計原則とコンフリクト回避
小説執筆環境では、一般的なテキスト編集ショートカット（コピー、ペースト、Undo/Redo、検索）に加えて、三点リーダー（……）やダッシュ（――）、カギカッコ、ルビなどの入力補助が頻繁に使われます。世界線操作用のキーバインドがこれらと干渉することは避けなければなりません。
#### (1) キーバインド方式のトレードオフ検証

| 方式 | 特徴 | メリット | 懸念点 / トレードオフ |
| --- | --- | --- | --- |
| 単一コンビネーション型  （例: Cmd+Shift+X） | 1ストロークで即座にアクションが発火する。 | 習得すれば最速で世界線を切り替え可能。 | 割り当て可能なキーの枯渇、OSやIME（日本語入力）との衝突リスク。 |
| プレフィックス型（Leader Key）  （例: Alt+W の後に N） | リーダーキーを押してから次キーで分岐操作。 | 衝突リスクが極めて低く、世界線関連の操作を体系化しやすい。 | 2ストローク必要となり、慣れるまで若干のテンポ低下を招く。 |
| コマンドパレット集約型  （例: Cmd+P / Cmd+K） | ファジー検索窓を開き、文字入力で選択。 | キーの暗記が不要で、初見の学習コストが最も低い。 | 打鍵数が増え、超高速な「反復比較」には不向き。 |

#### (2) 推奨ハイブリッド構成
執筆のテンポを維持するためには、「頻出する反復操作（比較・切り替え）は単一コンビネーション型（Alt / Option 主体）」に割り当て、「破壊的操作やメタ操作（フォーク、マージ、検索）はプレフィックスまたはコマンドパレット」へ逃がす2階層構造が実用的と考えられます。
### 2. コア・キーマップ仕様（世界線ナビゲーション）
執筆画面から視線を動かさずに世界線を遷移・比較するための具体的キーアサインの設計案です。

| 操作カテゴリ | ショートカット (Mac / Win) | アクション概要 | 内部挙動とZ3/エディタ連携 |
| --- | --- | --- | --- |
| 分岐切替 (Nav) | Alt + ] / Alt + [ | 次の世界線 / 前の世界線へジャンプ  （同階層の兄弟ブランチ間を巡回） | LCA（最近共通祖先）アルゴリズムによりZ3スタックを最小巻き戻し、エディタバッファを瞬時置換。 |
| 親/子移動 (Nav) | Alt + Up / Alt + Down | 分岐元（親）へ戻る / 直近の派生（子）へ進む | トポロジカルにツリーの幹と枝を上下移動。 |
| インライン覗き見 (Peek) | Alt + P（長押し / トグル） | 別世界線のパラグラフをゴースト表示 | 現在のパラグラフ位置に対応する「もう一つの世界線」のテキストを半透明で挿入表示。 |
| 即時フォーク (Fork) | Cmd + Shift + B / Ctrl + Shift + B | 現在行を基点に新規世界線を派生 | カーソル位置でイベントログをスライスし、worldlines.json に新ノードを追加。即座に編集可能に。 |
| 論理矛盾ジャンプ (Error) | F4 / Shift + F4 | 直近のUNSAT（論理破綻）箇所へジャンプ | Z3の get-unsat-core が指し示す原因行へカーソルをダイレクト移動。 |

#### インライン・ピーク（Alt + P）の認知的価値
特に Alt + P による「覗き見（Peek）」は、世界線を完全に切り替えることなく「向こうのルートではどう書いていたか」を一瞬だけ確認できるため、作家が思考の文脈（コンテキスト）を失わずに推敲を進める上で極めて高い効力を発揮すると想定されます。
### 3. Worldline Command Palette（クイック・スイッチャー）の設計
Cmd + K（または Cmd + P）で呼び出されるファジー検索パレットは、大規模な世界線ツリーや複雑な作劇因果を俯瞰・検索するためのハブとして機能します。
 ┌───────────────────────────────────────────────────────────────┐ │ > #branch                                                     │ ├───────────────────────────────────────────────────────────────┤ │ # Alpha: 第4章 同盟受諾ルート (Active)                [SAT]   │ │ # Beta:  第4章 単独潜入ルート (2つの矛盾あり)        [UNSAT] │ │ # Gamma: 第4章 カイン生存IFルート (下書き)           [Draft] │ │ ───────────────────────────────────────────────────────────── │ │ [Preview Panel]                                               │ │ ・最終更新: 12分前 (4,200字)                                  │ │ ・因果差分: カイン生存 (+1) / 聖剣未取得 (-1)                 │ │ ・Z3ステータス: UNSAT (第6章 L48 と矛盾)                      │ └───────────────────────────────────────────────────────────────┘
#### (1) モードプレフィックスによる検索スコープの切り替え
1つのパレット内で、入力の先頭文字（シジル）に応じて検索対象を動的に切り替えます。
- #（世界線検索）: プロットブランチのタイトル、概要、タグで検索。矢印キーでハイライトすると、右ペインに差分プレビューが表示される。
- !（矛盾・エラー検索）: Z3 WASMが検知したUNSATエラーや、オントロジー制約違反（死亡キャラの移動、アイテム二重所持など）の一覧を検索。
- @（エンティティ状態検索）: 「@カイン」と入力すると、現在の世界線における特定キャラクターの最新ステータス（位置、生死、所持品、認識している事実）をインライン表示。
- >（操作コマンド）: 「世界線のマージ」「差分のエクスポート」「DAGの再レイアウト」などのIDE操作。
### 4. CodeMirror 6における実装アーキテクチャ
キーボード操作を快適に成立させるためには、キーイベントの捕捉からZ3 WASMの計算、バッファ置換までのパイプラインが画面描画（60fps）をブロックしない非同期設計が求められます。
 [User Key Stroke: Alt + ] ]            │            ▼ [CodeMirror 6 Prec.highest(keymap)] ── (preventDefault)            │            ▼ (Optimistic UI: 即時視覚フィードバック) [EditorState: Set Transition Indicator / Skeleton]            │            ▼ (Async Post to Web Worker) [LCA Engine & Z3 Stack Manager]            │ ├─ solver.pop(N) & solver.push(M)            │ └─ Fetch Branch Text from OPFS            ▼ [Dispatch StateEffect to CodeMirror 6]            │ ├─ doc.replace / update StateField            │ └─ Update Gutter & Diagnostics            ▼ [Render New Worldline Buffer]
#### (1) 楽観的UIと非同期トランジション
- イベントの優先順位付け:
  - CodeMirror 6の Prec.highest を用いて、ブラウザやエディタ標準のキー処理よりも先に世界線操作をハンドリングします。
- 体感ゼロ遅延（Optimistic Transition）:
  - Z3の解法完了を待ってから画面を切り替えると、数百ミリ秒の引っかかり（ジャンク）を感じる要因になります。
  - キーが押された瞬間にまずエディタのバッファテキストを目的の世界線へ切り替え、ステータスバーに「検証中…」の軽量インジケータを表示した上で、バックグラウンドWorkerでZ3のLCAトラバーサルを非同期実行するアプローチが、入力テンポの維持において優位と考えられます。
### 5. 技術的裏付けとビジネス価値（ROI）の検証
キーボード中心の操作体系を初期から組み込むことのプロダクト的・事業的価値を整理します。

| 評価軸 | 一般的な執筆ツール（マウス操作中心） | WorldCraft（キーボード駆動型世界線IDE） |
| --- | --- | --- |
| 作業コンテキストの維持 | ツールを切り替えるたびに視線と身体の動きが分断され、集中力が低下。 | ホームポジションを崩さず、0.2秒で「もしも」の展開を反復試行可能。 |
| ヘビーユーザーの定着率 | 機能が増えるほど画面上のボタンが増加し、UIが煩雑化して離脱を招く。 | コマンドパレットに機能を隠蔽・集約できるため、ミニマルな画面と多機能を両立。 |
| パワーユーザー（プロ層）の獲得 | 既存のWordやNotionと大差ない操作性ではリプレイスの動機が弱い。 | VS CodeやObsidianに慣れたエンジニア気質の創作者やプロ作家にとって強い乗り換え動機（Moat）となる。 |
| 実装・設計コスト | 低（ボタンのクリックハンドラのみ）。 | 中（CodeMirror 6キーマップのカスタマイズ、パレットのUI構築、非同期ステート管理）。 |

UIにボタンを並べるだけの設計は初期開発こそ容易ですが、長編作品を何十万字も執筆するクリエイターにとっては、数千回繰り返される操作の微小な摩擦がツールへのストレスに直結します。 キーボードのみで因果の分岐を跳躍し、検証結果を瞬時に手元へ引き戻せる操作体系は、WorldCraftが単なる「設定メモ帳」ではなく「本気で長編を構築するためのプロフェッショナルIDE」として認知されるための決定的な差別化要素になると考えられます。
