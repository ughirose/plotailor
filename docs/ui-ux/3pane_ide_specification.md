WorldCraft 次期機能拡張・UI/UX最適化仕様書（Antigravity / Jules 連携用）
Target Branch: antigravity/feat-core-sync-and-territoryAuthor: Gemini Spark (Architecture & UX Lead)Date: 2026-09-15

1. 全体方針 & Dual-Agent 役割分担
本ドキュメントは、本日15:29時点でマージされたプロトタイプ（7大ディメンション、キラー機能群、ポータル）を基点として、執筆IDEとしての実用性・UXを完成させるための改修仕様書である。
Antigravity（ローカル VS Code）:
antigravity/feat-core-sync-and-territory ブランチで作業。
地図画像アスペクト比の動的計算、IndexedDB画像ストレージ移行。
領土・領域多重オーバーレイ（TerritoryLayer）の実装。
統合タイムライン再生コントローラー＆進軍/航路アニメーションの同期。
Google Jules（クラウド VM / dispatch.js 経由）:
Task 1: UI純日本語化＆i18n辞書構造の導入
Task 2: 全コンポーネントのカラーコントラスト是正 ＆ AppearanceModal 実装
Task 3: スプレッドシート型一括入力エディタ（BulkGridEditor）実装

2. Antigravity 実装タスク仕様
2.1 地図画像のアスペクト比解放 & IndexedDBストレージ移行
対象ファイル: src/components/map/MapViewer.tsx, src/components/map/MapImageUploader.tsx, src/lib/storage.ts
要件:
MapViewer.tsx: Leaflet CRS.Simple において固定された [[0,0],[1000,1000]] を撤廃。画像ロード時に naturalWidth, naturalHeight を取得し、bounds を [[0, 0], [naturalHeight, naturalWidth]] に動的設定する。
既存のピン座標・ルート座標がアスペクト比変更時にも整合するよう、正規化座標系（0.0〜1.0）または実ピクセル座標との相互変換を維持する。
storage.ts: 地図画像（数MBの大判マップ）のBase64 LocalStorage保存を廃止し、ブラウザ内 IndexedDB（LocalForageまたは生IndexedDB）へ移行。LocalStorage容量上限エラーを防止する。
2.2 領土・領域多重オーバーレイ（TerritoryLayer）
対象ファイル: src/types/manifest.ts, src/components/map/MapViewer.tsx, src/components/map/TerritoryLayer.tsx (新規)
要件:
manifest.ts に Territory 型を定義：export interface Territory {  id: string;  category: 'political' | 'religious' | 'linguistic' | 'cultural';  name: string;  faction_id?: string;  coordinates: [number, number][]; // 多角形ポリゴン頂点  visible_from_year?: number;  visible_until_year?: number;  color: string;  fill_opacity?: number;}
地図右上に「領域レイヤートグル（政治 / 宗教 / 言語 / 文化）」を設置し、Leaflet L.polygon による透過塗り分けを描画。
タイムラインの currentYear に連動して、該当年次に存在する領土・宗教圏・言語圏のみを表示・変遷させる。
2.3 統合タイムライン再生コントロールバー
対象ファイル: src/components/timeline/TimelinePlaybackBar.tsx (新規), src/components/timeline/Timeline.tsx, src/app/page.tsx
要件:
地図下部またはタイムライン上部にフローティングの再生コントロールバー（再生/停止、1x/2x/5x/10x、シークバー）を配置。
再生時に currentYear を自動インクリメントし、部隊進軍（MarchingUnitsLayer）、航路開通アニメーション（MapRoute）、領土変遷を完全同期させる。

3. Jules 投入用タスク仕様（scripts/agent/dispatch.js 連携用）
Task 1: i18n: pure Japanese UI localization and dictionary structure setup
### Task Title:
i18n: pure Japanese UI localization and dictionary structure setup

### Requirements:
1. Establish i18n dictionary system with `src/locales/ja.json` and `src/locales/en.json`.
2. Remove all parenthetical English labels from UI components:
   - "時間軸 (When)" -> "時間軸"
   - "空間軸 (Where)" -> "空間軸"
   - "関係軸 (Who)" -> "関係軸"
   - "法則 (Rules)" -> "法則"
   - "表の歴史 (Canon)" -> "表の設定"
   - "裏の真相 (Truth)" -> "裏の真相"
   - "定規 (Ruler)" -> "距離測定"
3. Wrap UI strings with translation lookup keys (`t('...')`). Ensure Japanese is the active default.

### Constraints:
- Do not break existing state or component bindings.
- Keep layout clean and preserve all icon associations.

### Output:
Create a pull request with updated components and locale files.
Task 2: ui: fix text color contrast and implement Appearance Settings modal
### Task Title:
ui: fix text color contrast and implement Appearance Settings modal

### Requirements:
1. Audit all components for low-contrast text (e.g. text-slate-400 on light backgrounds) and replace with semantic tokens (`text-foreground`, `text-muted`) ensuring WCAG AA (4.5:1+) contrast.
2. Implement `src/components/workspace/AppearanceModal.tsx` allowing users to toggle presets (Default Light, Midnight Dark, Parchment, Sci-Fi) and customize accent/background colors using CSS variables.
3. Persist appearance settings in LocalStorage.

### Constraints:
- Strict zero regressions on Leaflet popups and drawers.
- Follow Tailwind CSS variable standards.

### Output:
Create a pull request with contrast fixes and the Appearance modal.
Task 3: feat: implement Bulk Grid Editor for locations, characters, and events
### Task Title:
feat: implement Bulk Grid Editor for locations, characters, and events

### Requirements:
1. Create `src/components/workspace/BulkGridEditor.tsx` modal featuring tabular data grids for rapid keyboard entry.
2. Support tab-switching between Pins, Characters, Timeline Events, and Routes.
3. Support pasting TSV / Markdown tables directly from clipboard to parse and bulk-insert items into manifest state.

### Constraints:
- Ensure input validation aligns with `src/types/manifest.ts`.
- Maintain fast rendering using existing VirtualizedList if necessary.

### Output:
Create a pull request with the Bulk Grid Editor component and header launch trigger.

