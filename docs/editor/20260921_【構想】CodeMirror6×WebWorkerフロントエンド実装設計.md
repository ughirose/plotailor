# 20260921_【構想】CodeMirror6×WebWorkerフロントエンド実装設計

## CodeMirror 6によるWorldcraftのフロントエンド実装設計
https://gemini.google.com/app/7aece93d201d14b7

User prompt: Stage 1（Nano Evaluator / Wasm SIMD）をWeb Worker内で実行し、CodeMirror 6の変更イベントと低遅延で双方向通信するパイプラインの実装設計に進んでください。
Response: Web Worker上でのStage 1（Nano Evaluator）実行にあたっては、推論コア自体の処理時間（<0.05ms目標）とメインスレッド-Worker間のIPC（プロセス間通信）オーバーヘッドとの力関係をどのように整理するかが技術的な分岐点になると考えられます。
通信コストが推論時間を上回る逆転現象を防ぐための通信モデル、および$O(\Delta)$差分更新パイプラインの実装設計を検証します。
### 1. 通信アーキテクチャの比較と検証
推論処理がマイクロ秒オーダーである場合、一般的な postMessage によるJSONシリアライズ（構造化クローン）は0.2ms〜1ms程度の遅延を発生させ、Wasm SIMDの恩恵を損なう可能性があります。

| 通信方式 | レイテンシ | スレッド分離 | メリット | デメリット・留意点 |
| --- | --- | --- | --- | --- |
| A. メインスレッド直接実行 | ほぼゼロ (<0.05ms) | なし | IPCオーバーヘッド皆無。同期的に波線を更新可能。 | 大規模な置換時にフレームレート（60/120fps）を阻害するリスク。 |
| B. Web Worker + 構造化クローン | 0.5ms〜2.0ms | 完全分離 | 実装が平易。ブラウザ互換性に優れる。 | 通信遅延が推論時間より一桁大きく、高頻度タイピングで詰まりが生じやすい。 |
| C. Web Worker + Transferable ArrayBuffer | 0.05ms〜0.2ms | 完全分離 | ゼロコピー転送。ガベージコレクション（GC）負荷を極小化。 | バッファの所有権移動（Detached）に伴うメモリ再確保の管理が必要。 |
| D. SharedArrayBuffer + Atomics | <0.01ms | 完全分離 | メモリ共有によりIPCオーバーヘッドが実質ゼロ。 | COOP/COEPヘッダー（クロスオリジン分離環境）の設定が必須。 |

デスクトップWeb小説エディタとしてローカル動作を重視する場合、まずは方式C（Transferable ArrayBuffer によるバイナリパケット通信）をベースラインとし、環境が許せば方式Dへ昇格させるアプローチが現実的と考えられます。
### 2. 差分抽出と状態更新のフロー（O(Δ) 設計）
全文をWorkerへ送るのではなく、CodeMirror 6の tr.changes.iterChanges() を用いて「何文字目から何文字が削除され、何が挿入されたか」のみを抽出します。
[CM6 Transaction]       │       ├─> iterChanges() で削除・挿入トークンを抽出       │       ├─> バイナリパケット構築 (Int32Array)       │    [version, delCount, insCount, ...delTokens, ...insTokens]       │       └─> worker.postMessage(buffer, [buffer]) ── (ゼロコピー転送)                               │                [Web Worker (Stage 1 Runtime)]                               │                               ├─> 状態ベクトル更新: S_t = S_{t-1} - Σ(Del) + Σ(Ins)                               ├─> Wasm SIMD による内積・MLP計算 (<0.05ms)                               │       ┌─ (Transferable) ──────┘       ▼[CM6 AlertStateField]  座標Rebase ──> Decoration反映
### 3. バイナリプロトコルとWorkerパイプラインの実装例
#### (1) 通信メッセージのバイナリレイアウト
配列の先頭領域をヘッダーとして使い、1つの Int32Array（4バイト単位）でやり取りする構成例です。
- Index 0: ドキュメントバージョン（version）
- Index 1: 変更開始オフセット（from）
- Index 2: 削除されたトークン数（delCount）
- Index 3: 挿入されたトークン数（insCount）
- Index 4〜: 削除トークンID列、続いて挿入トークンID列
#### (2) Web Worker側実装（nano-evaluator.worker.ts）
// Wasm SIMD インスタンスのモック・インターフェースinterface NanoEvaluatorWasm {  // S_t の加減算とMLP推論を単一のSIMDループで実行  evaluateDelta(    delPtr: number,    delLen: number,    insPtr: number,    insLen: number  ): number; // 破綻スコア (0〜65535 / 固定小数点)  getMemoryBuffer(): ArrayBuffer;}let wasmInstance: NanoEvaluatorWasm | null = null;// Worker初期化時にWasmをロードasync function initWasm() {  const response = await fetch("/wasm/nano_evaluator_simd.wasm");  const bytes = await response.arrayBuffer();  const module = await WebAssembly.instantiate(bytes, {    /* SIMDインポート設定 */  });  wasmInstance = module.instance.exports as unknown as NanoEvaluatorWasm;}const initPromise = initWasm();self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {  await initPromise;  if (!wasmInstance) return;  const view = new Int32Array(e.data);  const version = view[0];  const from = view[1];  const delCount = view[2];  const insCount = view[3];  let offset = 4;  const delTokens = view.slice(offset, offset + delCount);  offset += delCount;  const insTokens = view.slice(offset, offset + insCount);  // Wasmメモリへトークン列を転送（実運用ではSharedMemoryまたは直接ポインタ参照）  // ここでは差分による破綻度判定をシミュレート  // const score = wasmInstance.evaluateDelta(...);  const isAnomaly = Math.random() < 0.05; // 破綻検出の擬似判定  // 判定結果をバイナリで返却  // レイアウト: [version, hasAnomaly(0/1), from, to, severity(1=ambiguity, 2=fatal)]  const resBuffer = new ArrayBuffer(20);  const resView = new Int32Array(resBuffer);  resView[0] = version;  resView[1] = isAnomaly ? 1 : 0;  resView[2] = from;  resView[3] = from + Math.max(insCount, 1);  resView[4] = 2; // fatal  // Transferable でメインスレッドへ即時返却  self.postMessage(resBuffer, [resBuffer]);};
#### (3) メインスレッド側のディスパッチャ（CM6 ViewPlugin）
タイピングの都度、差分をトークンID（ハッシュ）化してWorkerへストリーム送信します。
import { ViewPlugin, ViewUpdate } from "@codemirror/view";import { EditorView } from "@codemirror/view";import { versionTrackerField, applyNarrativeAlerts, NarrativeAlert } from "./editor-fields";// 簡易的な文字/形態素ハッシュ関数（Stage 1用 Embedding インデックス化）function simpleTokenize(text: string): number[] {  const tokens: number[] = [];  // 簡易的に文字単位で16,384空間へマッピング  for (let i = 0; i < text.length; i++) {    tokens.push(text.charCodeAt(i) % 16384);  }  return tokens;}export function createNanoWorkerPlugin(workerPath: string) {  return ViewPlugin.fromClass(    class {      private worker: Worker;      constructor(private view: EditorView) {        this.worker = new Worker(workerPath, { type: "module" });        // Workerからの結果受信        this.worker.onmessage = (e: MessageEvent<ArrayBuffer>) => {          const res = new Int32Array(e.data);          const version = res[0];          const hasAnomaly = res[1] === 1;          if (!hasAnomaly) return;          const from = res[2];          const to = res[3];          const severity = res[4] === 2 ? "fatal" : "ambiguity";          const alert: NarrativeAlert = {            id: `nano-${version}-${from}`,            from,            to,            severity,            message: "カルテ整合性の不一致が検出されました",            baseVersion: version          };          // 先述のRebase機能付きStateFieldへ反映          this.view.dispatch({            effects: applyNarrativeAlerts.of({              alerts: [alert],              baseVersion: version            })          });        };      }      update(update: ViewUpdate) {        if (!update.docChanged) return;        // 日本語IMEの未確定中は送信をスキップ        if (update.view.composing) return;        const state = update.view.state;        const currentVersion = state.field(versionTrackerField).version;        // 変更差分の集計        let fromPos = 0;        const deletedTokens: number[] = [];        const insertedTokens: number[] = [];        update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {          fromPos = fromB;          // 削除されたテキストのトークン化          const deletedText = update.startState.doc.sliceString(fromA, toA);          if (deletedText) {            deletedTokens.push(...simpleTokenize(deletedText));          }          // 挿入されたテキストのトークン化          const insText = inserted.toString();          if (insText) {            insertedTokens.push(...simpleTokenize(insText));          }        });        // パケット組み立て        const headerSize = 4;        const totalSize = headerSize + deletedTokens.length + insertedTokens.length;        const buffer = new ArrayBuffer(totalSize * 4);        const payload = new Int32Array(buffer);        payload[0] = currentVersion;        payload[1] = fromPos;        payload[2] = deletedTokens.length;        payload[3] = insertedTokens.length;        let offset = headerSize;        payload.set(deletedTokens, offset);        offset += deletedTokens.length;        payload.set(insertedTokens, offset);        // ゼロコピー送信        this.worker.postMessage(buffer, [buffer]);      }      destroy() {        this.worker.terminate();      }    }  );}
### 4. 運用上の検証ポイントと論点
- 差分加減算における浮動小数点のドリフト:
  - ベクトルの加算・減算を何万文字も連続して行うと、St​ にわずかな丸め誤差が蓄積する可能性があります。
  - 対策案: 一定ステップごと（例: 100トランザクション毎、または改章・シーン切り替え時）に、現在のシャドウ・アンカー群から完全な状態ベクトルを再計算してリセット（チェックポイント同期）を挟む運用が考えられます。
- 高速打鍵時のキュー滞留対策:
  - 作家のタイピング速度が非常に速い場合、古いバージョンの推論リクエストがWorker内に滞留する懸念があります。
  - 対策案: Worker内の受信キューで最新バージョン以外の未処理バッファを破棄（Drop-oldest）するスロットリング機構の導入が有効かどうか検証が必要です。

User prompt: Stage 1のベクトル加減算およびMLP破綻スコアリングを行うWasm SIMDコア（Rust/CまたはWat）の内部アルゴリズムとメモリアライメント設計を具体化してください。
Response: ブラウザ内Wasm SIMD（128-bit v128）を用いてレイテンシ 0.05ms 未満を達成するためには、メモリアロケーション（動的確保）を完全に排除し、線形メモリ（Linear Memory）の固定アドレスに対して16バイト（128ビット）境界でアライメントされた連続領域を割り当てる設計が鍵になると考えられます。
Rust（core::arch::wasm32）を前提としたメモリ配置、状態アキュムレータの差分加減算、および極小MLP推論の内部設計について検証します。
### 1. Wasm線形メモリのアライメントと配置設計
SIMD命令（v128.load, v128.store）は、アドレスが16バイト境界に整列されている場合にキャッシュおよびロード命令のペナルティを回避しやすくなります。メモリ断片化とGCオーバーヘッドを排除するため、線形メモリの先頭から静的オフセットで各領域を固定配置する構造が適していると考えられます。
#### メモリマップ構想（総使用量: 約2.2MB / 35 WebAssembly Pages）
[0x0000_0000] ─── Header & Metadata (16 B)[0x0000_0010] ─── State Accumulator S_t (128 dims × 4 B = 512 B, f32)[0x0000_0210] ─── Delta Buffer: Del/Ins Token IDs (最大 2,048 B)[0x0001_0000] ─── Embedding Table (16,384 × 128 B = 2,097,152 B, INT8) [2MB][0x0021_0000] ─── MLP Weights & Biases (W1: 128×64, W2: 64×32, W3: 32×1 / INT8+f32 ≈ 12KB)[0x0021_4000] ─── Scratchpad / Layer Activations (L1: 64×4B, L2: 32×4B ≈ 512 B)

| 領域 | オフセット | サイズ | 型 / アライメント | 役割と設計上の留意点 |
| --- | --- | --- | --- | --- |
| Header | 0x0000 | 16 B | u32 / 16 B | ドキュメントバージョン、デルタ長などを格納。 |
| Accumulator (St​) | 0x0010 | 512 B | f32 / 16 B | 現在の物語文脈ベクトル。誤差蓄積を防ぐため f32（128次元）を採用。 |
| Embedding Table | 0x0001_0000 | 2 MB | i8 / 16 B | 16,384トークン × 128次元。INT8量子化によりキャッシュ効率を最大化。 |
| MLP Parameters | 0x0021_0000 | 約12 KB | i8 / f32 / 16 B | 3層MLPの重みとスケールファクタ。 |
| Scratchpad | 0x0021_4000 | 1 KB | f32 / 16 B | 中間活性化層（L1, L2）の出力バッファ。スタック消費ゼロを維持。 |

### 2. アキュムレータ更新アルゴリズム（O(Δ) 差分加減算）
トークン埋め込み（INT8）を浮動小数点アキュムレータ（f32）へ直接加減算する場合、型の変換オーバーヘッドとSIMDレーンのパッキングが重要になります。
#### 型の整合性に関する考察
- INT8加減算の懸念: アキュムレータをINT8またはINT16に留めると、加算の連続でオーバーフローが発生しやすく、クランプ（飽和）処理による情報損失が生じるリスクがあります。
- f32累積アプローチ: メモリテーブルはINT8（[−128,127]）で保持しつつ、ロード時にSIMD内で符号拡張（i8→i16→i32→f32）して St​ に加減算することで、数値的安定性を担保しやすい構成が取れます。
#### RustによるSIMD更新実装例
use core::arch::wasm32::*;const DIMS: usize = 128; // 128次元#[no_mangle]pub unsafe extern "C" fn update_accumulator_simd(    acc_ptr: *mut f32,    embed_table_ptr: *const i8,    del_tokens_ptr: *const u32,    del_len: usize,    ins_tokens_ptr: *const u32,    ins_len: usize,) {    // 128次元 = 16バイト(4本のf32) × 32チャンク    // 削除トークンの減算: S_t = S_t - Embedding[del]    apply_delta_tokens(acc_ptr, embed_table_ptr, del_tokens_ptr, del_len, -1.0);    // 挿入トークンの加算: S_t = S_t + Embedding[ins]    apply_delta_tokens(acc_ptr, embed_table_ptr, ins_tokens_ptr, ins_len, 1.0);}#[inline(always)]unsafe fn apply_delta_tokens(    acc_ptr: *mut f32,    embed_table_ptr: *const i8,    tokens_ptr: *const u32,    token_len: usize,    sign: f32,) {    let sign_vec = f32x4_splat(sign);    for i in 0..token_len {        let token_id = *tokens_ptr.add(i) as usize;        let token_embed = embed_table_ptr.add(token_id * DIMS);        // 128次元を16要素(128bit)ずつ処理 (計8イテレーション)        let mut dim = 0;        while dim < DIMS {            // INT8 × 16 をロード            let raw_i8 = v128_load(token_embed.add(dim) as *const v128);            // 16バイトのi8を、2本のi16x8へ符号拡張            let low_i16 = i16x8_extend_low_i8x16(raw_i8);            let high_i16 = i16x8_extend_high_i8x16(raw_i8);            // さらにi32x4へ符号拡張し、f32x4へ変換してAccumulatorへ合成            process_and_accumulate(acc_ptr, dim, low_i16, sign_vec);            process_and_accumulate(acc_ptr, dim + 8, high_i16, sign_vec);            dim += 16;        }    }}#[inline(always)]unsafe fn process_and_accumulate(    acc_ptr: *mut f32,    offset: usize,    i16_vec: v128,    sign_vec: v128,) {    // 下位4要素 (i16 -> i32 -> f32)    let low_i32 = i32x4_extend_low_i16x8(i16_vec);    let low_f32 = f32x4_convert_i32x4(low_i32);    let cur_acc_low = v128_load(acc_ptr.add(offset) as *const v128);    let updated_low = f32x4_add(cur_acc_low, f32x4_mul(low_f32, sign_vec));    v128_store(acc_ptr.add(offset) as *mut v128, updated_low);    // 上位4要素 (i16 -> i32 -> f32)    let high_i32 = i32x4_extend_high_i16x8(i16_vec);    let high_f32 = f32x4_convert_i32x4(high_i32);    let cur_acc_high = v128_load(acc_ptr.add(offset + 4) as *const v128);    let updated_high = f32x4_add(cur_acc_high, f32x4_mul(high_f32, sign_vec));    v128_store(acc_ptr.add(offset + 4) as *mut v128, updated_high);}
### 3. MLP破綻スコアリング（GEMV + 活性化関数のSIMD化）
アキュムレータ更新直後に実行されるMLP判定部（Layer 1: 128→64、Layer 2: 64→32、Layer 3: 32→1）の実装です。
#### 128ビットSIMDでの内積・縮約計算
Wasm SIMDには直接のドット積命令（Dot Product）が限られているため、4レーンの乗算結果を水平加算（Horizontal Add）するイディオムを採用します。
#[inline(always)]unsafe fn dot_product_128(vec_a: *const f32, vec_b: *const f32) -> f32 {    let mut sum = f32x4_splat(0.0);    // 128次元を4要素ずつ32回ループ (アンローリング可)    for i in (0..128).step_by(4) {        let a = v128_load(vec_a.add(i) as *const v128);        let b = v128_load(vec_b.add(i) as *const v128);        sum = f32x4_add(sum, f32x4_mul(a, b));    }    // f32x4 の4レーンを単一のスカラf32へ水平加算    let high = i64x2_shuffle::<1, 1>(sum, sum);    let sum2 = f32x4_add(sum, high);    let single = f32x4_extract_lane::<1>(sum2) + f32x4_extract_lane::<0>(sum2);    single}#[no_mangle]pub unsafe extern "C" fn evaluate_mlp_simd(    acc_ptr: *const f32,    w1_ptr: *const f32, // 重みはFP32展開済みと仮定    b1_ptr: *const f32,    l1_out_ptr: *mut f32,    // Layer 2, Layer 3 のポインタ...) -> f32 {    // --- Layer 1: 128 -> 64 ---    for j in 0..64 {        let weight_row = w1_ptr.add(j * 128);        let bias = *b1_ptr.add(j);        let dot = dot_product_128(acc_ptr, weight_row) + bias;        // ReLU 活性化        *l1_out_ptr.add(j) = if dot > 0.0 { dot } else { 0.0 };    }    // --- Layer 2: 64 -> 32 (同様の内積・ReLU) ---    // --- Layer 3: 32 -> 1 (破綻確率スコア出力) ---    let final_logit = 0.5; // 計算結果のシグモイド入力    1.0 / (1.0 + (-final_logit).exp()) // 破綻スコア (0.0 〜 1.0)}
### 4. 計算量とレイテンシの検証
手元の環境（一般的なx86-64 / Apple Silicon）において想定される理論サイクル数を試算します。

| 処理ステップ | 演算規模 | SIMD命令数（推定） | 処理時間見込み（3GHz換算） |
| --- | --- | --- | --- |
| 差分更新（Δ=2トークン） | 128次元の加減算 | 約 150 instructions | ≈0.0001 ms |
| MLP Layer 1 (128→64) | 64×128=8,192 積和 | 約 2,200 instructions | ≈0.0015 ms |
| MLP Layer 2 (64→32) | 32×64=2,048 積和 | 約 600 instructions | ≈0.0004 ms |
| MLP Layer 3 (32→1) | 32 積和 ＋ Sigmoid | 約 50 instructions | ≈0.0001 ms |
| 合計 | 全パイプライン | 約 3,000 instructions | ≈0.002 ms∼0.005 ms |

0.05 ms の目標レイテンシに対してオーダーレベルで余裕があり、ブラウザ側のタスクスケジューラ遅れを考慮しても十分にフレーム内（16ms / 60fps）での即時判定が成立する余地があると考えられます。
### 5. 設計上のトレードオフと論点
- 重みの量子化方式:
  - 上記では内積の単純化のため重みを f32 として記述していますが、バイナリサイズ制約（2.1MB以下）を維持するには重みもINT8で格納し、演算直前に f32 に展開するか、内積を整数演算（i32x4_dot_i16x8 の擬似構成）で完結させるかの選択が求められます。
- 長文執筆に伴うドリフト:
  - ∑E[ins]−∑E[del] の連続適用による数値精度の乖離を検証するため、一定文字数ごとに章頭からの全計算ベクトルとアキュムレータのコサイン類似度を比較・補正するセーフティネットの要否が検討対象になります。

User prompt: 未着手トピック2である「初回体験（PoC）の検証設計（ログイン不要5分でAha Momentへ到達させるUI導線と本文直行型 vs 関係性起点型の比較）」に進んでください。
Response: 初回体験（PoC）における最大の課題は、作家に対して「初期入力の負担（コールドスタート問題）」を感じさせずに、いかに短時間で「このツールは自分の世界の因果律を理解している」という実感（Aha Moment）へ導けるかという点にあると考えられます。
ログイン不要のWebサンドボックス環境を前提に、体験設計とUIアプローチの比較検証を進めます。
### 1. 5分以内に到達すべき「3つのAha Moment」の定義
本プロダクトが提供する価値は、単なる文章補助ではなく「世界の構造化」にあるため、以下の3段階の認知変化を短時間で順に体験させる構成が有効と推測されます。
- 空間化（Spatialization）: プレーンテキストを入力・選択するだけで、エディタの背後に位置関係や移動トポロジー（「城から森へ徒歩で半日」など）が不可視のまま紐づく感覚。
- 知性化（Epistemic Awareness）: 「Aは裏切りを知らない」状態でA視点の文章に秘密を漏洩させた瞬間、過剰な警告音ではなく「見落としアラート」が静かに波線で灯る体験。
- 多面化（Perspectivism）: 同一の出来事（Event）を別キャラクターの視点（カルテ）から開いた際、認識の齟齬や嘘がレイヤーとして可視化される瞬間。
### 2. UIアプローチの比較検証：本文直行型 vs 関係性起点型
初回訪問ユーザーが5分で価値を理解するためのアプローチとして、主に2つの対立軸が考えられます。

| 評価軸 | パターンA：本文直行型（Text-First） | パターンB：関係性起点型（Graph/Entity-First） |
| --- | --- | --- |
| 初期UI | ほぼ白紙のエディタ。右側に控えめな「見落としカルテ」パネル。 | キャラクター相関図（ノード）とタイムラインの簡易設定画面。 |
| ユーザーの初手アクション | 用意された「破綻を含んだ短編サンプル」の閲覧または数行の執筆。 | 2〜3人のキャラクター関係性（主観認識・秘密など）のカード入力。 |
| Aha Momentまでの手数 | 最少（2〜3クリック）: サンプル内の破綻箇所を1文字直すだけで即座にアラートが反応。 | 中程度（5〜8操作）: 関係性を定義した後にエディタへ移動する必要がある。 |
| メリット | 執筆を妨げない「シャドウ・セマンティクス」の思想が直感的に伝わりやすい。 | 「因果律と主観認識を管理する」というNarrative IDE本来の強みが構造として明瞭。 |
| 離脱リスク | 「単なるテキストエディタ＋誤字脱字チェッカー」と誤認され、深層機能に気づかれない懸念。 | 設定入力の手間により、文章を書く前に「面倒な管理ツール」として離脱されるリスク。 |
| 技術的実装負荷 | 低〜中。プリセットのテキストとRangeSetを初期ロードするのみで完結。 | 中〜高。キャンバスUIやインタラクティブなノード操作系の構築が必要。 |

#### 考察と検証
Web小説作家は「設定資料を作るのが好きだが本文が進まない層」と「本文を勢いで書き殴って設定破綻する層」に二極化する傾向が見られます。 完全な白紙からの関係性入力（パターンB）は認知負荷が高く、5分以内の離脱率を高める恐れがある一方、本文直行型（パターンA）は既存の文章校正ツールとの差別化が曖昧になる可能性があります。
したがって、「仕掛けのあるインタラクティブ・サンプルを用いた本文直行型（Interactive Playground）」を初期展開とし、その裏で関係性がリアルタイムに連動する姿を見せる折衷案が、検証仮説として有力視されます。
### 3. 5分完結のPoCウォークスルーシナリオ案
登録不要・1クリックで以下のプリセット（お題）が展開されるシナリオが考えられます。
[00:00] LPから「5秒で試す」ボタン押下 ──> ログイン不要でエディタ展開   │[00:30] サンプル短編（約400文字）がロード済み   │    状況: 「勇者カイン」と「魔法使いリゼ」が迷宮を探索中。   │    設定: リゼは右腕を負傷中／リゼはカインが王族であることを知らない。   │[01:30] 【体験1: 空間化】   │    本文中の「カインはリゼの手を取り、西の広間へ一瞬で駆け戻った」に対し、   │    「移動速度アラート（徒歩1時間の距離）」が点線で表示される。   │[03:00] 【体験2: 知性化】   │    ユーザーに「リゼの台詞を一行足してみてください」とガイド表示。   │    例: リゼ「あなたが王子様だったなんてね」と入力。   │    ──> 即座に「認識権限アラート（リゼはこの事実を未認知）」が琥珀色で点灯。   │[04:30] 【体験3: 多面化】   │    アラートをクリックすると、右サイドバーの「リゼの主観カルテ」が開き、   │    客観的事実とリゼの知っていることの差異が一目で可視化される。   │[05:00] 「自分の作品で試す（無料登録・ローカル保存）」への自然な誘導
### 4. 技術的裏付けとアーキテクチャ
ブラウザ完結型PoCを実現するための技術的成立性を検証します。
- IndexedDB / LocalStorage サンドボックス: 初回アクセス時はサーバー通信を発生させず、Wasmモジュール（2.1MB）と初期スキーマデータをブラウザキャッシュ（Service WorkerまたはIndexedDB）へ直接展開。コールドスタート時の通信を極小化し、即座に入力可能な状態を整えます。
- 初期状態の静的プリロード: サンプルの状態ベクトル（S0​）やシャドウ・アンカーのオフセット座標はあらかじめビルド時に静的JSON/バイナリとして生成しておくことで、起動時の形態素解析や構文木構築の計算をスキップし、初期化遅延をほぼゼロに抑えられる設計が現実的です。
### 5. ビジネス価値（ROI）とPLG（Product-Led Growth）の観点
- サーバー原価 $0 の優位性: Stage 1（Nano Evaluator）がWasmで全件クライアント処理されるため、初回PoCを完全無料・無制限で開放してもインフラコスト（GPUサーバー代）が一切スケールしません。これはバイラル時の急激なアクセス増に対する財務的防御壁となります。
- コンバージョン率（CVR）の仮説検証: テキストエディタの乗り換えコストは極めて高いため、「便利そうだから使う」ではなく「自分の過去作の設定破綻が可視化されてゾッとする（不可逆な安心感）」という心理的スイッチを押せるかが、PoCから継続利用への転換率を左右する要因になり得ます。
### 検討・議論の論点
- 初期サンプルのジャンル依存: ファンタジー（ステータス・魔法制約）を題材にすると伝わりやすい反面、現代ドラマやミステリーを主戦場とする作家に「自分向けのツールではない」と判断されるリスクはないか。
- 「お節介」と感じさせない初期閾値: 初回体験時にアラートが過剰に出すぎると、作家の創作意欲を削ぐ（クリエイティブ・フリーズを起こす）懸念があるため、チュートリアル中は意図的に検知感度を絞るべきか。

User prompt: PoCで5分以内にAha Momentを体験させるための、具体的な短編サンプル文章とそれに埋め込む因果律・主観認識スキーマの設計に進んでください。
Response: 初回体験（PoC）において5分以内に「空間化」「知性化」「多面化」の3つのAha Momentを成立させるためには、過度に複雑な世界観を説明することなく、誰もが直感的に物理制約や認識のズレを理解できる題材とスキーマ設計が求められると考えられます。
### 1. サンプル設定の選定と検証
サンプルのジャンル選定は、PoCの離脱率に直結する重要な要素と推測されます。

| ジャンル案 | メリット | リスク・課題 | 判定 |
| --- | --- | --- | --- |
| ハイファンタジー（ダンジョン・魔法） | 身体欠損や装備スロット、魔法距離など物理制約の定義が容易。 | 固有名詞が多くなり、世界観の把握に1〜2分消費される懸念。 | △ やや冗長化のリスク |
| 現代ミステリー / サスペンス | 読者の事前知識（スマホ、移動手段、アリバイ）が使え、説明不要。 | 心理描写が多く、Stage 1の極小モデルで拾いにくい比喩が増える恐れ。 | △ 誤検知率の懸念 |
| 王道冒険譚（脱出・探索の1シーン） | 「負傷」「アイテム所有」「誰が何を知っているか」が明快で即応。 | 目新しさが弱く、既存のゲーム的設定に見える可能性。 | ◎ 検証に最適 |

短時間で「因果律の監視」を実感させる観点からは、説明を極限まで削ぎ落とせる「遺跡からの脱出・秘密の共有」というミニマルな状況設定が扱いやすいと考えられます。
### 2. 埋め込みスキーマ定義（JSON構造）
ブラウザのIndexedDB / LocalStorageに事前配置しておく初期スキーマの設計案です。客観的事実（Ground Truth）と各主観認識（Epistemic State）を明確に分離して定義します。
{  "world_id": "poc_ruins_escape",  "locations": {    "loc_altar": {      "name": "封印の祭壇",      "neighbors": { "loc_entrance": { "travel_cost_minutes": 45, "type": "footpath" } }    },    "loc_entrance": {      "name": "遺跡の入口",      "neighbors": { "loc_altar": { "travel_cost_minutes": 45, "type": "footpath" } }    }  },  "items": {    "item_relic_ring": {      "name": "宵闇の指輪",      "owner_id": "char_cain",      "slot": "right_finger",      "traits": ["royal_heritage"]    }  },  "characters": {    "char_cain": {      "name": "カイン",      "status": {        "location": "loc_altar",        "body_constraints": { "right_arm": "healthy", "left_arm": "healthy" }      },      "known_facts": [        "fact_cain_is_prince",        "fact_ring_is_relic",        "fact_lize_arm_injured"      ]    },    "char_lize": {      "name": "リゼ",      "status": {        "location": "loc_altar",        "body_constraints": { "right_arm": "broken", "left_arm": "healthy" }      },      "known_facts": [        "fact_lize_arm_injured"      ],      "unaware_facts": [        "fact_cain_is_prince",        "fact_ring_is_relic"      ]    }  },  "facts": {    "fact_cain_is_prince": { "statement": "カインは亡国オルステッドの正統な王子である" },    "fact_ring_is_relic": { "statement": "カインの指輪は王家の紋章が刻まれた秘宝である" },    "fact_lize_arm_injured": { "statement": "リゼは崩落事故により右腕が麻痺している" }  }}
### 3. 短編サンプル本文とシャドウ・アンカーの配置
ユーザーがエディタを開いた瞬間に表示されている本文（初期テキスト）です。タグやマークアップを一切含まない自然言語でありながら、裏側でオフセットによる暗黙結線がなされています。
#### 本文（約380文字）
崩落の轟音が去り、封印の祭壇には冷たい静寂だけが残されていた。リゼは瓦礫に背を預け、痛む右腕をかばいながら小さく息を吐く。「ここまで来れば、追手も諦めるかしら」隣に立つカインは何も答えず、煤で汚れた指輪に視線を落とした。リゼはその指輪をただのガラクタだと思っている。旅の途中で拾ったとカインが嘘をついたからだ。「息を整えたら出発するぞ。入口まではまだ距離がある」カインはリゼの無事な左手を引き、ゆっくりと立ち上がらせた。
#### シャドウ・アンカー結線テーブル（初期ロード時）

| オフセット範囲 | 該当テキスト | 紐づくエンティティ | 備考（初期状態） |
| --- | --- | --- | --- |
| [11, 16] | 封印の祭壇 | Location: loc_altar | 現在の現在地としてバインド |
| [30, 32] | リゼ | Character: char_lize | POV（視点）管理 |
| [42, 44] | 右腕 | char_lize.status.body_constraints.right_arm | 状態: broken |
| [82, 85] | カイン | Character: char_cain |  |
| [97, 99] | 指輪 | Item: item_relic_ring | 所有者: カイン |
| [108, 110] | リゼ | Character: char_lize |  |
| [160, 162] | 入口 | Location: loc_entrance | 祭壇から徒歩45分の距離 |
| [183, 185] | 左手 | char_lize.status.body_constraints.left_arm | 状態: healthy（整合） |

### 4. 5分間のインタラクティブ検証シナリオ
ユーザーに「読む」ではなく「1行書き換える・書き足す」アクションを促し、リアルタイムに3つのAha Momentを体験させる導線です。
[00:00 - 01:00] 導入・初期確認  ・エディタ展開。本文と右サイドバーの「キャラクターカルテ（リゼ）」が並ぶ。  ・ガイド表示：「リゼの右腕は負傷中、カインの素性は秘密です」[01:00 - 02:00] 体験1: 空間化（物理トポロジーの検知）  ・操作：末尾の「ゆっくりと立ち上がらせた」の後に、以下を追記させる。    『カインはリゼの肩を支え、数分で遺跡の入口へと駆け抜けた。』  ・判定：Stage 1 (Nano Evaluator) が即時検知。  ・挙動：「数分で」の下に琥珀色の波線が点灯。  ・カルテ提示：「移動コスト乖離：祭壇から入口までは徒歩45分。数分での移動は不整合の可能性があります」[02:00 - 03:30] 体験2: 知性化（主観認識層・エピステミックの検知）  ・操作：上記の移動文を削除させ、代わりに会話文を1行足させる。    リゼ「その指輪、王家のものなんでしょう？ 王子様」  ・判定：Stage 1 が `item_relic_ring.traits` と `char_lize.unaware_facts` の衝突を検知。  ・挙動：「王子様」の下に波線が点灯。  ・カルテ提示：「認識権限の不一致：リゼは【カインの素性】を知りません（第3話でカインが嘘をついた設定と矛盾）」[03:30 - 05:00] 体験3: 多面化（主観レイヤーの反転表示）  ・操作：エディタ右上の「視点切り替え」で【カイン視点】から【リゼ視点】へトグル。  ・挙動：本文の背景が微かに変化し、リゼから見えている「世界の見取り図」がサイドバーに表示される。    - カインの持ち物：「煤けた指輪（道端で拾った安物）」と表示（嘘が反映）。    - 自分のステータス：「右腕：激痛（行動不能）」が強調。  ・実感：「客観的な設定資料」ではなく「作中人物が信じている偽情報」までIDEが追従していることを理解。
### 5. 技術的裏付けとビジネス価値（ROI）の検証
#### 技術的成立性の確認
- ゼロ遅延の実現性: 短編の文字数が400文字程度であるため、Wasm SIMDの差分アキュムレータ更新（O(Δ)）は数マイクロ秒で完了し、タイピングと完全に同期して波線が描画されると考えられます。
- ルールと極小モデルの協調: 「数分で」という時間詞と「入口（45分）」の衝突はルールエンジンで拾い、主観認識（リゼが王子と呼ぶことの不自然さ）はNano Evaluatorの内積判定で即時に検知フラグを立てるパイプラインの親和性が高いと推測されます。
#### ビジネス価値（ROI）と検証の論点
- 初期摩擦（フリクション）の最小化: アカウント作成や設定資料のアップロードを要求せず、既存の「完成された破綻」を直させる体験設計により、Web小説作家が最も嫌う「初期セットアップの手間」をゼロに抑えられる利点があります。
- Aha Momentの質の検証: 単なる「文章校正（文法チェッカー）」と受け取られるリスクを回避するため、波線のツールチップ文言には文法的な指摘を一切含めず、「キャラクターカルテ」「世界の因果律」というコンテキストに閉じたフィードバックを徹底することがプロダクト認知を左右する分岐点になり得ます。
### 検討・改善の余地
- 誘導の強制力: ガイド（ツールチップ）で「これを入力してください」と指定しすぎると、単なる台本通りのお手回しデモに見え、自律的なIDEとしての知性を疑われる懸念があります。自由入力を促しつつ確実に検知を踏ませるプロンプティングUIの検証が考えられます。
- 長編展開への接続: この5分体験を終えたユーザーが、次に「自分の執筆中テキスト（数十万字）を一括インポートする」導線をどう自然に配置するかという課題が残されています。

User prompt: PoCにおいてユーザーが想定外の自由入力を行った際、Stage 1で判定不能（グレーゾーン）となりStage 2（SLM）へフォールバックする具体的な境界条件とプロンプト設計を検証してください。
Response: PoCにおける自由入力では、想定された模範的な操作から外れた「日本語特有の主語省略」「遠回しな比喩表現」「推敲途中の断片文」などが高頻度で発生し、Stage 1（Nano Evaluator）の線形内積・MLP判定のみでは信頼度が低下するケースが生じると考えられます。
誤検知（False Positive）による作家の創作意欲阻害を防ぎつつ、クライアント完結の運用を維持するための境界条件と、極小SLM（0.5B〜1.5B）を高速に駆動させるためのプロンプト設計を検証します。
### 1. Stage 1からStage 2へのフォールバック境界条件
Stage 1のMLPが出力する破綻確率スコア（P∈[0.0,1.0]）に対し、単一の閾値で二値分類を行う運用は、創作者向けツールにおいて過剰な警告や検知漏れを招くリスクが懸念されます。そのため、判定結果を3つの帯域に分離する設計が妥当と考えられます。
[Stage 1 スコア分布]  0.0 ────────── 0.30 ────────────── 0.70 ────────── 1.0  │    整合ゾーン    │   グレーゾーン（要調停）   │   破綻確定ゾーン   │  ▼                  ▼                        ▼ 波線なし         Stage 2（SLM）へ委託      即座に波線描画（<0.05ms）
#### グレーゾーンへ振り分ける入力特性の比較

| 入力パターン | Stage 1の挙動と課題 | Stage 2への委託理由 |
| --- | --- | --- |
| 主語の完全省略  （例: 「指輪をポケットにねじ込んだ」） | 誰の行動か判別できず、所有権スロットの照合が不確定（スコア: 0.40〜0.60）。 | 前後数文の文脈（誰の視点か、直前に誰が話していたか）を文脈補完するため。 |
| 比喩・皮肉・誇張  （例: 「足が棒になった」「光の速さで戻った」） | 物理制約エンジンが「光速移動」「肉体硬化」と誤認し、偽陽性の破綻を検知しやすい。 | 自然言語の比喩表現であることをSLMに解釈させ、アラートを抑止するため。 |
| 間接的な言及・ほのめかし  （例: 「あの高貴な生まれが災いしたのね」） | 「王子」「カイン」といった直接の固有名詞がなく、埋め込みベクトルの内積が閾値に達しない。 | 「高貴な生まれ」が未認知情報（fact_cain_is_prince）に抵触するかを推論するため。 |
| タイピング途中の断片  （例: 「リゼは右手をあげ」） | 未完成の述語により状態遷移が不完全。 | 構文的に未完了であると判断し、推論を保留（No-op）とするため。 |

### 2. SLM向けコンテキスト・スライシング設計
0.5B〜1.5B規模の極小SLM（Qwen 2.5-0.5B/1.5B、Llama 3.2-1B等）は、数千トークンにおよぶ設定資料全体を渡すと指示追従性の低下やハルシネーション、WebGPU推論遅延（1秒超）を引き起こす恐れがあります。
そのため、エディタ裏のスキーマから「該当シーンに関連する要素のみ」を抽出し、入力コンテキストを200〜300トークン程度に圧縮して渡すスライシング処理が重要になると考えられます。
[抽出パイプライン]1. 編集行を中心とした直前3文〜直後1文（本文コンテキスト）2. 検出対象となったキャラクターの「ステータス」および「未認知事実（unaware_facts）」3. 直前で参照されたアイテム・場所の制約定義
### 3. Stage 2（SLM）プロンプト設計と入出力仕様
極小モデルの推論を安定させるため、思考プロセスを長々と出力させず、決定論的なJSONスキーマで返却させる形式を採ります。
#### システムプロンプト（System Prompt）
あなたは物語の因果律とキャラクター認識を監視する編集アシスタントです。与えられた【前提設定】と【対象テキスト】を照合し、設定の破綻や認識の矛盾が存在するか判定してください。### 判定規則:1. 主語が省略されている場合、文脈から主語を補完して判定すること。2. 比喩表現や慣用句（例:「光の速さで」「手が滑る」）は物理的破綻とみなさないこと。3. 未認知の事実について、直接または間接的に知っているような発言・行動があれば矛盾とする。4. 確証が持てない場合は is_inconsistent を false にすること（誤検知の防止を最優先）。出力は以下のJSON形式のみとし、解説文は含めないでください。{"is_inconsistent": boolean, "target_text": string, "reason": string}
#### 入力ペイロード例（ユーザーが「あの方の血筋には逆らえないわね」と自由入力した場合）
{  "context": [    "リゼは瓦礫に背を預け、痛む右腕をかばいながら小さく息を吐く。",    "「ここまで来れば、追手も諦めるかしら」",    "カインは煤で汚れた指輪に視線を落とした。"  ],  "target_sentence": "リゼは小さく笑い、「あの方の血筋には逆らえないわね」と呟いた。",  "perspective_character": {    "name": "リゼ",    "body_constraints": { "right_arm": "broken" },    "unaware_facts": [      "カインは亡国オルステッドの正統な王子である"    ]  }}
#### SLMの出力期待値
{  "is_inconsistent": true,  "target_text": "あの方の血筋",  "reason": "リゼはカインが王族（血筋）であることを知らない設定です。"}
### 4. 技術的裏付けと運用パフォーマンスの検証
Web Worker内、またはWebGPUを用いたブラウザ内SLM推論（例: Transformers.js / ONNX Runtime Web利用時）における実行効率を試算・検証します。
#### レイテンシとリソース消費の見通し

| 項目 | Stage 1（Wasm SIMD） | Stage 2（WebGPU / 0.5B SLM） | 考察と課題 |
| --- | --- | --- | --- |
| 実行頻度 | キーストローク毎（毎文字） | デバウンス後（打鍵停止200〜300ms後かつグレー時） | Stage 2の起動頻度を全打鍵の1〜5%程度に絞り込むことが必須。 |
| レイテンシ | < 0.05 ms | 150 ms 〜 400 ms（端末性能に依存） | 400ms程度であれば、波線デコレーションのRebase機構で違和感なく同期可能。 |
| 消費メモリ | 約2.2 MB（固定） | 約350 MB 〜 800 MB（INT4量子化時） | PoCの初回アクセス時にモデルをダウンロードさせる場合、ロード時間のUX設計が焦点。 |
| 端末負荷 | CPU負荷は極小（数%以下） | GPU瞬間使用率が高まる | モバイル端末や低スペックPCでの熱・バッテリー消費への配慮が必要。 |

### 5. ビジネス価値（ROI）の観点
- 偽陽性（False Positive）の抑制による離脱防止: 作家が最もストレスを感じるのは「比喩や文脈表現を機械的にエラー扱いされること」であると考えられます。SLMによる調停を挟むことで、誤判定によるツールの信頼性失墜を防ぎ、PoCから本契約・継続利用への定着率を守る防波堤となります。
- インフラ原価の防衛: Stage 2をサーバーサイドAPI（OpenAIやClaude等）に頼る設計とした場合、PoCを完全開放した際にAPIコール費用が予測不能に膨らむ懸念があります。クライアント側WebGPUまたは手元のローカルLLM（Ollama等）への接続を標準とすることで、粗利率85%超およびサーバー原価$0の前提を崩さずにスケールさせることが可能と考えられます。
### 検討・調整の論点
- PoCにおける初回モデルロード時間: ブラウザ内WebGPUで0.5Bモデルをロードする場合、初回に数百MBのダウンロードが発生し「5分以内のAha Moment」を阻害する恐れがあります。PoC環境に限っては、軽量なルールベース調停で代替するか、バックエンドの極小共有インスタンスを一時的に経由させるかの選択肢が検討対象になり得ます。
- SLMの出力JSONパース失敗への耐性: 0.5B〜1.5BクラスのモデルはJSONのフォーマット崩れを起こす確率がゼロではないため、Grammar-constrained Decoding（文法拘束生成）の適用や、フォールバックとしてアラート表示をスキップする安全弁の設置が求められます。

User prompt: 未着手トピック3である「下流展開・コミュニティ（Cloudflare R2等を活用した読者向けネタバレ防止相関図のWeb公開やメディアミックス連携）」の設計に進んでください。
Response: Cloudflare R2とエッジコンピューティングを活用したWeb公開およびメディアミックス連携パイプラインは、エディタ裏で保持している「4大コアスキーマ」と「主観認識層（Epistemic Layer）」のグラフデータを静的アセットへ変換し、配信コストをほぼゼロに抑えながらバイラル拡散（PLG）を駆動させるアプローチとして位置づけられます。
### 1. 静的配信アーキテクチャ（Cloudflare R2 ＋ Workers）
読者向け相関図の公開に伴うトラフィック急増（作品のバズやアニメ化発表時など）に対して、データベース接続やSSRサーバーを排し、エッジストレージから静的JSONとViewerアセットを直接配信する構成が現実的と考えられます。
[Worldcraft Editor (Client)]       │       ├─> エクスポート実行 (スナップショット生成)       │    ・話数・タイムスタンプごとの差分抽出       │    ・ネタバレ伏字・未開示エンティティの枝刈り (Pruning)       │       └─> Direct Upload (Presigned URL) ──> [Cloudflare R2]                                                   │[読者ブラウザ] <─── Cloudflare CDN / Workers ───────┤ (Egress料金 $0)       │       └─> スライダー操作: 話数ごとのトポロジー・主観関係性をレンダリング
#### 配信方式の比較検証

| 方式 | 特徴 | メリット | 懸念・留意点 |
| --- | --- | --- | --- |
| A. 全話統合JSON ＋ クライアント側フィルタリング | 全話の全状態を単一の暗号化/非暗号化JSONで配信し、読者のスライダー操作で表示切り替え。 | リクエスト数が1回で済み、オフライン動作や滑らかなUI遷移が可能。 | DevToolsでレスポンスを直接解析された場合、未来の話数のネタバレが読者に漏洩するリスクが高い。 |
| B. 話数単位分割静的JSON（推奨） | ep_001.json, ep_002.json のように、各話時点で公開可能な差分または状態のみを独立生成してR2に配置。 | クライアントに未読話数のデータ自体が存在しないため、技術的なネタバレ漏洩を物理的に遮断可能。 | 話数が多い長編（数百話）において、R2へのオブジェクト書き込み数と初回エクスポート処理時間が増加。 |
| C. Workers動的マスキング（SSR/エッジAPI） | 読者のリクエストヘッダー（クエリパラメータ）に応じてWorker内でグラフを動的に枝刈りして返却。 | 柔軟な認可制御やアクセス解析が可能。 | WorkersのCPU実行時間（ミリ秒）とリクエスト課金が発生し、完全な静的配信に比べて運用コストが上昇。 |

データ完全性とネタバレ防止の観点からは、方式B（話数ごとの静的スライス生成）をベースラインとし、閲覧時のセキュリティを担保する設計が堅牢と推測されます。
### 2. 読者向け「ネタバレ防止・読了話数連動」相関図（エピステミック・ビューア）
エディタ本体の「主観認識層」を活用することで、読者に対して「客観的な事実」だけでなく「作中人物がその時点で何を信じていたか」を切り替えて閲覧できる体験を提供できます。
#### ビューアの主要インターフェース設計
- 読了話数スライダー:
  - スライダーを「第12話」に合わせると、第12話終了時点までに発生した Event のみが適用された状態グラフ（ノード: Character/Item/Location、エッジ: 所有・好悪・主観認識）を描画。
- 視点（POV）トグルスイッチ:
  - 「客観事実（神の視点）」モード: 読者が物語全体の裏設定や確定した因果律を俯瞰。未読範囲は完全に不可視化（ブラックアウト）。
  - 「特定キャラの主観」モード: 例として「リゼ視点」を選択すると、カインが王子である事実が隠蔽され、「旅の同行者」「安物の指輪を所持」といった主観認識（虚偽・誤認）に基づいたラベルへ動的に書き換え。
#### 静的データ生成時のプルーニング（枝刈り）アルゴリズム
ビルド時に以下の条件でノードおよびエッジを無害化します。
Vvisible​(E)={v∣∃e∈Events(0…E),v∈Entities(e)}
- 該当話数 E までに一度も登場・言及されていないエンティティは、JSONスキーマからプロパティごと完全に除外（IDすら含めない）。
- 各エンティティの属性は、その話数時点の最新スナップショット値に固定。
### 3. メディアミックス連携：Shotlist（カット表）変換
Web小説がコミカライズ（Webtoon/横スクロール漫画）やアニメ化へ進む際、作画担当者や演出家との間で「位置関係の矛盾」「前コマで持っていた武器の消失」「服装・装飾の齟齬」によるリテイクが多発する傾向が見られます。
Worldcraftの因果律データを映像・作画用の制作仕様書へ変換することで、制作現場のコミュニケーションコストを削減できる可能性があります。
#### 変換データマッピング仕様

| Worldcraft スキーマ | メディアミックス向け出力項目 | コミカライズ・アニメ制作での具体的用途 |
| --- | --- | --- |
| Location.topology | 美術ボード・背景指示書 | カメラアングル、光源の向き、キャラクター間の物理的距離の整合性担保。 |
| Character.body_constraints | 作画注意事項（カルテ） | 「右腕負傷中のため、左手で物を持ち上げる」「火傷痕の露出位置」等のリテイク防止。 |
| Item.slot (排他制御) | プロップ（小道具）追跡リスト | 剣を抜いているか鞘に納めているか、指輪をどちらの指につけているかのコマ間連続性維持。 |
| Event.pov + known_facts | 演出意図・表情指示 | キャラクターが「知っていてとぼけている」のか「本気で驚いている」のかの演技設計。 |

#### Shotlist（カット表）出力例（CSV / JSONエクスポート）
{  "scene_id": "ep03_sc04",  "location": { "name": "封印の祭壇", "atmosphere": "瓦礫・薄暗い・光源は頭上" },  "cuts": [    {      "cut_number": 12,      "characters_present": [        { "id": "char_cain", "pose": "立ち姿・視線は手元", "held_item": "item_relic_ring (right_hand)" },        { "id": "char_lize", "pose": "瓦礫に座り込む", "state_notes": "右腕ダラン（行動不可）" }      ],      "direction_notes": "リゼはカインの手元に気づいているが、指輪の正体には気づいていない表情。"    }  ]}
### 4. PLG（Product-Led Growth）構造とビジネス価値（ROI）の検証
#### (1) バイラルループの定量的循環
読者向け相関図は、ツール自体の認知を獲得するためのディストリビューション機構として機能します。
[作家] ──> Worldcraftで執筆・相関図を生成              │              ├─> X (旧Twitter) や小説家になろう等の後書きに相関図URLを貼付              │[読者] <──────┘   │   ├─> ネタバレなし相関図を閲覧（快適な読書体験）   │   └─> フッターの「Created with Worldcraft - 物語の型安全IDE」から       他の創作活動を行う読者（潜在的作家）が新規流入（CAC = $0）
#### (2) インフラ原価と粗利率のシミュレーション
Cloudflareのエコシステム（R2 + CDN）を活用した場合の月間コスト試算です。
- 前提: 月間アクティブ作家 10,000人、読者による相関図閲覧 5,000,000 PV/月。
- ストレージ容量: 1作品（100話分）あたり約5MB → 10,000作品で約50GB。
- データ転送量（Egress）: Cloudflare R2はEgress料金が完全無料（$0/GB）。
- 試算結果:
  - R2 ストレージ保管料（50GB）: 最初の10GB無料、残り40GB × $0.015 = $0.60 / 月
  - R2 Class B オペレーション（読取）: 5,000,000リクエスト ≈ $1.80 / 月（キャッシュヒット率を考慮するとさらに低減）
  - 合計インフラ費用: 月額 $5.00 未満
読者向けビューアを大規模に公開してもサーバーコストがほぼ固定化されるため、ターゲットとする粗利率85%超を余裕を持って維持できる計算が成り立ちます。
### 5. 実装上の課題とリスク検証
- Webtoon特有の縦スクロール演出との乖離: 文章の段落（Event）と漫画の「コマ割り」は必ずしも1対1で対応しないため、Shotlistの自動変換を過度に細分化すると、演出家の裁量を奪い形骸化する懸念があります。まずは「シーン単位（場面・登場人物・アイテム制約）」の大枠提示に留めるのが現実的と考えられます。
- 非公開設定の誤流出リスク: 作家が「まだプロット段階で絶対に公開したくない裏設定」を誤ってエクスポート対象に含めてしまう事故を防ぐため、スキーマ定義側に明示的な publishable: false フラグを設け、デフォルトでは読者用JSONから物理的にパージする二重の安全弁設計が求められます。

User prompt: Worldcraftの4大コアスキーマから映像・コミカライズ向けのShotlist（カット表）や美術指示書を生成するデータ変換パイプラインのTypeScript実装設計に進んでください。
Response: 小説のテキスト裏で保持される「4大コアスキーマ」から映像・コミカライズ向けの制作指示書（Shotlistおよび美術ボード指示）を自動合成するパイプラインは、単なる文章の要約ではなく、イベントソーシング（Event Sourcing）による世界状態の時系列リプレイと連続性（Continuity）の抽出としてモデル化することが合理的と考えられます。
文章の記述単位と映像・Webtoonの「コマ・カット」の粒度差をどう吸収するかを検証しながら、TypeScriptによる変換エンジンの設計を整理します。
### 1. 変換パイプラインの設計思想：イベント還元モデル
小説の文章は時系列が前後したり、途中の動作が省略されたりする性質を持ちます。そのため、「テキストの行」を直接「カット」へマッピングするのではなく、以下の多段パイプラインを経由する構造が適していると推測されます。
[Worldcraft コアスキーマ]  (Character, Item, Location, Event)         │         ▼[1. Event Sourcing Reducer] ── 各イベント実行時点の世界スナップショット（WorldState_t）を復元         │         ▼[2. Scene Segmenter] ────── 場所（Location）や視点（POV）の不連続境界で「シーン」を分割         │         ▼[3. Continuity & Acting Analyzer]          │  ・身体制約と装備スロットから「作画注意事項」を抽出         │  ・主観認識層（Epistemic）から「視線・表情・演技意図」を逆算         │         ▼[Output: Shotlist & Scene Spec] ── コミカライズ・アニメ制作ツール連携形式（JSON/CSV）
### 2. スキーマ定義（入力と出力のデータ構造）
入力となるコアスキーマと、出力となる制作仕様書（Production Package）のインターフェース定義です。
// ==========================================// 入力：Worldcraft 4大コアスキーマ（抜粋）// ==========================================export type BodyPartStatus = "healthy" | "injured" | "broken" | "lost";export interface CharacterSchema {  id: string;  name: string;  bodyConstraints: Record<string, BodyPartStatus>; // "right_arm", "left_eye", etc.  equipmentSlots: Record<string, string | null>;   // slot -> item_id  knownFacts: string[];}export interface ItemSchema {  id: string;  name: string;  ownerId: string | null;  heldSlot: string | null; // "right_hand", "waist", etc.  visualTraits: string[];  // "煤で汚れている", "王家の刻印"}export interface LocationSchema {  id: string;  name: string;  atmosphere: {    lighting: string;      // "薄暗い", "逆光", "真昼の直射"    weather: string;       // "乾燥", "雨", "砂埃"    keyVisualFeatures: string[];  };}export interface StateMutation {  type: "MOVE" | "EQUIP" | "INJURE" | "REVEAL_FACT";  targetId: string;  payload: Record<string, unknown>;}export interface EventSchema {  id: string;  timestamp: number;  sequenceIndex: number;  locationId: string;  povCharacterId: string;  presentCharacterIds: string[];  mutations: StateMutation[];  sourceTextSnippet: string; // 根拠となる本文抜粋}// ==========================================// 出力：制作仕様書（Shotlist & Scene Spec）// ==========================================export interface ArtBoardSpec {  sceneId: string;  locationName: string;  lightingKey: string;  weather: string;  mandatoryBackgroundElements: string[];}export interface CharacterCutDirection {  characterId: string;  characterName: string;  heldItems: Array<{ itemName: string; slot: string; visualNotes: string }>;  drawingAlerts: string[];  // 「右腕負傷のため力が入らない」「左手のみで作動」等  actingPrompt: string;    // 表情・目線の演出指示（主観認識から導出）}export interface CutSpec {  cutNumber: number;  sourceEventId: string;  sourceText: string;  povCharacter: string;  characters: CharacterCutDirection[];  continuityWarnings: string[]; // 前カットとの矛盾アラート}export interface ProductionPackage {  artBoard: ArtBoardSpec;  shots: CutSpec[];}
### 3. 変換エンジンの実装（TypeScript）
状態を過去から順次リプレイしながら、前カットとの差分検知（左右の持ち替えミスや負傷部位の矛盾など）を自動抽出するコアロジックです。
export class ShotlistGenerator {  /**   * シーン単位でイベント列を処理し、Shotlistと美術指示を生成   */  public generate(    events: EventSchema[],    locations: Map<string, LocationSchema>,    baseCharacters: Map<string, CharacterSchema>,    baseItems: Map<string, ItemSchema>  ): ProductionPackage {    if (events.length === 0) {      throw new Error("イベント列が空のため生成できません");    }    // 1. シーン情報の抽出（先頭イベントのロケーションに依存）    const initialLocation = locations.get(events[0].locationId);    const artBoard: ArtBoardSpec = {      sceneId: `scene_${events[0].locationId}_${events[0].sequenceIndex}`,      locationName: initialLocation?.name ?? "不明な場所",      lightingKey: initialLocation?.atmosphere.lighting ?? "通常光",      weather: initialLocation?.atmosphere.weather ?? "晴れ",      mandatoryBackgroundElements: initialLocation?.atmosphere.keyVisualFeatures ?? []    };    // 2. 状態のディープコピー（リプレイ用）    const charStates = new Map<string, CharacterSchema>(      Array.from(baseCharacters.entries()).map(([k, v]) => [k, structuredClone(v)])    );    const itemStates = new Map<string, ItemSchema>(      Array.from(baseItems.entries()).map(([k, v]) => [k, structuredClone(v)])    );    const shots: CutSpec[] = [];    let previousCut: CutSpec | null = null;    // 3. イベントを順番に走査してカット指示を合成    for (let i = 0; i < events.length; i++) {      const event = events[i];      // 状態変更（Mutations）を適用      this.applyMutations(event.mutations, charStates, itemStates);      // 各カットの演出・作画指示を構築      const currentCut = this.buildCutSpec(        i + 1,        event,        charStates,        itemStates,        previousCut      );      shots.push(currentCut);      previousCut = currentCut;    }    return { artBoard, shots };  }  private applyMutations(    mutations: StateMutation[],    chars: Map<string, CharacterSchema>,    items: Map<string, ItemSchema>  ): void {    for (const m of mutations) {      if (m.type === "INJURE") {        const char = chars.get(m.targetId);        if (char && typeof m.payload.part === "string") {          char.bodyConstraints[m.payload.part] = m.payload.status as BodyPartStatus;        }      } else if (m.type === "EQUIP") {        const item = items.get(m.targetId);        if (item) {          item.ownerId = (m.payload.ownerId as string) ?? null;          item.heldSlot = (m.payload.slot as string) ?? null;        }      }    }  }  private buildCutSpec(    cutNumber: number,    event: EventSchema,    chars: Map<string, CharacterSchema>,    items: Map<string, ItemSchema>,    prevCut: CutSpec | null  ): CutSpec {    const povChar = chars.get(event.povCharacterId);    const charactersInCut: CharacterCutDirection[] = [];    const continuityWarnings: string[] = [];    for (const charId of event.presentCharacterIds) {      const char = chars.get(charId);      if (!char) continue;      // 身体制約から作画アラートを抽出      const drawingAlerts: string[] = [];      for (const [part, status] of Object.entries(char.bodyConstraints)) {        if (status !== "healthy") {          drawingAlerts.push(`【作画注意】${part}が「${status}」状態（可動制限・包帯等の描写が必要）`);        }      }      // 所持アイテムの抽出      const heldItems: CharacterCutDirection["heldItems"] = [];      items.forEach((item) => {        if (item.ownerId === char.id && item.heldSlot) {          heldItems.push({            itemName: item.name,            slot: item.heldSlot,            visualNotes: item.visualTraits.join("、")          });        }      });      // 主観認識層から演技指示（Acting Prompt）を生成      const actingPrompt = this.deriveActingPrompt(char, event, povChar);      // 前カットとの連続性チェック（アイテムの消失・手の反転など）      if (prevCut) {        const prevCharDir = prevCut.characters.find((c) => c.characterId === char.id);        if (prevCharDir) {          this.checkContinuity(prevCharDir, heldItems, char.name, continuityWarnings);        }      }      charactersInCut.push({        characterId: char.id,        characterName: char.name,        heldItems,        drawingAlerts,        actingPrompt      });    }    return {      cutNumber,      sourceEventId: event.id,      sourceText: event.sourceTextSnippet,      povCharacter: povChar?.name ?? "客観",      characters: charactersInCut,      continuityWarnings    };  }  private deriveActingPrompt(    char: CharacterSchema,    event: EventSchema,    povChar: CharacterSchema | undefined  ): string {    // 視点人物との認識差分から演技意図を算出    if (char.id !== event.povCharacterId && povChar) {      return `視点（${povChar.name}）から観察される構図。内面描写ではなく外見の表情・仕草を重視。`;    }    return "主観視点。周囲の状況や違和感に対する内的な反応・警戒を表情に反映。";  }  private checkContinuity(    prev: CharacterCutDirection,    currentHeld: CharacterCutDirection["heldItems"],    charName: string,    warnings: string[]  ): void {    // アイテム持ち手反転のチェック    for (const curItem of currentHeld) {      const prevItem = prev.heldItems.find((i) => i.itemName === curItem.itemName);      if (prevItem && prevItem.slot !== curItem.slot) {        warnings.push(          `【連続性警告】${charName}の所持品「${curItem.itemName}」が前カット（${prevItem.slot}）から（${curItem.slot}）へ持ち替え描写なしで移動しています`        );      }    }  }}
### 4. 制作現場における技術的裏付けとビジネス価値（ROI）
この変換パイプラインをWebtoonスタジオやアニメ制作ラインへ組み込む際の運用価値と技術的成立性を整理します。
#### 制作プロセスにおける比較とROI

| 評価軸 | 従来の手作業（設定資料＋ネーム作成） | Worldcraft Shotlist 自動変換 | 導入効果（ROI） |
| --- | --- | --- | --- |
| 小道具・装飾の整合性チェック | 編集者・演出家が全コマ目視で確認。左右反転や描き忘れが見逃されやすい。 | heldSlot の変更履歴から「持ち替えの有無」を自動判定し警告を出力。 | 作画リテイク工数を約20〜30%削減可能と見込まれる。 |
| キャラクター負傷・状態変化の維持 | 脚本の数話前の記述を作画側が見落とし、「包帯が消える」「怪我した手で殴る」等のミスが発生。 | bodyConstraints が常時カット表にバインドされ、作画アラートとして強制出力。 | 設定破綻による原稿差し戻し・単行本修正コストの抑制に寄与。 |
| 演出意図の伝達速度 | 「なぜこのキャラがこういう顔をしているか」をシナリオ会議で口頭説明。 | 「主観認識層（誰が秘密を知っているか）」から演技指示が言語化され自動付与。 | ネーム・絵コンテ作成時のディレクション往復回数を短縮。 |

#### 技術的な課題と調整余地
- テキスト描写の省略（Ellipsis）耐性: 小説では「剣を鞘に納めた」という明示的な動作が書かれないまま次のシーンへ進むケースが多いため、単に厳格なルールを当てはめると誤検出の警告（False Alarm）が多発する懸念があります。警告の確度（Confidence）にスコアを持たせる運用が現実的と考えられます。
- Webtoon特有の縦長コマ割りへの適応: 横型映像の「1カット＝1画面」に対し、縦スクロール漫画は複数キャラクターのリアクションが連続スクロールの中に同居します。カット境界の判定を「話数」「段落境界」だけでなく、スクロールの視線誘導単位に調整するインターフェースの拡張が検討対象になり得ます。

User prompt: Webtoon制作スタジオやネーム作家が利用する作画ツール（CLIP STUDIO PAINT、Figma、Notion等）と連携するためのShotlistデータ出力フォーマットおよび連携仕様を具体化してください。
Response: Webtoon制作スタジオやネーム作家のワークフローにおいて、エディタ裏の因果律データを各制作ツールへ接続する際は、ツールごとの役割（作画実務、ネーム構成・レイアウト、進行・設定管理）に応じたデータ形式の変換アダプターが必要になると考えられます。
各作画・管理ツールの特性を整理した上で、共通中間フォーマット（Worldcraft Interchange Format）と各ツール向けのエクスポート仕様を検証します。
### 1. 連携対象ツールの特性とデータ受容性の比較
Webtoonの分業体制（ネーム → 線画 → 着彩 → 仕上げ）において、ツールごとに求められるデータの粒度やフォーマットが大きく異なります。

| 連携対象ツール | 制作パイプライン上の主用途 | 推奨連携方式・データ形式 | 期待される導入効果 | 技術的制約と留意点 |
| --- | --- | --- | --- | --- |
| CLIP STUDIO PAINT（クリスタ） | 作画実務、フキダシ配置、縦スクロール原稿の最終出力 | ストーリーエディター用テキスト（TSV / TXT） | セリフやト書きの手動コピペ工数を削減し、誤字や台詞抜けを防止。 | 外部APIが存在しないため、ファイルインポート（テキスト読み込み機能）またはPSDレイヤー構造の生成に依存。 |
| Figma | ネーム・演出構成、縦スクロールのコマ配置、チームレビュー | 専用Figma Plugin経由のREST/JSON連携 | 縦型キャンバス上にコマ枠、セリフ枠、作画注意バッジを自動展開。 | プラグインの実行環境（ブラウザ/デスクトップ）に依存し、大規模話数での描画負荷管理が必要。 |
| Notion | キャラクターカルテ・プロップ管理、制作進行、リテイク管理 | Notion REST API（Database Blocks） / CSV | 原作の設定変更（負傷・所持品）が制作管理ボードへ即時同期。 | APIレートリミット（3リクエスト/秒）の考慮と、ブロック階層の構造化が必要。 |

### 2. 共通中間データフォーマット（Worldcraft Interchange Format: WIF）
各ツールへ変換する前段階として、クライアント側（ブラウザ内）で生成する正規化JSONの設計案です。前工程で抽出した「美術ボード」「カット（コマ）」「作画注意事項」「主観演技意図」をフラットに保持します。
export interface WIFExportPayload {  version: "1.0.0";  meta: {    title: string;    episodeNumber: number;    sceneCount: number;    totalCuts: number;    exportedAt: string;  };  scenes: WIFScene[];}export interface WIFScene {  sceneIndex: number;  location: {    name: string;    lighting: string;    weather: string;    mandatoryElements: string[];  };  cuts: WIFCut[];}export interface WIFCut {  cutNumber: number;  sourceText: string;  dialogues: Array<{    speakerId: string;    speakerName: string;    text: string;    actingPrompt: string; // 主観認識に基づく表情・演技指示  }>;  drawingAlerts: string[]; // 身体制約・負傷状態の作画注意  heldProps: Array<{    characterName: string;    propName: string;    slot: string; // "right_hand" 等    visualNotes: string;  }>;  continuityWarnings: string[]; // 前コマとの連続性乖離警告}
### 3. 各ツール向け出力アダプターの実装仕様
#### (1) CLIP STUDIO PAINT連携：ストーリーエディター対応TSV/テキスト
クリスタの「ストーリーエディター」機能は、空行で区切られたテキストを順次フキダシ・テキストレイヤーとして読み込む仕様を持っています。作画者が迷わないよう、ト書き部分に作画注意事項をコメントとして挿入する形式が適していると考えられます。
- フォーマット仕様: UTF-16LE または UTF-8 テキスト（Tab区切りまたは改行区切り）
- 生成サンプル:
// ==========================================// [Scene 1] 封印の祭壇 (薄暗い / 乾燥)// ==========================================[コマ 1]// 【作画注意】リゼ：右腕が「broken」状態（可動制限・包帯等の描写が必要）// 【小道具】カイン：宵闇の指輪 (right_hand / 煤で汚れている、王家の刻印)リゼ「ここまで来れば、追手も諦めるかしら」[コマ 2]// 【連続性警告】カインの所持品「宵闇の指輪」の持ち替え描写に注意カイン「息を整えたら出発するぞ。入口まではまだ距離がある」
#### (2) Figma連携：Webtoonネーム自動生成プラグイン用JSON
FigmaのCanvas上に、Webtoon標準（幅800px、高さ数万pxの縦長フレーム）を自動生成し、コマごとのカードと作画警告バッジを配置するためのペイロードです。
{  "canvasWidth": 800,  "defaultCutSpacing": 120,  "cuts": [    {      "cutNumber": 1,      "estimatedHeight": 600,      "dialogues": [        {          "speaker": "リゼ",          "text": "ここまで来れば、追手も諦めるかしら",          "intent": "視点（カイン）から観察される構図。息を整えつつ弱音を隠す表情。"        }      ],      "badges": [        { "type": "ALERT", "label": "右腕負傷中（作画注意）", "color": "#D97706" },        { "type": "PROP", "label": "右手：宵闇の指輪", "color": "#2563EB" }      ],      "bgDirection": "薄暗い瓦礫の祭壇。頭上からのわずかな光。"    }  ]}
- Figma Plugin側の処理: figma.createFrame() で縦型アートボードを生成し、各カットを AutoLayout（縦並び）で流し込むことで、ネーム作家は配置されたテキストの周囲にラフスケッチを描き込むだけで初期構成を完了できます。
#### (3) Notion連携：データベースブロック同期
制作スタジオの進行管理用として、Notion APIの databases.create / pages.create に適合するスキーマです。各コマを作業単位（チケット）として扱い、作画リテイクのチェックボックスを持たせます。
- Notionデータベースのプロパティ定義:
  - コマ番号: Number
  - 登場キャラクター: Multi-select
  - セリフ: Rich Text
  - 作画注意事項: Rich Text（赤文字ハイライト）
  - プロップ連続性: Select（整合 / 要確認）
  - 作画ステータス: Status（未着手 / ネーム中 / 線画中 / 完了）
### 4. 技術的裏付けとビジネス価値（ROI）の検証
#### 技術的成立性
- ゼロサーバー処理（純クライアント変換）: WIFから各フォーマット（TSV, Figma JSON, Notion JSON/CSV）への変換処理は単純なマッピングと文字列シリアライズに過ぎないため、Web Workersまたはエディタ本体内で数ミリ秒で完了します。サーバーインフラの維持費（$0）に影響を与えません。
- スキーマ変更に対する疎結合性: 将来的にコアスキーマ（身体部位や主観認識）の内部構造が変化した場合でも、中間フォーマット（WIF）の互換層を維持することで、各ツール向けエクスポーターの改修を局所化できるアーキテクチャが担保されます。
#### 制作スタジオ視点でのROI（投資対効果）

| 業務フェーズ | 従来の手作業ワークフロー | Worldcraft連携導入後 | 想定される改善効果（ROI） |
| --- | --- | --- | --- |
| ネーム初期配置 | 原作テキストを1行ずつコピーし、作画ツールへ貼り付けてコマ割り。 | Figma / クリスタへ1クリックでテキスト・指示が枠付きで一括流し込み。 | 初期ネーム配置工数を約40〜50%短縮可能と推測。 |
| 設定照合・リテイク | 設定資料集（PDFやWiki）を横目に、左右の手や傷の有無を目視点検。 | コマ情報に「負傷バッジ」「小道具スロット」が最初から印字。 | 設定不整合による作画リテイク率を20〜30%削減する余地。 |
| 分業間の情報伝達 | 演出家が作画・着彩スタッフへ「このコマの心情や光源」を口頭/チャットで伝達。 | 「主観演技意図」「背景光源指示」が各コマのメタデータとして自動随伴。 | ディレクションの伝言ゲームを排除し、作画意図のズレを未然に防止。 |

### 運用上の留意点と検証課題
- コマの高さ（スクロール感）の自動予測: テキスト量からコマの高さを一律計算（例: セリフ1文字あたり〇px）すると、タメのコマ（セリフのない無音の大ゴマなど）の演出意図を汲み取れず、不自然な余白が生じる懸念があります。初期配置はあくまでベースラインとし、ネーム作家側で高さを直感的に伸縮できるUI補助が求められます。
- フキダシ分割の揺らぎ: 小説の1文が長い場合、漫画表現としては2〜3個のフキダシに分割することが一般的です。Stage 2の極小SLMを活用し、台詞の文脈的区切り（息継ぎ）に応じた「自動フキダシ分割提案」をエクスポート前処理に組み込むかどうかが検討の論点になり得ます。

User prompt: WorldcraftのJSONペイロードを受け取り、Figmaキャンバス上に縦スクロールWebtoonのネーム枠とテキストを自動生成するFigma Plugin（manifest.jsonおよびcode.ts）の実装設計に進んでください。
Response: Figma Plugin APIを用いてWorldcraftの中間JSON（WIF）から縦スクロールWebtoonのネーム枠を自動生成する構成案です。
ネーム作家が直感的にラフスケッチを描き込めるよう、厳密なサイズ固定ではなくFigmaのAutoLayout（縦並び・伸縮自在）を基軸とし、フォントの非同期ロードやバッジ配置を考慮した設計を検証します。
### 1. manifest.json の定義
Figma Plugin API（マニフェスト v2）に準拠した設定です。ユーザーがJSONテキストを直接貼り付けるかファイルを選択できる最小限のUIを許可します。
{  "name": "Worldcraft to Webtoon Name",  "id": "worldcraft-webtoon-importer",  "api": "1.0.0",  "main": "code.js",  "ui": "ui.html",  "capabilities": [],  "enableProposedApi": false,  "editorType": ["figma"],  "networkAccess": {    "allowedDomains": ["none"]  }}
### 2. インポートUI（ui.html）の設計
JSON文字列をペーストしてプラグインのバックエンド（code.ts）へ送信するシンプルなインターフェースです。
<!DOCTYPE html><html><head>  <meta charset="utf-8" />  <style>    body { font-family: sans-serif; margin: 12px; font-size: 12px; }    textarea { width: 100%; height: 180px; box-sizing: border-box; font-family: monospace; font-size: 11px; }    button { margin-top: 8px; width: 100%; padding: 8px; background: #2563EB; color: #fff; border: none; border-radius: 4px; cursor: pointer; }    button:hover { background: #1D4ED8; }  </style></head><body>  <div><strong>Worldcraft JSON (WIF) を貼り付け:</strong></div>  <textarea id="jsonInput" placeholder='{"meta": {...}, "scenes": [...]}'></textarea>  <button id="btnImport">Webtoonネーム枠を生成</button>  <script>    document.getElementById("btnImport").onclick = () => {      const raw = document.getElementById("jsonInput").value;      try {        const payload = JSON.parse(raw);        parent.postMessage({ pluginMessage: { type: "IMPORT_WIF", payload } }, "*");      } catch (err) {        alert("JSONのパースに失敗しました。形式を確認してください。");      }    };  </script></body></html>
### 3. プラグインコアロジック（code.ts）の実装
Figma上のノード生成処理では、「フォントの事前非同期ロード」と「AutoLayoutによる階層構造の構築」が不可欠になります。
// Figma Plugin メインスレッド (code.ts)interface WIFCut {  cutNumber: number;  sourceText: string;  dialogues: Array<{    speakerName: string;    text: string;    actingPrompt: string;  }>;  drawingAlerts: string[];  heldProps: Array<{    characterName: string;    propName: string;    slot: string;    visualNotes: string;  }>;  continuityWarnings: string[];}interface WIFScene {  sceneIndex: number;  location: {    name: string;    lighting: string;    weather: string;  };  cuts: WIFCut[];}interface WIFExportPayload {  meta: { title: string; episodeNumber: number };  scenes: WIFScene[];}// UIの表示figma.showUI(__html__, { width: 360, height: 260 });figma.ui.onmessage = async (msg) => {  if (msg.type === "IMPORT_WIF") {    const payload: WIFExportPayload = msg.payload;    try {      // 1. 使用フォントの事前ロード（ロード漏れによる例外を回避）      await Promise.all([        figma.loadFontAsync({ family: "Inter", style: "Regular" }),        figma.loadFontAsync({ family: "Inter", style: "Bold" })      ]);      // 2. Webtoon標準の縦長キャンバス（幅800px、縦AutoLayout）を生成      const mainCanvas = figma.createFrame();      mainCanvas.name = `${payload.meta.title}_第${payload.meta.episodeNumber}話_ネーム`;      mainCanvas.resize(800, 1000);      mainCanvas.layoutMode = "VERTICAL";      mainCanvas.primaryAxisSizingMode = "AUTO"; // 中身に応じて縦に自動伸長      mainCanvas.counterAxisSizingMode = "FIXED"; // 横幅800px固定      mainCanvas.itemSpacing = 80; // コマ間の標準余白      mainCanvas.paddingLeft = 40;      mainCanvas.paddingRight = 40;      mainCanvas.paddingTop = 60;      mainCanvas.paddingBottom = 60;      mainCanvas.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.96 } }];      // 3. シーンおよびコマの反復生成      for (const scene of payload.scenes) {        for (const cut of scene.cuts) {          const cutFrame = buildCutFrame(cut, scene);          mainCanvas.appendChild(cutFrame);        }      }      // ビューポートを生成したキャンバスへズーム      figma.currentPage.appendChild(mainCanvas);      figma.viewport.scrollAndZoomIntoView([mainCanvas]);      figma.notify("Webtoonネーム枠の生成が完了しました");    } catch (err) {      figma.notify(`エラーが発生しました: ${String(err)}`, { error: true });    }  }};/** * コマ（Cut）ごとの枠組みとAutoLayoutの構築 */function buildCutFrame(cut: WIFCut, scene: WIFScene): FrameNode {  const cutFrame = figma.createFrame();  cutFrame.name = `Cut_${cut.cutNumber}`;  cutFrame.layoutMode = "VERTICAL";  cutFrame.primaryAxisSizingMode = "AUTO";  cutFrame.counterAxisSizingMode = "FIXED";  cutFrame.resize(720, 400); // 初期高さ（ネーム描画領域を確保）  cutFrame.itemSpacing = 16;  cutFrame.paddingLeft = 24;  cutFrame.paddingRight = 24;  cutFrame.paddingTop = 20;  cutFrame.paddingBottom = 24;  cutFrame.cornerRadius = 8;  cutFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];  cutFrame.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];  cutFrame.strokeWeight = 1;  // --- ヘッダー：コマ番号と環境ト書き ---  const headerText = figma.createText();  headerText.fontName = { family: "Inter", style: "Bold" };  headerText.fontSize = 14;  headerText.characters = `コマ ${cut.cutNumber}  [${scene.location.name} / ${scene.location.lighting}]`;  headerText.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];  cutFrame.appendChild(headerText);  // --- 警告・注意事項バッジ列（水平AutoLayout） ---  const badgeContainer = figma.createFrame();  badgeContainer.name = "AlertBadges";  badgeContainer.layoutMode = "HORIZONTAL";  badgeContainer.primaryAxisSizingMode = "AUTO";  badgeContainer.counterAxisSizingMode = "AUTO";  badgeContainer.itemSpacing = 8;  badgeContainer.fills = [];  // 作画注意バッジ（身体制約）  for (const alert of cut.drawingAlerts) {    badgeContainer.appendChild(      createBadge(alert, { r: 0.85, g: 0.46, b: 0.04 }, { r: 0.99, g: 0.95, b: 0.9 })    );  }  // 小道具バッジ  for (const prop of cut.heldProps) {    badgeContainer.appendChild(      createBadge(`${prop.characterName}：${prop.propName}(${prop.slot})`, { r: 0.15, g: 0.39, b: 0.92 }, { r: 0.93, g: 0.95, b: 1.0 })    );  }  // 連続性警告バッジ  for (const warn of cut.continuityWarnings) {    badgeContainer.appendChild(      createBadge(warn, { r: 0.86, g: 0.15, b: 0.15 }, { r: 1.0, g: 0.93, b: 0.93 })    );  }  if (badgeContainer.children.length > 0) {    cutFrame.appendChild(badgeContainer);  }  // --- ネーム作画用のブランクキャンバス（スケッチ領域） ---  const sketchArea = figma.createFrame();  sketchArea.name = "Rough_Sketch_Area";  sketchArea.resize(672, 280);  sketchArea.layoutMode = "NONE"; // 自由描画用  sketchArea.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];  sketchArea.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];  sketchArea.dashPattern = [4, 4];  cutFrame.appendChild(sketchArea);  // --- セリフと演出指示（フキダシ配置用テキスト） ---  for (const d of cut.dialogues) {    const dialogFrame = figma.createFrame();    dialogFrame.name = `Dialog_${d.speakerName}`;    dialogFrame.layoutMode = "VERTICAL";    dialogFrame.primaryAxisSizingMode = "AUTO";    dialogFrame.counterAxisSizingMode = "FIXED";    dialogFrame.resize(672, 60);    dialogFrame.itemSpacing = 4;    dialogFrame.paddingLeft = 12;    dialogFrame.paddingRight = 12;    dialogFrame.paddingTop = 8;    dialogFrame.paddingBottom = 8;    dialogFrame.cornerRadius = 4;    dialogFrame.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.96, b: 0.98 } }];    const speechText = figma.createText();    speechText.fontName = { family: "Inter", style: "Bold" };    speechText.fontSize = 13;    speechText.characters = `${d.speakerName}「${d.text}」`;    dialogFrame.appendChild(speechText);    if (d.actingPrompt) {      const intentText = figma.createText();      intentText.fontName = { family: "Inter", style: "Regular" };      intentText.fontSize = 11;      intentText.characters = `演出意図: ${d.actingPrompt}`;      intentText.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];      dialogFrame.appendChild(intentText);    }    cutFrame.appendChild(dialogFrame);  }  return cutFrame;}/** * 警告・小道具用のタグバッジ生成ヘルパー */function createBadge(  text: string,  textColor: RGB,  bgColor: RGB): FrameNode {  const badge = figma.createFrame();  badge.layoutMode = "HORIZONTAL";  badge.primaryAxisSizingMode = "AUTO";  badge.counterAxisSizingMode = "AUTO";  badge.paddingLeft = 8;  badge.paddingRight = 8;  badge.paddingTop = 4;  badge.paddingBottom = 4;  badge.cornerRadius = 4;  badge.fills = [{ type: "SOLID", color: bgColor }];  const label = figma.createText();  label.fontName = { family: "Inter", style: "Regular" };  label.fontSize = 10;  label.characters = text;  label.fills = [{ type: "SOLID", color: textColor }];  badge.appendChild(label);  return badge;}
### 4. 技術的裏付けと運用の検証
実装と実運用において想定される論点と対応策です。

| 検討項目 | 想定される課題 | 検証と対策 |
| --- | --- | --- |
| 長編話数での負荷 | 1話あたり60〜80コマを展開すると、ノード数が数千個に達しFigmaが一時的にフリーズする可能性。 | figma.createFrame() を小分けにし、UI側と setTimeout を挟みながらプログレスバー表示でバッチ生成する分割処理が検討対象。 |
| フォント依存 | クライアントPCに日本語フォントが存在しない場合、文字化けや生成エラーが発生するリスク。 | Figma標準でWebフォントとして確実に提供されている Inter をベースとし、日本語表示にはNoto Sans JP等のGoogle Fontsを動的に指定する構成が安全。 |
| 自由配置との親和性 | AutoLayoutで固定しすぎると、ネーム作家が「縦長の大ゴマ」や「変則的なフキダシ位置」へ崩しにくくなる懸念。 | 各コマ内に非AutoLayoutの Rough_Sketch_Area（自由描画用ブランク枠）を内包させ、スケッチ自体の自由度を阻害しない構成を採用。 |

### 5. ビジネス価値（ROI）の検証
- ネーム制作速度の向上: 脚本のテキストを手動でコピー＆ペーストし、フキダシ枠を1つずつ手動作成する初期作業（1話あたり約1〜2時間）を自動化することで、ネーム作家が「演出・構図の検討」に集中できる時間を確保しやすくなります。
- 分業体制下での設定事故防止: 制作がネーム担当から線画・着彩担当へ引き継がれる際、コマ枠直上に「右手負傷」「所持品」のバッジが残るため、別ツール上の指示書を開き直す手戻りや確認漏れを防ぎ、作画修正の発生頻度を抑える効果が期待されます。

User prompt: WorldcraftのスキーマからCLIP STUDIO PAINTのストーリーエディターへ取り込むための、フォーマット変換アダプター（TSV/テキスト生成と文字コード制御）の実装設計に進んでください。
Response: CLIP STUDIO PAINT（以下、クリスタ）のストーリーエディター（EX専用機能）へのインポートにおいて、Worldcraftの中間フォーマット（WIF）をテキスト化する際は、「エディタ側のパース規則（空行区切り）への準拠」と「OS間の文字コード互換性（BOM制御）」の2点が中核的な技術要件になると考えられます。
作画キャンバス上で不要なテキストレイヤーが散乱する事態を防ぎつつ、作画者が直感的に参照できるテキストフォーマットおよびブラウザ完結のバイナリ変換アダプターを検証します。
### 1. ストーリーエディターの受容仕様とフォーマット設計
クリスタの「テキスト読み込み」機能は、プレーンテキストの改行構造を解釈してテキストオブジェクト（フキダシ）を自動生成する仕様を持っています。
#### パース仕様とテキスト構文の対応表

| クリスタの入力解釈 | テキスト構文ルール | Worldcraftからのマッピング | 挙動と留意点 |
| --- | --- | --- | --- |
| 同一フキダシ内改行 | 単一改行（\n） | 1つのセリフ内の改行（例: 2行に渡る台詞） | キャンバス上では1つのテキストブロックとして描画される。 |
| 新規テキストブロック（別フキダシ） | 連続改行（空行: \n\n） | セリフ間、またはセリフとト書きの境界 | キャンバス上で独立した別テキストオブジェクトとして生成される。 |
| 注釈・作画指示の扱い | （専用のコメント機能は非搭載） | 【ト書き】、【作画注意】 等の接頭辞を付与 | 作画時に非表示レイヤーへ退避するか、下書きレイヤーとして扱う運用規約が必要。 |
| コマ・シーンの境界 | 空行 ＋ 区切りヘッダー | === [コマ 1] === 等の明示的ブロック | ストーリーエディター上で目視スクロール時のインデックスとして機能。 |

クリスタ側にはプログラミング言語のようなコメント構文（// 等を非表示にするパーサー機能）が存在しないため、作画指示や警告文も一度キャンバス上にテキストレイヤーとして展開されます。そのため、フォントサイズやレイヤー種別で作画者が一括選択・非表示化しやすいよう、接頭辞ルールを統一しておく構成が望ましいと考えられます。
### 2. 文字コード制御（クロスプラットフォーム文字化け対策）
ブラウザのJavaScript環境からテキストファイルをダウンロードさせる場合、デフォルトの Blob（UTF-8 BOMなし）では、Windows版クリスタで読み込んだ際にShift_JISとして誤判定され、文字化け（いわゆる「豆腐」や文字崩れ）が発生する事例が知られています。
#### 文字コード方式の比較検証

| 方式 | バイナリ構成 | OS互換性（Win / Mac / iPad） | 判定と推奨理由 |
| --- | --- | --- | --- |
| UTF-8（BOMなし） | 0xEF, 0xBB, 0xBF なし | Mac/iPadでは正常動作する一方、一部のWindows環境でSJIS誤認リスクあり。 | △ 動作不安定のリスク |
| Shift_JIS（CP932） | 2バイトShift_JISエンコード | 日本語Windows環境に最適。外字や特殊文字（絵文字・機種依存文字）でエンコード失敗の懸念。 | △ 現代作品の記号表現で制約 |
| UTF-8 with BOM | 先頭に 0xEF, 0xBB, 0xBF を付与 | 主要OS全般でUTF-8であることが明示され、クリスタの自動判定を安定させやすい。 | ◎ 推奨（標準仕様） |
| UTF-16LE with BOM | 先頭に 0xFF, 0xFE を付与 | Windows/Mac双方で確実にUTF-16として認識されるが、ファイルサイズが倍増。 | ◯ フォールバック用途 |

ブラウザ標準の TextEncoder はUTF-8のみを生成するため、先頭にBOMバイト列（[0xEF, 0xBB, 0xBF]）を明示的に合成して Blob を構築するアプローチが、外部エンコーディングライブラリへの依存を排しつつ最も軽量に実現できる構成と推測されます。
### 3. TypeScriptによる変換アダプター実装
WIF（Worldcraft Interchange Format）からクリスタ互換テキストを生成し、BOM付きUTF-8バイナリとしてエクスポートするアダプターの実装例です。
import { WIFExportPayload, WIFScene, WIFCut } from "./wif-types";export interface ClipStudioExportOptions {  includeDrawingAlerts?: boolean;     // 身体制約等の作画注意を含めるか  includeProps?: boolean;             // 小道具情報をト書きに含めるか  includeContinuityWarnings?: boolean;// 連続性警告を含めるか  includeActingPrompts?: boolean;     // 演出意図を含めるか}export class ClipStudioTextAdapter {  private options: Required<ClipStudioExportOptions>;  constructor(options?: ClipStudioExportOptions) {    this.options = {      includeDrawingAlerts: options?.includeDrawingAlerts ?? true,      includeProps: options?.includeProps ?? true,      includeContinuityWarnings: options?.includeContinuityWarnings ?? true,      includeActingPrompts: options?.includeActingPrompts ?? false, // 初期値はセリフ重視でオフ    };  }  /**   * WIFからクリスタ用テキスト文字列を合成   */  public convertToText(payload: WIFExportPayload): string {    const lines: string[] = [];    // 作品メタ情報    lines.push(`## TITLE: ${payload.meta.title} 第${payload.meta.episodeNumber}話`);    lines.push(`## GENERATED BY: Worldcraft Narrative IDE`);    lines.push(""); // 空行    for (const scene of payload.scenes) {      lines.push(this.formatSceneHeader(scene));      lines.push("");      for (const cut of scene.cuts) {        const cutText = this.formatCutBlock(cut);        if (cutText.length > 0) {          lines.push(cutText);          lines.push(""); // コマ間の空行（フキダシ分割境界）        }      }    }    return lines.join("\r\n"); // Windows標準改行コード（CRLF）に統一  }  /**   * 文字コード対策を施したダウンロード用Blobを生成（UTF-8 with BOM）   */  public generateBlob(payload: WIFExportPayload): Blob {    const text = this.convertToText(payload);        // 1. 文字列をUTF-8バイト配列に変換    const encoder = new TextEncoder();    const textBytes = encoder.encode(text);    // 2. UTF-8 BOM (0xEF, 0xBB, 0xBF) のプリフィックスを付与    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);    const merged = new Uint8Array(bom.length + textBytes.length);    merged.set(bom, 0);    merged.set(textBytes, bom.length);    return new Blob([merged], { type: "text/plain;charset=utf-8" });  }  private formatSceneHeader(scene: WIFScene): string {    return `========================================\r\n` +           `[シーン ${scene.sceneIndex}] ${scene.location.name} (${scene.location.lighting} / ${scene.location.weather})\r\n` +           `========================================`;  }  private formatCutBlock(cut: WIFCut): string {    const blocks: string[] = [];    // コマ番号    blocks.push(`--- [コマ ${cut.cutNumber}] ---`);    // 1. ト書き・作画注意事項（オプション指定に応じて付与）    const metaNotes: string[] = [];    if (this.options.includeDrawingAlerts && cut.drawingAlerts.length > 0) {      for (const alert of cut.drawingAlerts) {        metaNotes.push(`【作画注意】${alert}`);      }    }    if (this.options.includeProps && cut.heldProps.length > 0) {      for (const prop of cut.heldProps) {        metaNotes.push(`【小道具】${prop.characterName}: ${prop.propName} (${prop.slot})`);      }    }    if (this.options.includeContinuityWarnings && cut.continuityWarnings.length > 0) {      for (const warn of cut.continuityWarnings) {        metaNotes.push(`【連続性警告】${warn}`);      }    }    if (metaNotes.length > 0) {      blocks.push(metaNotes.join("\r\n"));    }    // 2. セリフ（フキダシごとに空行で区切る）    for (const d of cut.dialogues) {      let dialogueEntry = `${d.speakerName}「${d.text}」`;      if (this.options.includeActingPrompts && d.actingPrompt) {        dialogueEntry += `\r\n（演出: ${d.actingPrompt}）`;      }      blocks.push(dialogueEntry);    }    // 各要素間を2連続改行で結合（クリスタ上で別テキストオブジェクトとして認識させる）    return blocks.join("\r\n\r\n");  }}
### 4. 出力テキストの具体例
上記アダプターを用いてエクスポートされたテキストファイルの構造例です。
## TITLE: 遺跡脱出 第3話## GENERATED BY: Worldcraft Narrative IDE========================================[シーン 1] 封印の祭壇 (薄暗い / 乾燥)========================================--- [コマ 1] ---【作画注意】右腕が「broken」状態（可動制限・包帯等の描写が必要）【小道具】カイン: 宵闇の指輪 (right_hand)リゼ「ここまで来れば、追手も諦めるかしら」--- [コマ 2] ---【連続性警告】カインの所持品「宵闇の指輪」が前カットから持ち替え描写なしで移動していますカイン「息を整えたら出発するぞ。入口まではまだ距離がある」
### 5. 技術的裏付けとビジネス価値（ROI）の検証
#### 技術的安定性の評価
- メモリ効率と速度: 全工程が純粋な文字列連結とTypedArrayのメモリコピー（数KB〜数十KB）で完結するため、数万字規模の1話分テキストであっても処理時間は数ミリ秒にとどまります。サーバーサイドの演算資源を一切消費しません。
- フォールバック耐性: BOM付きUTF-8と改行コードCRLF（\r\n）の併用により、Windows、macOS、iPadOSの各環境で動作するクリスタに対して、改行の欠損や文字化けを抑止しやすい構成が担保されます。
#### 制作現場におけるROI（投資対効果）

| 業務フェーズ | 従来の手作業 | Worldcraft テキスト連携 | 改善効果（ROI）の見通し |
| --- | --- | --- | --- |
| テキスト流し込み工数 | 原作テキストからセリフを抽出し、クリスタのキャンバスへ1フキダシずつ手動配置。 | ストーリーエディターの「テキスト読み込み」で1話分（60〜80コマ）のセリフを一括展開。 | セリフ配置にかかる作業時間を約70〜80%削減可能と推測。 |
| 指示書照合の二重手間 | 別途配布された設定PDFやスプレッドシートと、原稿のフキダシを交互に見比べながら作画。 | コマ直上に作画注意（負傷部位・持ち手）がテキストとして直接インライン展開。 | ツール切り替えの認知負荷を排除し、作画進行の停滞を軽減。 |
| 誤字・脱字の混入率 | 手動コピー＆ペーストの過程で、台詞の脱落やキャラクター名の取り違えが発生。 | IDEの型システムで検証済みのテキストがバイナリ経由でダイレクトに反映。 | 校正・写植段階での文字修正リテイクを抑制。 |

### 運用上の留意点
- 作画時の不要レイヤー整理: インポートされた【作画注意】や【小道具】などのト書きブロックは、最終原稿には不要なテキストです。クリスタの一括選択機能で消去しやすいよう、ト書き行の先頭記号（【 や //）をエディタ設定でユーザーが任意に変更できるカスタマイズ性の提供が有効と考えられます。
- Webtoon特有の縦スクロール流し込み: クリスタのストーリーエディターはページ単位の漫画（見開き）を前提としたUI設計が一部残っているため、Webtoon専用キャンバス（縦長1枚絵）へ流し込む際の配置ルールについて、ネーム作家向けの推奨操作ガイドを整備しておくことが現場定着の要点になり得ます。
