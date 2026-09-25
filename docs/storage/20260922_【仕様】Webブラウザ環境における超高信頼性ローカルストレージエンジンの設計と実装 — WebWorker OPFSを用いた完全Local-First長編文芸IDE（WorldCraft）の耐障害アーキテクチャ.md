# 20260922_【仕様】Webブラウザ環境における超高信頼性ローカルストレージエンジンの設計と実装 — WebWorker/OPFSを用いた完全Local-First長編文芸IDE（WorldCraft）の耐障害アーキテクチャ

## Webブラウザ環境における超高信頼性ローカルストレージエンジンの設計と実装 — WebWorker/OPFSを用いた完全Local-First長編文芸IDE（WorldCraft）の耐障害アーキテクチャ
### 1. OPFSおよびFileSystemSyncAccessHandleの物理同期性能と動作特性
Webブラウザ上で稼働するアプリケーションにおいて、従来のLocalStorageやIndexedDBは、容量制限や不透明な同期タイミング、Web Workerからのアクセス制約という構造的課題を抱えていた。これに対し、Origin Private File System（OPFS）および Dedicated Worker 環境でのみ利用可能な FileSystemSyncAccessHandle は、ウェブ標準ストレージ環境に真の同期型バイトレベルファイルI/Oアクセスをもたらした [cite: 1, 2]。
#### 同期読み書きスループットと性能比較
FileSystemSyncAccessHandle は、非同期の Promise 通信に伴うイベントループのコンテキストスイッチを完全に排除し、C言語の標準I/O関数（read, write）に直接対応する同期APIを提供する [cite: 1, 2]。これにより、JavaScriptエンジンとオペレーティングシステムのファイルシステム間におけるシステムコールレイテンシが大幅に削減される [cite: 2, 3]。
IndexedDB は構造化クローンアルゴリズム（Structured Clone Algorithm）を介してデータを直列化・復元するため、数メガバイトのテキストやバイナリデータの読み書き時にメインスレッドのガベージコレクション（GC）圧迫とCPUスパイクを発生させる [cite: 2, 4]。一方、OPFSの FileSystemSyncAccessHandle は型付き配列（Uint8Array や ArrayBuffer）を介して直接メモリバッファへバイナリ領域を転送するため、構造化クローン処理を完全に回避できる [cite: 2]。
| ストレージ技術 | 実行コンテキスト | I/Oアクセスモデル | 構造化クローン | 読み書きスループット比（IndexedDB基準） |
| --- | --- | --- | --- | --- |
| LocalStorage | メインスレッド | 完全同期（文字列限定） | 不可 | 0.1x（容量5MB制限により破綻） |
| IndexedDB | 全コンテキスト | 非同期（Event / Promise） | 必須（オブジェクト直列化） | 1.0x（基準値） |
| OPFS (SyncAccessHandle) | Dedicated Worker限定 | 完全同期（バイナリ直接操作） | 不要（Zero-Copy通信可能） | 2.5x ～ 4.0x [cite: 2] |

#### flush() による物理ディスク同期保証レベル
FileSystemSyncAccessHandle.prototype.flush() は、POSIXにおける fsync() やWindowsにおける FlushFileBuffers() システムコールへ直結している [cite: 2, 5, 6]。ブラウザの通常の書き込み操作（write()）を実行した時点では、データはオペレーティングシステムのページキャッシュ（カーネルバッファ）領域に留まっている。この段階でモバイルOSの低メモリキラー（LMK）やブラウザプロセスの強制作殺（Sigkill）が発生した場合、データは物理ストレージに届かず「0バイト化」や「部分的中途半端な欠損」を引き起こす。
flush() を明示的に呼び出すことで、カーネルバッファ上のDirtyページをストレージコントローラへ同期的にフラッシュさせ、呼び出し完了時点で物理不揮発性ストレージ（NAND Flash）への永続化が絶対的に保証される [cite: 2, 5]。ただし、頻繁な flush() の実行はNANDデバイスの書き込み命令を極端に増大させI/Oブロッキングを招くため、トランスポートログの区切りやコミット完了時へ限定して呼び出す制御が必要となる。
#### メインスレッドとのゼロコピー（Zero-Copy）連携
Dedicated Worker上で動作するOPFSストレージエンジンとUIを司るメインスレッド間の通信において、データ転送のオーバーヘッドを最小化するアプローチとして以下の2手法が確立されている。
一つ目は Transferable Objects（ArrayBuffer の所有権移動）の活用である。Worker内で読み込んだ ArrayBuffer の所有権を postMessage(buffer, [buffer]) によってメインスレッドへ移渡することで、データサイズに依存せず0ミリ秒でメモリ転送が完了する。二つ目は SharedArrayBuffer と Atomics APIを用いたメモリ共有モデルである [cite: 7]。COOP/COEP（Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy）ヘッダーを有効化した環境下では、SharedArrayBuffer を介して両スレッドが同一の物理メモリ領域を参照し、Atomics.wait() および Atomics.notify() による同期制御を通じて、スレッド間シリアライズコストを一切発生させずにデータ参照を行うことが可能となる [cite: 1, 7]。
--------------------------------------------------------------------------------
### 2. モバイルブラウザにおけるサスペンド耐性とアトミック書き込み
#### モバイル環境のライフサイクルと突然死のリスク
iOS Safari（WebKit）やAndroid Chrome（Blink）などのモバイル環境では、ユーザーがアプリをバックグラウンドへ退避させた際、あるいは他アプリのメモリ圧迫が発生した際に、ブラウザプロセスが事前通知なしに即時凍結（サスペンド）または強制作殺（Sigkill）される。モバイルWebKitにおいては、JavaScriptの beforeunload や pagehide イベントが確実に完結する保証は存在しない。ファイルへの書き込み途中でプロセスが途絶すると、ファイルシステムの内部ポインタが破壊され、ファイルサイズが0バイト化する現象や、JSONマニフェストの構文崩壊が発生する。
#### Write-Audit-Commit（3段階アトミック書き込み）の原理
データ破損を構造的に防ぐ手法が「Write-Audit-Commit（作成・検証・置換）」パターンである [cite: 8]。本番ファイルを直接上書き改変する（In-place Write）のではなく、二重バッファリング（Double Buffering）をストレージレベルで実現する [cite: 8, 9]。
書き込み処理は、まず新規のテンポラリファイル（.tmp）へ全量または差分データをアペンドし、flush() を呼び出して物理ディスクへ物理同期させる手順から始まる [cite: 2, 8]。続いて、書き込まれたテンポラリファイルを即座に読み戻し、ハッシュ値（CRC32またはSHA-256）やデータ構造の完全性を検証（Audit）する [cite: 8]。検証に成功した場合にのみ、既存の本番ファイルに対してアトミックな置換操作（move / rename）を適用する [cite: 7, 8]。
#### SQLite WasmのVFS（Virtual File System）実装事例
SQLiteのWebAssembly移植版（SQLite Wasm）では、OPFS上のデータベースファイルを保護するために独自のVFSレイヤー（OPFSCoopSyncVFS や AbsurderSQL 等）が導入されている [cite: 1, 10]。
SQLiteはWAL（Write-Ahead Logging）モードを活用し、本番のデータベースファイル（.db）へ直接書き込まず、変更差分をすべてWALファイル（.db-wal）へ同期書き込み（flush）する [cite: 2, 10]。WALの末尾にはチェックサムヘッダーが刻印され、不完全なフレームは起動時のクラッシュリカバリ処理によって自動的に破棄される仕組みが備わっている。Web標準の FileSystemHandle.move() APIは、同一OPFS内におけるファイル置換をOSレベルのアトミック操作として保証しており、主要ブラウザ（Chrome 110+, Firefox 125+, Safari 17.2+）でのサポート完了に伴い、サードパーティ製ライブラリを介さずアトミックファイル置換を実現できる [cite: 7, 11]。
--------------------------------------------------------------------------------
### 3. ストレージ永続化仕様とハイブリッドストレージ構造
#### navigator.storage.persist() の挙動と限界
Webブラウザのストレージバケットには「Best-effort（最善努力）」と「Persistent（永続）」の2つの保持モードが定義されている [cite: 12]。既定のBest-effortモードでは、端末の空き容量が逼迫した場合、ブラウザはユーザーへの通知なしにオリジン配下の全ストレージを自動消去（Eviction）する権利を有する [cite: 12, 13]。
navigator.storage.persist() を呼び出すことで永続モードへの昇格を申請できるが、その承認ロジックはブラウザベンダーごとに大きく異なる [cite: 12, 13]。
- Chromium（Chrome / Edge）: ユーザーのサイトエンゲージメント指標（訪問頻度、ブックマーク登録、PWA化）に基づきプロンプトなしで自動承認される [cite: 12]。
- Gecko（Firefox）: ユーザーに対して明示的な権限許可ダイアログを提出する。
- WebKit（iOS / macOS Safari）: ユーザーの過去の操作履歴から自動判定されるが [cite: 12]、後述するITPのパージ規定が上位制約として上書きされる [cite: 14, 15]。
#### Safari ITP（Intelligent Tracking Prevention）による自動パージ
iOSおよびiPadOS環境における最上位のデータ消失リスクは、WebKitのITPに組み込まれた自動パージ機構である [cite: 12, 14, 15]。WebKitは、7日間ユーザーによる直接的なインタラクション（タップやキー入力）が発生しなかったサイトについて、JavaScript経由で書き込まれたすべてのストレージ領域（LocalStorage、IndexedDB、OPFS）を自動消去する [cite: 14, 15, 16]。
navigator.storage.persist() によって永続化が承認されている場合であっても、ブラウザの仕様によっては長期不アクセスによる自動パージを完全に阻止できないケースが存在する [cite: 13]。この自動消去規律に対する唯一の標準的例外は、該当Webアプリケーションが「ホーム画面に追加（PWA化）」されて起動された場合であり、このときオリジンは独立バケットへ隔離され、パージ対象から除外されるとともにストレージ上限が端末容量の最大60%まで開放される [cite: 12]。
#### IndexedDB + OPFS ハイブリッド永続化アーキテクチャ
高い堅牢性と検索性能を両立させるため、IndexedDBとOPFSのそれぞれの長所を組み合わせた「ハイブリッドストレージ構造」が極めて有効である [cite: 10]。
本アーキテクチャでは、UIレイヤーからの読み書き要求に対し、軽量なメタデータおよびインデックス検索をIndexedDBが担当し、大容量の実体データを Dedicated Worker 配下の OPFS（FileSystemSyncAccessHandle）が担当する [cite: 1, 10]。IndexedDBは多角的なB-Treeインデックス検索に長け、メインスレッドからの制御が容易である一方 [cite: 1, 4, 17]、OPFSは巨大なテキストブロックやバイナリアセットに対する同期型バイトアクセスに特化している [cite: 1, 2, 3]。
文芸作品の構造データ（章一覧、文字数、タグ、更新日時、世界観ノードの参照関係）をIndexedDBで管理し、数十万字に及ぶ本文テキストのブロックや画像アセットをOPFS上のファイル群として配置することで、検索・一覧表示の応答性を維持しながら、本文書き込み時のシリアライズオーバーヘッドを極限まで削減できる [cite: 2, 10]。
--------------------------------------------------------------------------------
### 4. モバイル突然死を完封する3段階コミット（safeAtomicWrite）設計
WorldCraftにおいて、キーストロークや自動保存の瞬間にプロセスが突然死した場合でもデータ破損を回避する3段階コミット処理の実装仕様を定義する。
#### safeAtomicWrite ステートマシン
コミット処理は不可逆な状態遷移モデルとして設計され、各ステートはトランザクションジャーナルに書き込まれることで、クラッシュ後の再起動時に未完了のトランザクションを正常にロールバックまたは再適用できる構造をとる [cite: 8]。
- IDLE（待機状態）: 書き込みバッファにデータが蓄積され、スロットリング制御を経てコミット要求が発効された初期状態。
- STAGING_WRITE（シャドウ書き込み）: 対象ファイル（doc_A.dat）に対し、独立した一時ファイル（doc_A.dat.tmp）を新規作成し、FileSystemSyncAccessHandle.write() 実行後に flush() を呼んで物理ディスクへ完全同期させる [cite: 2, 8]。
- CHECKSUM_AUDIT（完全性検証）: 書き込んだ一時ファイルを読み戻し、メモリ上の元データとハッシュ値（CRC32/SHA-256）を照合する [cite: 8]。構造妥当性を満たさない場合は一時ファイルを破棄しトランザクションを中断する。
- COMMIT_SWAP（アトミック置換）: FileSystemHandle.move() を用いて一時ファイルを本番ファイル名へアトミック置換する [cite: 7, 8]。
- CLEANUP / COMMITTED（完了処理）: 置換完了後、ジャーナルログを抹消してステートを COMMITTED へ遷移させ、待機状態へ復帰する [cite: 8]。
#### safeAtomicWrite のTypeScript型定義
Dedicated Worker内で動作する型安全な safeAtomicWrite システムのインターフェース定義を以下に示す。
export type CommitState =
  | 'IDLE'
  | 'STAGING_WRITE'
  | 'CHECKSUM_AUDIT'
  | 'COMMIT_SWAP'
  | 'CLEANUP'
  | 'COMMITTED'
  | 'FAILED_ROLLED_BACK';

export interface FilePayload {
  path: string;
  data: Uint8Array;
  expectedChecksum: number;
}

export interface TransactionJournal {
  transactionId: string;
  targetPath: string;
  tmpPath: string;
  state: CommitState;
  timestamp: number;
}

export interface AtomicWriteOptions {
  syncImmediate: boolean;
  timeoutMs: number;
}

export type AtomicWriteResult =
  | { success: true; bytesWritten: number; state: 'COMMITTED' }
  | { success: false; error: Error; state: 'FAILED_ROLLED_BACK' };

export interface AtomicStorageEngine {
  safeAtomicWrite(
    payload: FilePayload,
    options?: Partial<AtomicWriteOptions> ): Promise<AtomicWriteResult>; recoverPendingTransactions(): Promise<void>; } クラッシュリカバリ手順のアルゴリズムアプリケーション起動時、AtomicStorageEngine はまずOPFS内の journal/ ディレクトリを自動走査する。ジャーナルのステートが STAGING_WRITE または CHECKSUM_AUDIT の段階で切断されていた場合、本番ファイル（targetPath）は過去の正常な状態に保たれているため、不完全な .tmp ファイルとジャーナルを抹消することで安全にリカバリが完結する [cite: 8]。一方、ジャーナルのステートが COMMIT_SWAP に達していた場合は、.tmp ファイルのチェックサムを再検証し、正常であれば置換処理（move）を再実行してコミットを完了させる [cite: 7, 8]。この一連のリカバリ手順により、どのタイミングで強制作殺が発生してもデータ破綻を回避できる。
--------------------------------------------------------------------------------
### 5. データ構造および記憶領域の分割・配置戦略
WorldCraftが保持する数十万字の文芸本文、差分履歴、および数万ノードの世界観グラフマニフェスト（JSON）を効率的に保持するためのストレージ構造を比較検討する [cite: 1, 10]。
#### 記憶構造のアプローチ比較
全データを1つの .db ファイルに格納する「単一巨大ファイル構成（Monolithic）」、データを4KB〜64KBの固定長ブロックに細分化して保存する「固定長ブロック分割構成（Block Storage）」、およびデータを文脈ごとの独立ファイルへ分散配置する「セグメント分割ファイル構成（Segmented Hybrid）」の3モデルが存在する [cite: 10]。
| 評価項目 | 1. 単一巨大ファイル (Monolithic) | 2. 固定長ブロック分割 (Block Storage) | 3. セグメント分割 (Segmented Hybrid) |
| --- | --- | --- | --- |
| キーストローク書き込み応答性 | 低（WAL書き込みと大規模ロックが発生） [cite: 1] | 高（該当4KBブロックのみ書き換え） [cite: 10] | 最高（該当章テキストのみアペンド更新） |
| 検索・インデックス処理速度 | 最高（SQLクエリ、B-Tree検索利用可能） [cite: 4] | 中（ブロックキャッシュ層に依存） [cite: 10] | 低（Worker側での並列ファイル走査が必要） |
| 突然死時の被害局所化 | 低（DB全体のヘッダー破壊リスクあり） | 中（破損ブロックのみに影響が局限） | 最高（編集中の章以外は100%隔離保護） |
| メモリ消費量（モバイル） | 高（Wasmヒープへの巨大メモリ割り当て） [cite: 4] | 中（LRUキャッシュのメモリ消費） [cite: 10] | 低（編集中の数万字のみメモリ保持） |
| 差分履歴（Diff/CRDT）の保持 | 低（Blob更新に伴うDBファイル膨張） | 中 | 最高（Append-Only Log構造と最適適合） |

#### WorldCraftにおける推奨配置アーキテクチャ
WorldCraftにおいては、リスクの局所化とキー入力応答性を最優先とし、「セグメント分割ハイブリッド構造」 の採用を強く推奨する。
ディレクトリ構成は、ルート直下に検索用インデックスを保持する manifest/（IndexedDBまたは軽量SQLite）、章ごとの本文および差分ログを格納する manuscripts/、シャード分けされた世界観ノード群を保持する nodes/、そして復旧用ジャーナルを納める journal/ から構成される。
本文データ（manuscripts/）は、1章（1万〜2万字程度）ごとに物理ファイルを分割して管理する。キーストローク時には、該当章の差分ログ（chap_XXX.log）に対してアペンド（追記）処理のみを即座に実行する。アペンド処理はI/Oコストが最小であり、モバイル環境でもミリ秒以下の応答性が達成される。一定の書き込み回数に達した段階で、バックグラウンドWorkerがログをマージし、本体ファイル（chap_XXX.txt）に対して safeAtomicWrite を適用する [cite: 8]。
世界観グラフマニフェスト（nodes/）については、数万ノードのメタデータを単一JSONとして扱うと直列化コストが過大となるため、IDのハッシュ値に基づき1,000ノード単位のチャンク（node_chunk_XXX.json）へシャード分割して保存する。これにより、ノードの追加・修正時におけるI/O書き込み範囲を最小限に限定することが可能となる。
--------------------------------------------------------------------------------
### 6. 自動パージ（ITP/OS圧迫）に対するデータ防護策とUX設計
完全Local-Firstの思想（インフラ原価$0）を堅持するため、サーバーバックアップに頼らない完全ローカル完結型の防護UXを設計する。
#### 技術的検知と事前警告
アプリケーションのライフサイクルにおいて、以下のシグナルを常時監視するエージェントをメインスレッド上で稼働させる。
- クォータ監視: navigator.storage.estimate() を定期実行し、ストレージ使用率が80%を超えた段階でOSによる予防的消去リスクを警告する [cite: 12, 13]。
- 永続化状態検証: navigator.storage.persisted() を判定し [cite: 12, 13]、非承認（false）状態である場合はPWA化を促す案内を提示する。
- ITPアクティビティ追跡: Safari環境において前回のアプリ起動タイムスタンプを検証し、5日間アクセスがない場合はWeb Push等を通じてユーザーへ復帰を促す。
#### 多層防護（Defense in Depth）UX指針
ユーザーのデータを保護するため、オンボーディングから非常時対応までをシームレスに結ぶ多層UXアプローチを構築する。
オンボーディング段階（Phase 1）では、PWA（ホーム画面への追加）のインストールを最優先で誘導する。iOS SafariにおいてPWA化されたアプリはWebKitの7日自動パージ対象から完全に除外され、容量上限も大幅に解放される [cite: 12, 14, 15]。
平常運用段階（Phase 2）では、File System Access API（showDirectoryPicker()）を活用した「透過的ローカル同期」を提供する。ユーザーが指定した端末上の任意のローカルフォルダに対し、OPFSでの書き込み完了と同期してバックグラウンドで同名ファイルを書き出す [cite: 8]。これにより、ブラウザのストレージ領域が全消去された場合でも、可視領域のファイルシステム上にデータが防護される。
非常時段階（Phase 3）では、ストレージ圧迫や環境危険度に応じて自動エクスポートを発効させる。
| トリガー条件 | 検出方法 | 自動UXアクション | ユーザーへの通知内容 |
| --- | --- | --- | --- |
| ストレージ使用率 > 85% | navigator.storage.estimate() [cite: 12] | 全プロジェクトを1つのアーカイブ（.worldcraft ZIP）として生成し自動ダウンロード | 「ブラウザのストレージ容量が上限に近づいたため、最新バックアップをローカルへ自動保存しました。」 |
| Safari環境で5日間未操作 | 内部タイムスタンプ検証 | 外部エクスポートダイアログの表示と自動バックアップ作成 | 「Safariのデータ保持期限（7日）が接近しています。データを安全なファイルへ退避しますか？」 |
| 大規模グラフの括り変更 | 破壊的操作の検知 | 変更前のスナップショットをOPFS内 backups/ へアトミック退避 [cite: 8] | （サイレント実行。設定画面より1クリックで過去状態へ復元可能） |

--------------------------------------------------------------------------------
### 7. 結論とアクションプラン
本調査および設計分析により、完全Local-First長編文芸IDE「WorldCraft」が採用すべきストレージアーキテクチャの全容が明確化された。
第一に、従来の IndexedDB 単体構成から脱却し、Dedicated Worker 上で FileSystemSyncAccessHandle を駆動させる OPFS 中心の「セグメント分割ハイブリッド構造」へ移行する [cite: 1, 10]。これにより、IndexedDB 比で最大4倍のI/Oスループットを実現し、キーストローク時の画面フリーズを排除する [cite: 2]。
第二に、モバイルOSの突然死に対しては、FileSystemHandle.move() と flush() を組み込んだ3段階コミット（safeAtomicWrite）パターンを厳格に適用する [cite: 2, 7, 8]。万が一のクラッシュ時にも起動時の自動リカバリ手順によって、データの0バイト化や構文破綻を物理的に防ぐ [cite: 8]。
第三に、Safari ITP等の自動消去脅威に対しては [cite: 14, 15]、PWA化の強力な推進と File System Access API によるローカルフォルダへの透過的ミラーリングを組み合わせることで、サーバーインフラコスト$0を維持したまま、ネイティブアプリと同等の極めて高い堅牢性と応答性を実現できる。
--------------------------------------------------------------------------------
- The Current State Of SQLite Persistence On The Web: May 2026 Update - PowerSync, https://powersync.com/blog/sqlite-persistence-on-the-web
- Origin Private File System (OPFS) Database with the RxDB OPFS-RxStorage, https://rxdb.info/rx-storage-opfs.html
- Why Local-First Software Is the Future and its Limitations - RxDB, https://rxdb.info/articles/local-first-future.html
- The Architecture Of Local-First Web Development - Smashing Magazine, https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development/
- OPFS access handles to be more synchronous · rhashimoto wa-sqlite · Discussion #67, https://github.com/rhashimoto/wa-sqlite/discussions/67
- OPFS: High-Performance Local File Storage for WASM, SQLite & AI, https://webspecification.com/blog/origin-private-file-system/
- webr-opfs/INTEGRATION.md at main - GitHub, https://github.com/seanbirchall/webr-opfs/blob/main/INTEGRATION.md
- Atomic writes with respect to unexpected power offs - Stack Overflow, https://stackoverflow.com/questions/35060793/atomic-writes-with-respect-to-unexpected-power-offs
- Double Buffer - Game Programming Patterns, https://gameprogrammingpatterns.com/double-buffer.html
- GitHub - npiesco/absurder-sql, https://github.com/npiesco/absurder-sql
- The File System Access API: simplifying access to local files | Capabilities, https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- Storage quotas and eviction criteria - Web APIs - MDN Web Docs - Mozilla, https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Does navigator.storage.persist() only protect against data removal in the case of storage pressure? - Stack Overflow, https://stackoverflow.com/questions/78474823/does-navigator-storage-persist-only-protect-against-data-removal-in-the-case-o
- Safari ITP and Cookie Consent: Why Visitors Keep Seeing Your Banner - Kukie.io, https://kukie.io/blog/safari-itp-cookie-banner-reappears
- Safari ITP: Cookies, Tracking, and Conversion Fixes | Blog - Hardal, https://usehardal.com/safari-itp-guide
- How to bypass Safari ITP Limitations - JENTIS, https://www.jentis.com/blog/how-to-work-with-safari-itp-limitations
- Local-First Architecture for Progressive Web Apps - OpenReplay Blog, https://blog.openreplay.com/local-first-pwa-arc



