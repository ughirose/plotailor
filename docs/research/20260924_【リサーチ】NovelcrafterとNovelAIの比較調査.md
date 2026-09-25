# 20260924_【リサーチ】NovelcrafterとNovelAIの比較調査

## AI創作支援プラットフォームのアーキテクチャ分析とWorldCraft設計仕様に関する研究報告
### 1. Novelcrafterのシステム設計と執筆支援アーキテクチャ
長編小説の制作工程を体系的に支援する統合開発環境（IDE）として構築されたNovelcrafterは、膨大な世界観や登場人物の設定情報を破綻させずに大規模言語モデル（LLM）へ伝達する構造化データパイプラインを備えている1。一般的なテキストエディタと異なり、作中世界を構成する諸要素と執筆エディタ、そして推論エンジンが密接に結合しており、文脈の整合性を機械的に担保する設計思想が貫かれている1。
#### 1.1 Codex（設定資料データベース）の管理機構とプロンプト自動注入システム
Novelcrafterの中核を担う「Codex」は、作中の登場人物、拠点、アイテム、魔法体系や社会情勢などの世界観設定（Lore）、およびサブプロットを管理する構造化リレーショナルWikiである1。各エントリには固有の名称に加え、複数の別名（エイリアス）、カスタム属性フィールド、他エントリとの参照関係（Relations）が定義可能であり、単なるメモ帳ではなく有向グラフに近い関係性ネットワークを形成する2。
執筆画面（Manuscript）、プロット計画画面（Plan）、または対話型UI（Workshop Chat）にテキストが入力されると、システムはCodexエントリ名およびエイリアスをリアルタイムで構文解析し、該当する設定情報をプロンプトへ自動注入する7。このコンテキスト注入処理は、各エントリに割り振られた追跡設定によって厳密に制御される7。世界観の根幹をなす法則は常にコンテキストへ常駐させる「Always include」に指定され、一般的な設定要素は言及時のみ動的に読み込む「Include when detected」に設定される7。また、固有名詞の言及による意図せぬコンテキスト肥大化を防ぎつつ手動参照のみを許容する「Don't include when detected」や、生成モデルから完全に不可視化して執筆者の備忘録やネタバレ防止に充てる「Never include」といった状態区分が用意されている7。さらに、一般名詞との重複による誤検出を排除するため、大文字・小文字の完全一致判定や除外語句（Exclusions）フィルタリングも備わっている7。
長編小説の執筆において特に重大な課題となる「設定の時間的変遷」に対して、Novelcrafterは「Codex Progressions（進行度トラッキング）」という機構を導入して解決を図っている4。従来の静的な設定集では、物語の進行に伴って発生したキャラクターの受傷、記憶喪失、地位や人間関係の変化などを反映してエントリを更新すると、過去のシーンを修正・再生成する際に「未来の情報」が混入し、モデルが早漏的に後段の展開を描写してしまう問題があった6。Novelcrafterでは、原稿本文内でスラッシュコマンドを実行してプログレッションブロックを挿入し、エントリの特定属性に対する追加（Addition）または上書き置換（Replacement）をシーン単位で紐付けることができる8。コンテキストビルダーは当該シーン以降でのみ更新された属性値をプロンプトへ注入するため、作中の時間軸と同期した一貫性管理が可能となる9。
#### 1.2 プロット設計・シーン管理機能と執筆支援インターフェース
物語構造の設計において、Novelcrafterは階層的フォルダ構造と二次元マトリクス表示を組み合わせた管理体系を採用している2。作品全体は「幕（Act）」「章（Chapter）」「シーン（Scene）」の木構造で編成され、シーン単位で視点人物（POV）、プロット要約、登場キャラクター、進捗ラベルなどのメタデータが付与される2。これらを俯瞰する「Matrix View」は、縦軸に進行シーン、横軸にキャラクターやサブプロットを配置したスプレッドシート型UIであり、特定の伏線や登場人物がどの場面で進展・配置されているかを視覚的に把握できる2。
実際の執筆工程では、直接的な文章出力を指揮する「Scene Beat」機能が運用の中核を担う1。執筆者はエディタ上でスラッシュコマンドからビート入力枠を呼び出し、その場面で発生すべき出来事や心理描写の方向性を箇条書き等の短い指示文として記述する1。システムは直前の本文文脈、検出されたCodexエントリ、およびシーン指示を統合してプロンプトを構築し、外部モデルへ送信する13。出力されたプロスに対しては、本文への直接採用（Apply）、別パラメータでの再試行（Retry）、破棄（Discard）、あるいは複数案を並行保持して後から切り貼りするための下書き退避（Section）といったハンドリングが可能であり、執筆の最終主導権が常に人間に維持される14。
また、執筆エディタと同一画面内で呼び出し可能な「Workshop Chat」は、プロジェクト内のCodexやシーン文脈を動的に参照するブレインストーミング環境である1。チャット内で生成されたプロットアイデアやキャラクターの追加設定は、「Extract」機能によりワンクリックでCodexエントリ、新規章、あるいはScene Beatの形式に構造化変換され、原稿や設定集へ即座に転送される15。
#### 1.3 外部LLM連携（BYOK形式）と料金体系
Novelcrafterのプラットフォーム思想は、自社でLLMをホスティングせず、推論レイヤーを外部プロバイダーに完全委ねる「BYOK（Bring Your Own Key）」方式に基づいている1。OpenRouterをはじめ、OpenAI、Anthropic、Google Vertex AI、さらにはローカル環境で動作するOllama等のAPIエンドポイントを直接接続できる1。これにより、プロス生成には文芸表現力に富むClaude 3.7 Sonnetを割り当て、シーン要約やCodex抽出には低遅延・安価なGemini FlashやGPT-4o miniを割り当てるといった、用途別のモデルオーケストレーションが実現されている1。
料金体系においては、プラットフォーム利用料と推論インフラコストが完全に分離されており、ユーザーはツールの機能階層に応じた固定費と、プロバイダーへのAPI従量利用料を別々に負担する構造となっている1。

| プラン名 | 月額料金（年払換算） | 主要機能・AI利用権限 | 推論コストの負担方式 |
| --- | --- | --- | --- |
| Scribe | $4/月（$40/年） | 基本執筆エディタ、アウトライン、Codex（AI機能なし）1 | 発生せず1 |
| Hobbyist | $8/月（$80/年） | BYOK接続による外部AI連携、Scene Beat生成、プロンプト編集1 | 外部プロバイダーへの従量課金実費1 |
| Artisan | $14/月（$140/年） | Workshop Chat、詳細レビュー、登場頻度ヒートマップ解析1 | 外部プロバイダーへの従量課金実費1 |
| Specialist | $20/月（$200/年） | 複数人共同編集、複数作品間でのシリーズCodex共有1 | 各自またはホストのAPIキー実費3 |

この分離モデルにより、月間の執筆量が少ない時期の余計なサブスクリプション負担が排除されるとともに、OpenRouter等の集約ゲートウェイを経由することで、月間数十万字を執筆しても数ドル程度の推論実費で運用可能な高い費用対効果が確立されている18。
### 2. NovelAIの執筆支援基盤と技術仕様
Anlatan社が開発・運営するNovelAIは、オープンエンドな共同執筆（Co-writing）やテキストアドベンチャーの文脈から発展した創作環境である17。汎用チャットモデルを転用するアプローチとは一線を画し、小説・文芸作品に特化して独自訓練されたモデルと、プロンプトの各トークンの配置座標を厳密に制御するコンテキストコンパイラを基盤としている22。
#### 2.1 Lorebookのトリガー条件と決定論的メモリ管理仕様
NovelAIにおける世界観設定辞書「Lorebook」は、自然言語処理的な暗黙的検索ではなく、厳密な規則に基づいてプロンプト空間へ情報をマッピングする決定論的メモリ管理機構として動作する22。
エントリの発動（Activation）は、直近の本文テキストを走査する「Activation Keys」によって判定される22。単一または複数の単語登録に加え、複数キーワードが所定範囲内に同時に現れることを要求するAND結合構文（&）や、正規表現（Regex）による高度なパターンマッチングに対応している22。正規表現を用いることで、単語境界の厳格な判定や前方・後方参照を用いた精密な文脈抽出が可能となり、誤作動を排除したエントリ起動が実現される22。
発動したエントリ群は、単にプロンプトの先頭や末尾へ無差別に追記されるのではなく、トークン空間内の指定されたスロットへ整列配置される24。この配置プロセスは、以下のパラメータ群によって制御されている24。

| 設定項目 | 制御対象と動作仕様 |
| --- | --- |
| Insertion Position | コンテキスト全体のどの位置にエントリを挿入するかを数値で指定。0は最上部、-1は最下部（最新文脈直前）。キーが出現した位置の直前直後に差し込む「Key-Relative」も選択可能24。 |
| Insertion Order | トークン枠が上限に達した際、どの中身を優先してプロンプトへ残すかを決定する優先順位。数値が大きいエントリから順にトークン枠を確保する24。 |
| Token Budget & Reserved | エントリが消費できる最大トークン数（Budget）と、他エントリや本文に圧迫されても必ず確保される最低保証トークン数（Reserved）24。 |
| Trim Direction | 許容トークン数を超過した際、エントリの先頭（Top）から削るか末尾（Bottom）から削るか、あるいは欠損を許さず不採用とするか（Do Not Trim）の指定24。 |
| Cascading Activation | 発動したエントリの本文内に含まれるキーワードを走査し、別のLorebookエントリを連鎖的に呼び出す多段トリガー機構30。 |
| Ephemeral Context | ストーリーのステップ数（生成回数）に基づいて遅延（Delay）や有効期間（Duration）を付与し、一時的にプロンプトを差し込む時限式メモリ機能24。 |

NovelAIはこのメモリ制御の透明性を担保するため、「Current Context Viewer」と呼ばれるグラフィカルデバッガを実装している24。ユーザーは生成実行時に、どの設定エントリが、どのキーによって検知され、何トークンを消費してプロンプトのどの座標に配置されたかをカラーリングされたバーによって完全に視覚確認できる24。
#### 2.2 独自モデルの生成傾向、コンテキスト長、およびカスタマイズ性
NovelAIの大きな特徴は、商用大手LLMに課されている厳格な安全基準フィルタやアライメント処理を排し、文芸的・無制約な表現（NSFWを含む）に特化させた独自モデル群を自社クラスタで運用している点にある17。
モデルの進化系譜としては、軽量な「Clio」（3Bクラス）、中規模な「Kayra」（13Bクラス）を経て、Metaのオープン重みモデルLlama 3 70Bに大量の文芸作品データセットを追加学習させたフラッグシップモデル「Erato」を展開している25。Eratoは、商用チャットAIに散見される紋切り型の言い回しや説教調のトーンを回避し、語彙の多様性、修辞的なリズム感、比喩に富んだ情景描写を出力する傾向を持つ33。
プロンプト工学の観点では、作風やジャンルを誘導するために「ATTG構文」が慣例的に用いられる37。 [ Author: 作家名; Title: 作品名; Tags: タグ; Genre: ジャンル ] さらにEratoにおいては、文体クオリティのメタ指示として [ S: 1 ] から [ S: 5 ] までの5段階評価トークンをATTG末尾に付与することで、文章の密度や洗練度を制御する特殊機能が組み込まれている38。
一方で、モデルの構造的制約として「有効コンテキスト長の限界」が挙げられる35。GeminiやClaudeが数十万から数百万トークンのコンテキストを処理する現代において、NovelAIのコンテキスト長は最上位環境でも最大8,192トークンにとどまる25。また1回の出力長も約150トークン前後の短い単位に刻まれるため、過去の長大なエピソードをそのまま読み込ませることは不可能であり、前述のLorebookによる局所的かつ精密なトークン配分が不可欠となる34。
#### 2.3 料金プランおよびUI/UXの操作性
NovelAIは、画像生成とテキスト生成の両機能を包含した定額サブスクリプションモデルを採用している17。APIキーの取得や設定は不要であり、ブラウザ上でアカウントを作成すれば即座に独自の計算資源を利用できる17。

| プラン名 | 月額料金 | テキストモデルの利用権限 | 有効コンテキスト長 | 付帯機能 |
| --- | --- | --- | --- | --- |
| Paper | 無料 | トライアル利用のみ32 | 最小限 | 体験用アカウント |
| Tablet | $10/月 | Kayra等の標準モデル無制限17 | 3,072 トークン | 画像生成用通貨（Anlas）付与17 |
| Scroll | $15/月 | Kayra等の標準モデル無制限17 | 6,144 トークン | 中位メモリ枠プラン17 |
| Opus | $25/月 | 最上位モデル（Erato）利用可能32 | 8,192 トークン34 | 標準サイズ画像生成の無制限無料枠32 |

UI/UXは、左側にストーリーライブラリ、中央に執筆用エディタ、右側に「Memory」「Author's Note」「Lorebook」および生成サンプリングパラメータが並ぶ、集中型ライティング環境となっている24。
特異な機能として、Lorebookやシナリオ全体をPNG画像ファイルのメタデータ領域（PNGチャンク）に可逆的に埋め込んで書き出す「Lorebook Card」規格が存在する22。ユーザーは設定辞書を1枚のキャラクターイラスト画像としてWeb上で配布・インポートすることができ、コミュニティ間でのシナリオ共有を促進している22。さらに、クライアントサイドで生成フローやUI動作を拡張できるJavaScriptベースの「Scripting API」も提供されている31。
### 3. 世界観構築（Worldbuilding）と設定管理の比較分析
NovelcrafterとNovelAIは、AIを用いた長編創作支援という共通の目的を持ちながら、世界観の内部表現形式および推論コンテキストの構築ロジックにおいて、対照的な思想的立ち位置をとっている1。

| 比較軸 | Novelcrafter | NovelAI |
| --- | --- | --- |
| システムの基本概念 | 作家のための統合執筆IDE1 | 決定論的プロンプト制御型テキストエンジン23 |
| 設定データの管理構造 | リレーショナルWiki＋時間軸プログレッション1 | キー・バリュー型辞書＋正規表現ルールセット22 |
| コンテキスト取得方式 | 形態素・文字列検知＋階層型プロンプト構築3 | キーワード走査・連鎖発動（Cascading）22 |
| 時間経過・状態変化 | シーン単位での属性上書き・追加（Progressions）8 | Ephemeral Context（ステップ数制御）または手動書換24 |
| プロンプト内配置制御 | モジュール式プロンプトビルダー（論理的ブロック配置）2 | トークン座標単位の絶対・相対配置（Insertion Position/Order）24 |
| モデルアーキテクチャ | 外部商用・OSSモデルのBYOK連携1 | 自社ファインチューンモデルの専有運用25 |
| コンテキスト窓の前提 | 128k〜100万+ トークンを前提とした疎結合設計1 | 8,192 トークンの物理上限に特化した密結合設計34 |
| コンテンツ安全性 | 接続先APIプロバイダーのポリシーに準拠17 | 自社基準による完全非検閲（Unrestricted）17 |
| 共有・ポータビリティ | 標準Markdown/HTML/DOCX、シリーズ間共有2 | .lorebookファイル、PNGメタデータ埋め込みカード22 |

Novelcrafterの思想は、近代的な商用LLMの巨大なコンテキストウィンドウを活用することを前提としている1。世界観は原稿から独立した構造化データベースとして抽象化され、シーンの意図、直前のプロット要約、および関連エンティティをひとつの包括的な命令プロンプトとして宣言的に組み上げる2。設定の時間変化もデータベースのバージョン管理として抽象化されており、作家はソフトウェア工学的なアプローチで壮大な長編シリーズの一貫性を維持できる8。
これに対しNovelAIの思想は、狭小な8,192トークン空間内で言語モデルの確率分布を直接操作しようとするハッカー的アプローチである24。モデルが直前の数行に強いアテンションを払う特性を利用し、特定のLorebookエントリを最新テキストの直前（-1）にねじ込んだり、背景知識を最上部（0）に配置したりと、トークン単位の物理的位置関係を極限までチューニングする24。これは指示追従型の汎用エージェントではなく、あくまで次トークン予測を行う文芸モデルとの緊密な対話を意図した設計である24。
### 4. ユーザーコミュニティにおける評価と課題
両プラットフォームのユーザーベースからのフィードバックは、それぞれのアーキテクチャが内包するトレードオフを浮き彫りにしている3。
Novelcrafterに対する評価として最も際立っているのは、数十万字を超える長編作品における破綻のない継続執筆性能である3。登場人物の容姿や過去の伏線が正しく引き継がれる点、およびOpenRouter等の利用により極めて低廉なコストで膨大なプロスを出力できる経済性は、インディーズ作家層から絶大な支持を集めている3。しかしその一方で、最大の参入障壁として「環境構築の過重さ（Setup Burnout）」が指摘されている1。ツールの性能を十全に発揮するためには、執筆に着手する前に大量のCodexエントリや属性値、プロンプトプリセットを手動で整備する必要があり、この初期設定作業の煩雑さに耐えかねて離脱するユーザーが少なくない3。また、APIキーの発行やクレジット管理に対する非技術層の心理的抵抗感や、接続する商用モデルの出力が「AI特有の無難で機械的な文体」に偏りがちである点も継続的な不満として語られている3。
NovelAIに対する評価では、独自訓練されたモデルが醸し出す文芸的なトーンの豊かさと、検閲が存在しないことによる圧倒的な表現の自由度が高く評価されている17。また、PNG画像1枚で設定辞書を交換できるカード文化は、二次創作やTRPG的なシナリオ作成コミュニティにおいて独自の定着を見せている22。しかしながら、コンテキスト長が8,192トークンに制限されている点は、現代の長編創作ツールとして決定的なボトルネックと見なされている35。特に、エントリの連鎖発動（Cascading Activation）を設定した際に、意図せぬ多重呼び出しによってコンテキスト枠が設定情報だけで埋め尽くされ、本文履歴が追い出されてしまう「Context Crushing」現象は、多くのユーザーを悩ませる技術的課題となっている40。さらに、指示追従を主目的としたモデルではないため、物語の展開を能動的に転換させる推進力に乏しく、執筆者が細かく介入しないと同じ描写や安全な展開を堂々巡りしてしまう現象（いわゆるモデルの怠惰性）も不満点として挙げられている33。
### 5. WorldCraftにおける機能要件定義と差別化アーキテクチャ
Novelcrafterの「高度な構造化データベースと外部モデルの柔軟性」およびNovelAIの「決定論的トークン制御と創作コミュニティに根ざした共有文化」の長所を統合し、両者の課題を克服するための「WorldCraft」の具体的設計仕様を策定する1。
#### 5.1 時系列連動型ナレッジグラフ（Temporal Knowledge Graph）
NovelcrafterのCodex Progressionsをさらに進化させ、世界観の全エンティティを時間軸属性を持つ有向グラフとしてモデル化する2。
従来の手動シーン紐付け方式から脱却し、エディタ上のカーソル位置（またはタイムライン上のチャプター番号）から「現在の作中年代・進行エピソード」を自動判定し、その時点で有効なエントリの属性状態をグラフから動的に射影するアーキテクチャを採用する9。また、ある組織が壊滅した際に所属メンバーの所属ステータスが自動的に「難民」「元所属」へと遷移候補化されるような「因果関係の波及追跡」を実装し、設定更新の手動コストを劇的に低減させる。
#### 5.2 ハイブリッド型コンテキスト検索エンジン（Deterministic Regex × Vector RAG）
NovelAIの持つ「厳密な正規表現・キーワードトリガー」の確実性と、近年の「セマンティック・ベクトル検索」の網羅性を統合した二層構造の検索エンジンを構築する3。
固有名詞、呪文名、特定アイテムなどの客観的事実はRegexおよびキーワード一致によって100%の決定論的精度で検出し、プロンプトへ強制挿入する7。これと並行して、明示的な単語としては出現していないものの、シーンの空気感（例: 政治的緊張、過去のトラウマの追体験）に関連する世界観背景や過去のエピソードを密ベクトル検索により取得する。この際、NovelAIで問題となったコンテキスト圧迫を防止するため、注入される設定情報の最大トークン比率に動的上限（キャップ）を設け、関連度スコアによる適応的枝刈りを自動実行する24。
#### 5.3 階層型トークンバジェットと動的コンテキスト要約
大規模なコンテキストウィンドウの恩恵を享受しつつ、注意機構の散漫化（Lost in the Middle現象）と推論コストの肥大化を抑止するため、コンテキストを3つの明確な論理レイヤーに分割して管理する6。
最上位の「コア不変層」には作品の根本法則や文体指示、ATTG的メタプロンプトを常駐させる7。中位の「アクティブ設定層」には、現在のシーンで検知・検索されたナレッジグラフのノード情報および時間軸進行度を流動的に配置する7。最下位の「ワーキングメモリ層」には、直前シーン群の自動要約（80〜100語程度）と執筆中の直近本文をスライディングウィンドウ方式で確保し、常に黄金比率のプロンプト構成を維持する13。
#### 5.4 視覚的世界観構築キャンバス（Visual Worldbuilding Canvas）
テキストと表形式に偏重していた設定管理画面を拡張し、空間的・視覚的直感に訴求するグラフィカルUIを提供する2。
架空の地図画像をアップロードして拠点やランドマークをピン留めできる「インタラクティブ・マップ」を搭載し、地理空間データとナレッジグラフを直結させる。執筆中のシーンの舞台として特定の地域を指定すると、隣接地域や所属国家の風土設定が自動的にコンテキスト候補として提示される。また、人物間の感情・主従・敵対関係を視覚的に結線・編集できる「動的ノード相関図」を備え、画面上で変更された関係性は自動的にテキストメタデータへ変換されてプロンプトに反映される2。
#### 5.5 リバース・ワールドビルディングによるオンボーディング摩擦の撤廃
Novelcrafterにおける最大の離脱要因である初期構築負担（Setup Burnout）を解消するため、既存テキストからの逆方向設定抽出パイプラインを実装する1。
ユーザーが既存の原稿（DOCX, Markdown, EPUB等）をアップロードすると、解析エージェントが本文全体を走査し、登場人物の容姿や性格、地名、組織、過去の出来事のタイムラインを自動的に抽出・構造化して初期ナレッジグラフを自律生成する2。また、新規に世界観を練る作家に対しては、NovelAIのLore Generatorを拡張した対話型インタビュアーAIを提供し、「この魔法体系が存在する場合、一般庶民の産業はどう変化しましたか？」といった設定の盲点を突く質問を投げかけさせることで、対話を通じて自然に世界観データベースが構築される仕組みを整える13。
#### 5.6 デュアル・インフラストラクチャとオープン共有エコシステム
手軽な利用を望むライト層と、極限のカスタマイズと低コストを求めるヘビー層の双方を包摂するため、インフラ利用形態に柔軟性を持たせる3。
外部APIキーの設定を必要とせず定額またはトークンパック形式で即座に執筆可能な「Turnkeyモード」と、OpenRouter等の自前APIキーを利用して最先端モデルを直接操作する「BYOKモード」を同一プラットフォーム上で自由に切り替え可能とする1。さらに、NovelAIの画像埋め込みカード文化を発展させ、世界観のナレッジグラフ、相関図、マップ、およびプロンプトプリセットを一括パッケージ化した「WorldCraft Card（PNG/JSON）」規格を定義し、ユーザー間での世界観共有や配布を行えるコミュニティエコシステムを構築する22。

| モジュール名 | 技術要件・アーキテクチャ仕様 | 解決される既存ツールの課題 |
| --- | --- | --- |
| Temporal Knowledge Graph | 時系列付き有向グラフデータベース、因果伝播による属性自動フラグ付け4 | 静的Wikiによるネタバレ混入、手動更新の煩雑さ3 |
| Hybrid Context Engine | 正規表現による100%一致判定と埋め込みベクトル検索の統合、トークン上限キャップ3 | 決定論的一致の漏れ、連鎖発動によるコンテキスト圧迫40 |
| Tiered Context Allocator | コア層・アクティブ層・ワーキング層の3段階プロンプト自動配置と要約管理13 | 注意機構の散漫化、8kトークン制限による忘却6 |
| Visual Canvas Suite | 地理マップピン留め、ノード式人間関係相関図エディタ、自動メタデータ変換2 | テキスト中心の設定管理による空間的・関係的把握の難しさ3 |
| Reverse Ingestion Agent | 既存原稿からのエンティティ・タイムライン自動抽出、対話型設定補完AI2 | 執筆前の初期設定構築における過度の心理的負担1 |
| Hybrid Runtime & Cards | Turnkey（事前設定済推論）とBYOKの併設、PNGメタデータ形式の世界観配布規格1 | 非技術層のAPIキー設定障壁、設定資産の可搬性不足3 |

### 6. 総括と開発ロードマップへの提言
NovelcrafterとNovelAIの調査から得られた最大の知見は、「構造化データによる長期的整合性の維持」と「文芸的トーンの精密制御および共有文化」という、現在市場において分断されている2大要素をいかに高次元で統合できるかが成否を分けるという点である1。
WorldCraftの開発においては、まず第1フェーズとして、時系列対応のナレッジグラフ基盤とScene Beatによる執筆エディタ、およびBYOKを中心とする堅牢な長編執筆環境を確立することが急務となる2。続いて第2フェーズにおいて、正規表現とベクトル検索を融合させたハイブリッド検索エンジンと、既存原稿から設定を自動生成するリバース・インジェクションを実装し、ユーザーの参入障壁を徹底的に引き下げる3。最終的な第3フェーズでは、視覚的マップや相関図の統合、Turnkey推論インフラの開放、および世界観カードの配布・流通エコシステムを展開することで、個人制作ツールの枠を超えた創作プラットフォームとしての市場地位を確立することが推奨される4。
##### 引用文献
- Novelcrafter for Indie Authors | Long-Form Writing and ... - ScribeCount, https://scribecount.com/author-resource/artificial-intelligence/novelcrafter-for-indie-authors
- Discover all the features - Novelcrafter, https://www.novelcrafter.com/features
- I tested the 5 best AI novel writing software platforms in 2026 - eesel AI, https://www.eesel.ai/blog/ai-novel-writing-software
- Codex - A Story Bible That Writes With You - Novelcrafter, https://www.novelcrafter.com/features/codex
- Codex Types - Codex - Novelcrafter Help, https://www.novelcrafter.com/help/docs/codex/codex-types
- Description Guidelines - Codex - Novelcrafter Help, https://www.novelcrafter.com/help/docs/codex/guidelines-for-descriptions
- Codex Tracking - Codex - Novelcrafter Help, https://www.novelcrafter.com/help/docs/codex/codex-tracking
- Progressions on Codex Details - Novelcrafter, https://www.novelcrafter.com/help/docs/codex/progressions-codex-details
- Progressions/Additions - Codex - Novelcrafter Help, https://www.novelcrafter.com/help/docs/codex/progressions-additions
- Tracking character arcs - Codex Recipes - Novelcrafter, https://www.novelcrafter.com/courses/codex-cookbook/tracking-character-arcs
- How do I track changes to a character? - Codex - Novelcrafter Help, https://www.novelcrafter.com/help/faq/codex/track-character-changes
- Documentation - Novelcrafter Help, https://www.novelcrafter.com/help/docs
- Types of Prompts - Prompts - Novelcrafter Help, https://www.novelcrafter.com/help/docs/prompts/prompt-types
- Generating Prose - Write - Novelcrafter Help, https://www.novelcrafter.com/help/docs/write/generating-prose
- Extract - Organization - Novelcrafter Help, https://www.novelcrafter.com/help/docs/organization/the-extract-feature
- Transferring Information from Chat - Chat - Novelcrafter Help, https://www.novelcrafter.com/help/docs/chat/transfering-information
- The Best 5+ Sudowrite Alternatives for Creative Writers in 2025, https://neilchasefilm.com/sudowrite-alternatives/
- OpenRouterの料金体系 2026年版：プラン、費用、隠れた手数料, https://www.truefoundry.com/ja/blog/openrouter-pricing
- Efficiently write books using AI and Novelcrafter in 2024, https://www.geeky-gadgets.com/write-books-using-ai-in-2024/
- If I'm on the Specialist plan, does the person I invite have to also, https://www.novelcrafter.com/help/faq/collaboration/what-plan-should-collaborators-have
- NovelAI、Novelcrafter、それとも…？ : r/WritingWithAI - Reddit, https://www.reddit.com/r/WritingWithAI/comments/1d4zpmu/novelai_novelcrafter_or/?tl=ja
- Lorebook - | NovelAI Documentation, https://docs.novelai.net/en/text/lorebook/
- Lorebook - | NovelAI Documentation, https://docs.novelai.net/ja/text/lorebook/
- Advanced Settings - | NovelAI Documentation, https://docs.novelai.net/ja/text/editor-jp/advancedsettings/
- Models - | NovelAI Documentation, https://docs.novelai.net/en/text/models/
- Lorebooks - AI Dynamic Storytelling Wiki, https://aids.miraheze.org/wiki/Lorebooks
- Using Lorebook to plot out story beats / introduce characters ... - Reddit, https://www.reddit.com/r/NovelAi/comments/1bidzad/using_lorebook_to_plot_out_story_beats_introduce/
- Advanced Settings - | NovelAI Documentation, https://docs.novelai.net/en/text/editor/advancedsettings/
- ELI5. What do the various Advanced Context Settings actually do? I, https://www.reddit.com/r/NovelAi/comments/16dl4sp/eli5_what_do_the_various_advanced_context/
- Question about Cascading Activation : r/NovelAi - Reddit, https://www.reddit.com/r/NovelAi/comments/1bnbvea/question_about_cascading_activation/
- Understanding Lorebook Keys: Using Regular Expressions ... - Reddit, https://www.reddit.com/r/NovelAi/comments/177sxqn/understanding_lorebook_keys_using_regular/
- Our Comprehensive Squibler Review (And 5 Amazing Alternatives), https://dreamgen.com/blog/articles/squibler-review-and-alternatives
- Now that Llama 3 Erato has been out for a while, how does it hold up?, https://www.reddit.com/r/NovelAi/comments/1i6vtb5/now_that_llama_3_erato_has_been_out_for_a_while/
- NovelAI | docs.ST.app - SillyTavern Documentation, https://docs.sillytavern.app/usage/api-connections/novelai/
- [Release] NovelAI text generation enters a new era. Erato 70B is our, https://www.reddit.com/r/NovelAi/comments/1fnuk0w/release_novelai_text_generation_enters_a_new_era/
- I love the rhythm and playful use of language in Erato's descriptions, https://www.reddit.com/r/NovelAi/comments/1fzxsm4/i_love_the_rhythm_and_playful_use_of_language_in/
- Pre Fine-Tune GLM vs Erato? : r/NovelAi - Reddit, https://www.reddit.com/r/NovelAi/comments/1nsho8y/pre_finetune_glm_vs_erato/
- The instruct capability of Erato : r/NovelAi - Reddit, https://www.reddit.com/r/NovelAi/comments/1g5tzmm/the_instruct_capability_of_erato/
- Erato is underwhelming : r/NovelAi - Reddit, https://www.reddit.com/r/NovelAi/comments/1fognk3/erato_is_underwhelming/
- How many Lorebook entries can you have and how long can they, https://www.reddit.com/r/NovelAi/comments/1qvydwa/how_many_lorebook_entries_can_you_have_and_how/
- Lorebook API - | NovelAI Documentation, https://docs.novelai.net/en/scripting/lorebook-api/
- Erato is the LAZIEST NAI model I've ever seen : r/NovelAi - Reddit, https://www.reddit.com/r/NovelAi/comments/1fposps/erato_is_the_laziest_nai_model_ive_ever_seen/
- Cascading activation or insertion order – which to use for a good, https://www.reddit.com/r/NovelAi/comments/ot969t/cascading_activation_or_insertion_order_which_to/