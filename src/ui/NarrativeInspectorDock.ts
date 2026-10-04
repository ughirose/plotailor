import type {
  NarrativeAnalysisResult,
  SyntacticLinterItem,
  ZeroPronounItem,
  ZeroPronounCandidate,
} from '../core/editor/NarrativeLinterEngine.js';
import type { KinsokuViolation } from '../core/editor/KinsokuEngine.js';
import type { DagCycleReport } from '../core/causality/CausalDagEngine.js';
import type { ForeshadowingItem } from '../core/editor/ForeshadowingEngine.js';
import type { StrayLoreState, PlotailorPrhRule } from '@worldcraft/schema';

export interface NarrativeInspectorDockOptions {
  onJumpToTarget?: (from: number, to: number) => void;
  onInsertSubject?: (from: number, candidateText: string) => void;
  onReplaceText?: (from: number, to: number, replacement: string) => void;
  onRestoreStrayLore?: (entityId: string) => void;
  onPurgeStrayLore?: (entityId: string) => void;
  onAddPrhRule?: (rule: Partial<PlotailorPrhRule>) => void;
  onDeletePrhRule?: (ruleId: string) => void;
}

export type InspectionTier = 'all' | 'tier1' | 'tier2' | 'tier3';

export class NarrativeInspectorDock {
  private currentResult: NarrativeAnalysisResult = {
    syntacticItems: [],
    zeroPronounItems: [],
    syntacticScore: 100,
    totalWarnings: 0,
  };

  private kinsokuViolations: KinsokuViolation[] = [];
  private prhRules: PlotailorPrhRule[] = [];
  private activeFilter: 'all' | 'syntactic' | 'zero-pronoun' | 'kinsoku' | 'pov' | 'events' = 'all';
  private activeTier: InspectionTier = 'all';

  // Tier 3: Continuity Guard States
  private dagCycleReport: DagCycleReport | null = null;
  private unresolvedForeshadowings: ForeshadowingItem[] = [];
  private strayLoreItems: StrayLoreState[] = [];

  private onJumpToTarget?: (from: number, to: number) => void;
  private onInsertSubject?: (from: number, candidateText: string) => void;
  private onReplaceText?: (from: number, to: number, replacement: string) => void;
  private onRestoreStrayLore?: (entityId: string) => void;
  private onPurgeStrayLore?: (entityId: string) => void;
  private onAddPrhRule?: (rule: Partial<PlotailorPrhRule>) => void;
  private onDeletePrhRule?: (ruleId: string) => void;

  constructor(options: NarrativeInspectorDockOptions = {}) {
    this.onJumpToTarget = options.onJumpToTarget;
    this.onInsertSubject = options.onInsertSubject;
    this.onReplaceText = options.onReplaceText;
    this.onRestoreStrayLore = options.onRestoreStrayLore;
    this.onPurgeStrayLore = options.onPurgeStrayLore;
    this.onAddPrhRule = options.onAddPrhRule;
    this.onDeletePrhRule = options.onDeletePrhRule;
  }

  public updatePrhRules(rules: PlotailorPrhRule[]): void {
    this.prhRules = rules;
  }

  public updateResult(result: NarrativeAnalysisResult): void {
    this.currentResult = result;
  }

  public updateKinsokuViolations(violations: KinsokuViolation[]): void {
    this.kinsokuViolations = violations;
  }

  public updateContinuityState(data: {
    dagCycleReport?: DagCycleReport | null;
    unresolvedForeshadowings?: ForeshadowingItem[];
    strayLoreItems?: StrayLoreState[];
  }): void {
    if (data.dagCycleReport !== undefined) this.dagCycleReport = data.dagCycleReport;
    if (data.unresolvedForeshadowings !== undefined) this.unresolvedForeshadowings = data.unresolvedForeshadowings;
    if (data.strayLoreItems !== undefined) this.strayLoreItems = data.strayLoreItems;
  }

  public getKinsokuViolations(): KinsokuViolation[] {
    return this.kinsokuViolations;
  }

  public getContinuityState(): {
    dagCycleReport: DagCycleReport | null;
    unresolvedForeshadowings: ForeshadowingItem[];
    strayLoreItems: StrayLoreState[];
  } {
    return {
      dagCycleReport: this.dagCycleReport,
      unresolvedForeshadowings: this.unresolvedForeshadowings,
      strayLoreItems: this.strayLoreItems,
    };
  }

  public getResult(): NarrativeAnalysisResult {
    return this.currentResult;
  }

  public setFilter(filter: 'all' | 'syntactic' | 'zero-pronoun' | 'kinsoku' | 'pov' | 'events'): void {
    this.activeFilter = filter;
  }

  public setTier(tier: InspectionTier): void {
    this.activeTier = tier;
  }

  public getTier(): InspectionTier {
    return this.activeTier;
  }


  /**
   * Renders the complete inline dock HTML for the 3-pane right inspector.
   */
  public renderHTML(): string {
    const res = this.currentResult;
    const score = res.syntacticScore;
    const scoreColor =
      score >= 85 ? 'var(--color-success, #3fb950)' : score >= 65 ? 'var(--color-gold, #cfa85c)' : 'var(--color-danger, #f85149)';

    const showSyntactic = this.activeFilter === 'all' || this.activeFilter === 'syntactic';
    const showZP = this.activeFilter === 'all' || this.activeFilter === 'zero-pronoun';
    const showKinsoku = this.activeFilter === 'all' || this.activeFilter === 'kinsoku';
    const showPOV = this.activeFilter === 'all' || this.activeFilter === 'pov';
    const showEvents = this.activeFilter === 'all' || this.activeFilter === 'events';

    const povCount = res.povItems?.length || 0;
    const eventCount = (res.eventActionItems?.length || 0) + (res.connectiveItems?.length || 0) + (res.entitySpanItems?.length || 0);

    const tier1Count = res.syntacticItems.length + this.kinsokuViolations.length;
    const tier2Count = povCount + res.zeroPronounItems.length + eventCount;
    const tier3Count = (this.dagCycleReport?.cycles?.length || 0) + this.unresolvedForeshadowings.length + this.strayLoreItems.length;

    const showTier1 = this.activeTier === 'all' || this.activeTier === 'tier1';
    const showTier2 = this.activeTier === 'all' || this.activeTier === 'tier2';
    const showTier3 = this.activeTier === 'all' || this.activeTier === 'tier3';

    let html = `
      <div class="narrative-inspector-dock" data-testid="narrative-inspector-dock">
        <!-- Top Score & Health Metric -->
        <div class="dock-card dock-score-card">
          <div class="dock-card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="dock-card-title" style="display: inline-flex; align-items: center; gap: 6px;">
              <span>🖋️ リアルタイム推敲・構文スコア (3層校正)</span>
              <span class="model-badge" style="font-size: 10px; background: rgba(56, 139, 253, 0.15); color: var(--color-primary, #58a6ff); padding: 1px 6px; border-radius: 10px; border: 1px solid rgba(56, 139, 253, 0.3); font-weight: 600;">Ultra v15 (1M QAT)</span>
            </span>

            <span class="score-badge" style="color: ${scoreColor}; font-weight: 700; font-size: 15px; white-space: nowrap; display: inline-flex; align-items: baseline; gap: 3px;">
              <span>${score}</span>
              <span style="font-size: 11px; font-weight: 500; opacity: 0.85;">/ 100点</span>
            </span>
          </div>
          <div class="dock-card-body">
            <div class="linter-metric-row">
              <span>構文警告: <strong>${res.syntacticItems.length} 件</strong></span>
              <span>主語抜け: <strong>${res.zeroPronounItems.length} 件</strong></span>
              ${povCount > 0 ? `<span>POV注意: <strong>${povCount} 件</strong></span>` : ''}
              ${this.kinsokuViolations.length > 0 ? `<span>禁則違反: <strong>${this.kinsokuViolations.length} 件</strong></span>` : ''}
            </div>
            <div class="linter-metric-row" style="margin-top: 4px; font-size: 11px;">
              <span>Tier 1 (決定論): <strong>${tier1Count} 件</strong></span>
              <span>Tier 2 (論理): <strong>${tier2Count} 件</strong></span>
              <span>Tier 3 (連続性): <strong>${tier3Count} 件</strong></span>
            </div>
            ${eventCount > 0 ? `
            <div class="linter-metric-row" style="margin-top: 4px; font-size: 11px; opacity: 0.9;">
              <span>事象アクション: <strong>${res.eventActionItems?.length || 0} 件</strong></span>
              <span>固有名詞: <strong>${res.entitySpanItems?.length || 0} 件</strong></span>
              <span>談話接続: <strong>${res.connectiveItems?.length || 0} 件</strong></span>
            </div>
            ` : ''}
            <div class="score-criteria-hint" style="font-size: 11px; color: var(--color-text-dim); margin-top: 6px; padding: 4px 8px; background: rgba(0, 0, 0, 0.04); border-radius: 4px; line-height: 1.4;">
              💡 <strong>採点基準:</strong> 基礎点100点からの減点方式（構文・文体指摘: −8点/件、主語抜け: −5点/件、認識POV: −3点/件）<br>
              📐 <strong>3層アーキテクチャ:</strong> Tier 1(構文・組版・誤打鍵) / Tier 2(POV・主語・事象DAG) / Tier 3(因果・伏線・迷子設定)
            </div>
          </div>
        </div>


        <!-- 3-Tier Tab Bar -->
        <div class="dock-tier-tabs" style="display: flex; gap: 4px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(0, 0, 0, 0.08);">
          <button class="tier-tab-btn ${this.activeTier === 'all' ? 'active' : ''}" data-action="tier" data-tier="all">
            全階層 (${tier1Count + tier2Count + tier3Count})
          </button>
          <button class="tier-tab-btn ${this.activeTier === 'tier1' ? 'active' : ''}" data-action="tier" data-tier="tier1">
            Tier 1: 決定論 (${tier1Count})
          </button>
          <button class="tier-tab-btn ${this.activeTier === 'tier2' ? 'active' : ''}" data-action="tier" data-tier="tier2">
            Tier 2: 論理 (${tier2Count})
          </button>
          <button class="tier-tab-btn ${this.activeTier === 'tier3' ? 'active' : ''}" data-action="tier" data-tier="tier3">
            Tier 3: 連続性 (${tier3Count})
          </button>
        </div>

        <!-- Filter Sub-tabs (Inline within Dock) -->
        <div class="dock-filter-bar">
          <button class="filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">
            すべて (${res.totalWarnings + this.kinsokuViolations.length + eventCount})
          </button>
          <button class="filter-btn ${this.activeFilter === 'syntactic' ? 'active' : ''}" data-action="filter" data-filter="syntactic">
            構文 (${res.syntacticItems.length})
          </button>
          <button class="filter-btn ${this.activeFilter === 'zero-pronoun' ? 'active' : ''}" data-action="filter" data-filter="zero-pronoun">
            主語 (${res.zeroPronounItems.length})
          </button>
          ${povCount > 0 ? `
          <button class="filter-btn ${this.activeFilter === 'pov' ? 'active' : ''}" data-action="filter" data-filter="pov">
            POV (${povCount})
          </button>
          ` : ''}
          ${eventCount > 0 ? `
          <button class="filter-btn ${this.activeFilter === 'events' ? 'active' : ''}" data-action="filter" data-filter="events">
            事象 (${eventCount})
          </button>
          ` : ''}
          ${this.kinsokuViolations.length > 0 ? `
          <button class="filter-btn ${this.activeFilter === 'kinsoku' ? 'active' : ''}" data-action="filter" data-filter="kinsoku">
            禁則 (${this.kinsokuViolations.length})
          </button>
          ` : ''}
        </div>
    `;

    if (res.totalWarnings === 0 && this.kinsokuViolations.length === 0 && tier3Count === 0) {
      html += `
        <div class="dock-empty-state">
          <div style="font-size: 24px; margin-bottom: 8px;">✨</div>
          <p><strong>文章構成は極めて清澄です</strong></p>
          <p style="font-size: 11px; color: var(--color-text-dim); margin-top: 4px;">
            Tier 1〜3（構文・組版・論理・因果整合性）の不備は見つかりませんでした。
          </p>
        </div>
      `;
    } else {
      // 1. Syntactic Linter Warnings Section (Tier 1)
      if (showTier1 && showSyntactic && res.syntacticItems.length > 0) {
        html += `
          <div class="dock-section-title">
            <span>⚠️ Tier 1: 構文・組版・タイポ指摘（Lint Roller）</span>
            <span class="section-count">${res.syntacticItems.length}</span>
          </div>
        `;

        for (const item of res.syntacticItems) {
          const ruleLabel = this.getRuleLabel(item.ruleType);
          const ruleBadgeClass = this.getRuleBadgeClass(item.ruleType);
          const sameLineCount = res.syntacticItems.filter((o) => o.line === item.line).length +
            res.zeroPronounItems.filter((o) => o.line === item.line).length;

          html += `
            <div class="linter-issue-card cursor-pointer" data-action="jump" data-from="${item.from}" data-to="${item.to}" title="クリックしてエディタの該当箇所へジャンプ">
              <div class="issue-header">
                <div style="display: flex; gap: 4px; align-items: center;">
                  <span class="issue-tag ${ruleBadgeClass}">${ruleLabel}</span>
                  ${sameLineCount > 1 ? `<span class="issue-tag" style="background: rgba(248, 81, 73, 0.15); color: var(--color-danger); border: 1px solid rgba(248, 81, 73, 0.3);">⚠️ 同行${sameLineCount}件</span>` : ''}
                </div>
                <span class="issue-pos">行 ${item.line}, 列 ${item.col}</span>
              </div>
              <div class="issue-message">${this.escapeHtml(item.message)}</div>
              ${item.snippet ? `
                <div class="issue-snippet" style="background: rgba(0, 0, 0, 0.05); border-left: 2px solid var(--color-gold); padding: 5px 8px; margin: 6px 0; border-radius: 3px; font-size: 12px; line-height: 1.5; color: var(--color-text-main); font-family: var(--font-novel, 'Shippori Mincho', serif);">
                  <span style="font-size: 10px; color: var(--color-text-dim); display: block; margin-bottom: 2px;">該当箇所の文脈:</span>
                  「${this.escapeHtml(item.snippet)}」
                </div>
              ` : ''}
              ${item.previewText ? `
                <div class="issue-preview" style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                  <span>対象語句: <code>${this.escapeHtml(item.previewText)}</code>${item.replacementText ? ` ➜ 推奨: <strong style="color: var(--color-success);">${this.escapeHtml(item.replacementText)}</strong>` : ''}</span>
                  ${item.replacementText ? `
                    <button
                      class="btn-quick-replace-linter"
                      data-action="quick-replace"
                      data-from="${item.from}"
                      data-to="${item.to}"
                      data-replacement="${this.escapeHtml(item.replacementText)}"
                      style="padding: 2px 8px; font-size: 11px; background: var(--color-gold); color: #000; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;"
                      title="この語句を推奨表記に置換"
                    >
                      置換
                    </button>
                  ` : ''}
                </div>
              ` : ''}
              <div class="issue-jump-hint">➜ エディタへジャンプ</div>
            </div>
          `;
        }

        if (this.prhRules.length > 0) {
          html += `
            <div style="margin-top: 10px; padding: 6px 8px; background: rgba(0, 0, 0, 0.03); border-radius: 4px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--color-text-dim); margin-bottom: 4px;">登録済み用字用語(PRH)ルール (${this.prhRules.length}件):</div>
          `;
          for (const rule of this.prhRules) {
            html += `
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 2px 0;">
                <span>「${this.escapeHtml(rule.patterns.join('/'))}」➜ <strong>「${this.escapeHtml(rule.expected)}」</strong> [${rule.scope}]</span>
                <button class="btn-delete-prh" data-action="delete-prh" data-id="${rule.id}" style="padding: 1px 4px; font-size: 10px; background: none; border: 1px solid rgba(248, 81, 73, 0.3); color: var(--color-danger, #f85149); border-radius: 2px; cursor: pointer;">削除</button>
              </div>
            `;
          }
          html += `</div>`;
        }
      }

      // 2. Kinsoku Shori Section (Tier 1)
      if (showTier1 && showKinsoku && this.kinsokuViolations.length > 0) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>📐 Tier 1: 組版・禁則違反（Kinsoku Violations）</span>
            <span class="section-count">${this.kinsokuViolations.length}</span>
          </div>
        `;

        for (const viol of this.kinsokuViolations) {
          const violTypeLabel = viol.type === 'line-head' ? '行頭禁則' : '行末禁則';
          const badgeClass = viol.type === 'line-head' ? 'tag-danger' : 'tag-warning';
          const actionText = viol.suggestedAction === 'push-down' ? '追い出し' : viol.suggestedAction === 'hang' ? 'ぶら下げ' : '追い込み';

          html += `
            <div class="linter-issue-card cursor-pointer" data-action="jump" data-from="${viol.offset}" data-to="${viol.offset + 1}" title="クリックしてエディタの該当箇所へジャンプ">
              <div class="issue-header">
                <div style="display: flex; gap: 4px; align-items: center;">
                  <span class="issue-tag ${badgeClass}">${violTypeLabel}</span>
                  <span class="issue-tag" style="background: rgba(207,168,92,0.15); color: var(--color-gold); border: 1px solid rgba(207,168,92,0.3);">推奨: ${actionText}</span>
                </div>
                <span class="issue-pos">行 ${viol.lineIndex + 1}, 列 ${viol.colIndex + 1}</span>
              </div>
              <div class="issue-message">禁則文字: <strong>「${this.escapeHtml(viol.char)}」</strong>（${viol.type === 'line-head' ? '行頭に配置できない文字です' : '行末に配置できない文字です'}）</div>
              <div class="issue-jump-hint">➜ エディタへジャンプ（${viol.offset}文字目）</div>
            </div>
          `;
        }
      }

      // 3. Zero Pronoun Resolution Section (Tier 2)
      if (showTier2 && showZP && res.zeroPronounItems.length > 0) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>👤 Tier 2: 主語抜け・ゼロ代名詞（Zero Pronoun）</span>
            <span class="section-count">${res.zeroPronounItems.length}</span>
          </div>
        `;

        for (const item of res.zeroPronounItems) {
          const sameLineCount = res.syntacticItems.filter((o) => o.line === item.line).length +
            res.zeroPronounItems.filter((o) => o.line === item.line).length;

          html += `
            <div class="linter-issue-card zp-card" data-action="jump" data-from="${item.from}" data-to="${item.to}">
              <div class="issue-header">
                <div style="display: flex; gap: 4px; align-items: center;">
                  <span class="issue-tag zp-tag">主語抜け（ガ格）</span>
                  ${sameLineCount > 1 ? `<span class="issue-tag" style="background: rgba(248, 81, 73, 0.15); color: var(--color-danger); border: 1px solid rgba(248, 81, 73, 0.3);">⚠️ 同行${sameLineCount}件</span>` : ''}
                </div>
                <span class="issue-pos">行 ${item.line}, 列 ${item.col}</span>
              </div>
              <div class="issue-message">述語: <strong>「${this.escapeHtml(item.predicateText)}」</strong></div>
              ${item.snippet ? `
                <div class="issue-snippet" style="background: rgba(0, 0, 0, 0.05); border-left: 2px solid #58a6ff; padding: 5px 8px; margin: 6px 0; border-radius: 3px; font-size: 12px; line-height: 1.5; color: var(--color-text-main); font-family: var(--font-novel, 'Shippori Mincho', serif);">
                  <span style="font-size: 10px; color: var(--color-text-dim); display: block; margin-bottom: 2px;">該当文:</span>
                  「${this.escapeHtml(item.snippet)}」
                </div>
              ` : ''}
              
              <div class="zp-candidates-box">
                <div class="zp-candidates-title">文脈からの推定主語候補:</div>
                <div class="zp-candidates-list">
          `;

          for (const cand of item.candidates) {
            html += `
              <div class="zp-candidate-item">
                <span class="cand-name">👤 ${this.escapeHtml(cand.text)}</span>
                <span class="cand-badge">${cand.likelihood}%</span>
                <button
                  class="btn-insert-cand"
                  data-action="insert-subject"
                  data-from="${item.from}"
                  data-subject="${this.escapeHtml(cand.text)}"
                  title="この主語をエディタに補完"
                >
                  補完
                </button>
              </div>
            `;
          }

          html += `
                </div>
              </div>
              <div class="issue-jump-hint cursor-pointer" data-action="jump" data-from="${item.from}" data-to="${item.to}">
                ➜ エディタの該当箇所へジャンプ
              </div>
            </div>
          `;
        }
      }

      // 4. POV (Epistemic / Internal Sensation) Section (Tier 2)
      if (showTier2 && showPOV && res.povItems && res.povItems.length > 0) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>👁️ Tier 2: 認識POV・内面描写（Epistemic POV）</span>
            <span class="section-count">${res.povItems.length}</span>
          </div>
        `;

        for (const item of res.povItems) {
          html += `
            <div class="linter-issue-card cursor-pointer" data-action="jump" data-from="${item.from}" data-to="${item.to}" title="クリックしてエディタの該当箇所へジャンプ">
              <div class="issue-header">
                <div style="display: flex; gap: 4px; align-items: center;">
                  <span class="issue-tag" style="background: rgba(188, 140, 255, 0.15); color: var(--color-purple, #bc8cff); border: 1px solid rgba(188, 140, 255, 0.3);">認識POV</span>
                  <span class="issue-tag" style="background: rgba(207, 168, 92, 0.15); color: var(--color-gold); border: 1px solid rgba(207, 168, 92, 0.3);">${(item.epistemicScore * 100).toFixed(0)}%</span>
                </div>
                <span class="issue-pos">行 ${item.line}, 列 ${item.col}</span>
              </div>
              <div class="issue-message">${this.escapeHtml(item.message)}</div>
              ${item.snippet ? `
                <div class="issue-snippet" style="background: rgba(0, 0, 0, 0.05); border-left: 2px solid var(--color-purple, #bc8cff); padding: 5px 8px; margin: 6px 0; border-radius: 3px; font-size: 12px; line-height: 1.5; color: var(--color-text-main); font-family: var(--font-novel, 'Shippori Mincho', serif);">
                  <span style="font-size: 10px; color: var(--color-text-dim); display: block; margin-bottom: 2px;">該当箇所の文脈:</span>
                  「${this.escapeHtml(item.snippet)}」
                </div>
              ` : ''}
              <div class="issue-jump-hint">➜ エディタへジャンプ</div>
            </div>
          `;
        }
      }

      // 5. Events, Actions & Discourse Connectives Section (Tier 2)
      if (showTier2 && showEvents && ((res.eventActionItems && res.eventActionItems.length > 0) || (res.connectiveItems && res.connectiveItems.length > 0) || (res.entitySpanItems && res.entitySpanItems.length > 0))) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>⚡ Tier 2: 事象アクション・談話構造（Event & Discourse DAG）</span>
            <span class="section-count">${eventCount}</span>
          </div>
        `;

        if (res.eventActionItems && res.eventActionItems.length > 0) {
          for (const item of res.eventActionItems) {
            html += `
              <div class="linter-issue-card cursor-pointer" data-action="jump" data-from="${item.from}" data-to="${item.to}" title="クリックしてエディタの該当箇所へジャンプ">
                <div class="issue-header">
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <span class="issue-tag" style="background: rgba(56, 139, 253, 0.15); color: #58a6ff; border: 1px solid rgba(56, 139, 253, 0.3);">Action: ${item.actionType}</span>
                  </div>
                  <span class="issue-pos">オフセット ${item.from}</span>
                </div>
                <div class="issue-message">動詞・述語事象: <strong>「${this.escapeHtml(item.text)}」</strong></div>
                <div class="issue-jump-hint">➜ エディタへジャンプ</div>
              </div>
            `;
          }
        }

        if (res.connectiveItems && res.connectiveItems.length > 0) {
          for (const item of res.connectiveItems) {
            html += `
              <div class="linter-issue-card cursor-pointer" data-action="jump" data-from="${item.from}" data-to="${item.to}" title="クリックしてエディタの該当箇所へジャンプ">
                <div class="issue-header">
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <span class="issue-tag" style="background: rgba(46, 160, 67, 0.15); color: #3fb950; border: 1px solid rgba(46, 160, 67, 0.3);">談話接続: ${item.relationType}</span>
                  </div>
                  <span class="issue-pos">オフセット ${item.from}</span>
                </div>
                <div class="issue-message">接続関係: <strong>「${this.escapeHtml(item.text)}」</strong></div>
                <div class="issue-jump-hint">➜ エディタへジャンプ</div>
              </div>
            `;
          }
        }

        if (res.entitySpanItems && res.entitySpanItems.length > 0) {
          for (const item of res.entitySpanItems) {
            html += `
              <div class="linter-issue-card cursor-pointer" data-action="jump" data-from="${item.from}" data-to="${item.to}" title="クリックしてエディタの該当箇所へジャンプ">
                <div class="issue-header">
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <span class="issue-tag" style="background: rgba(210, 153, 34, 0.15); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.3);">エンティティ</span>
                  </div>
                  <span class="issue-pos">${item.from} - ${item.to}</span>
                </div>
                <div class="issue-message">固有名詞: <strong>「${this.escapeHtml(item.text)}」</strong></div>
                <div class="issue-jump-hint">➜ エディタへジャンプ</div>
              </div>
            `;
          }
        }
      }

      // 6. Tier 3: Continuity Guard Section
      if (showTier3 && tier3Count > 0) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>🌐 Tier 3: 因果・伏線・迷子設定（Continuity Guard）</span>
            <span class="section-count">${tier3Count}</span>
          </div>
        `;

        // 6.1 Causal DAG Cycle Detection
        if (this.dagCycleReport) {
          if (this.dagCycleReport.cycles.length > 0) {
            html += `
              <div class="linter-issue-card" style="border-left: 3px solid var(--color-danger, #f85149);">
                <div class="issue-header">
                  <span class="issue-tag tag-danger">因果ループ検出</span>
                  <span class="issue-pos">${this.dagCycleReport.cycles.length}件の循環矛盾</span>
                </div>
                <div class="issue-message">因果関係グラフ（Causal DAG）に循環参照が検出されました。設定の前後関係・因果律に論理矛盾が生じています。</div>
                <div class="issue-snippet" style="background: rgba(248, 81, 73, 0.08); padding: 5px 8px; font-size: 11px; margin-top: 4px; border-radius: 3px;">
                  ${this.dagCycleReport.cycles.map((c) => `⚠️ 閉路: ${c.join(' ➔ ')}`).join('<br>')}
                </div>
              </div>
            `;
          } else {
            html += `
              <div class="linter-issue-card" style="border-left: 3px solid var(--color-success, #3fb950); opacity: 0.9;">
                <div class="issue-header">
                  <span class="issue-tag" style="background: rgba(63, 185, 80, 0.15); color: var(--color-success, #3fb950);">因果DAG正常</span>
                  <span class="issue-pos">Acyclic</span>
                </div>
                <div class="issue-message" style="font-size: 11px;">因果関係グラフに循環矛盾はなく、完全な非循環有向グラフが維持されています。</div>
              </div>
            `;
          }
        }

        // 6.2 Unresolved Foreshadowing Nodes
        if (this.unresolvedForeshadowings.length > 0) {
          html += `
            <div style="margin-top: 6px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--color-text-dim); margin-bottom: 4px;">未回収伏線 (${this.unresolvedForeshadowings.length}件):</div>
          `;
          for (const fore of this.unresolvedForeshadowings) {
            html += `
              <div class="linter-issue-card cursor-pointer" data-action="jump" data-from="${fore.plantedOffset}" data-to="${fore.plantedOffset + (fore.title.length || 1)}">
                <div class="issue-header">
                  <span class="issue-tag" style="background: rgba(207, 168, 92, 0.15); color: var(--color-gold, #cfa85c);">伏線未回収</span>
                  <span class="issue-pos">${fore.plantedChapterTitle} (行${fore.plantedLine})</span>
                </div>
                <div class="issue-message">「<strong>${this.escapeHtml(fore.title)}</strong>」: ${this.escapeHtml(fore.description || '未回収の重要伏線ノード')}</div>
                <div class="issue-jump-hint">➜ 配置箇所へジャンプ</div>
              </div>
            `;
          }
          html += `</div>`;
        }

        // 6.3 Stray Lore (迷子設定棚)
        if (this.strayLoreItems.length > 0) {
          html += `
            <div style="margin-top: 6px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--color-text-dim); margin-bottom: 4px;">迷子設定棚・Shelved Lore (${this.strayLoreItems.length}件):</div>
          `;
          for (const stray of this.strayLoreItems) {
            html += `
              <div class="linter-issue-card" style="border-left: 3px solid #e3b341;">
                <div class="issue-header">
                  <span class="issue-tag" style="background: rgba(227, 179, 65, 0.15); color: #e3b341;">迷子設定</span>
                  <span class="issue-pos">重要度スコア: ${stray.manualScore.toFixed(1)}</span>
                </div>
                <div class="issue-message">設定名: <strong>「${this.escapeHtml(stray.canonicalName)}」</strong></div>
                ${stray.evacuationContext ? `
                  <div class="issue-snippet" style="font-size: 11px; margin: 4px 0;">
                    退避時文脈: 「${this.escapeHtml(stray.evacuationContext)}」
                  </div>
                ` : ''}
                <div style="display: flex; gap: 6px; margin-top: 6px;">
                  <button class="btn-restore-stray" data-action="restore-stray" data-id="${stray.entityId}" style="padding: 2px 8px; font-size: 11px; background: var(--color-primary, #58a6ff); color: #fff; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">
                    再利用（復活）
                  </button>
                  <button class="btn-purge-stray" data-action="purge-stray" data-id="${stray.entityId}" style="padding: 2px 8px; font-size: 11px; background: rgba(248, 81, 73, 0.15); color: var(--color-danger, #f85149); border: 1px solid rgba(248, 81, 73, 0.3); border-radius: 3px; cursor: pointer;">
                    完全破棄
                  </button>
                </div>
              </div>
            `;
          }
          html += `</div>`;
        }
      }
    }

    html += `</div>`;
    return html;

  }

  /**
   * Attaches interactive DOM events to rendered dock container.
   */
  public bindEvents(container: HTMLElement): void {
    // Jump to editor target
    container.querySelectorAll('[data-action="jump"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const from = parseInt(target.dataset.from || '0', 10);
        const to = parseInt(target.dataset.to || '0', 10);
        if (this.onJumpToTarget) {
          this.onJumpToTarget(from, to);
        }
      });
    });

    // Insert subject candidate
    container.querySelectorAll('[data-action="insert-subject"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const from = parseInt(target.dataset.from || '0', 10);
        const subject = target.dataset.subject || '';
        if (this.onInsertSubject && subject) {
          this.onInsertSubject(from, subject);
        }
      });
    });

    // Quick replace candidate
    container.querySelectorAll('[data-action="quick-replace"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const from = parseInt(target.dataset.from || '0', 10);
        const to = parseInt(target.dataset.to || '0', 10);
        const replacement = target.dataset.replacement || '';
        if (this.onReplaceText && replacement) {
          this.onReplaceText(from, to, replacement);
        }
      });
    });

    // Tier toggles
    container.querySelectorAll('[data-action="tier"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tier = target.dataset.tier as InspectionTier;
        if (tier) {
          this.setTier(tier);
          container.innerHTML = this.renderHTML();
          this.bindEvents(container);
        }
      });
    });

    // Filter toggles
    container.querySelectorAll('[data-action="filter"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const filter = target.dataset.filter as 'all' | 'syntactic' | 'zero-pronoun' | 'kinsoku' | 'pov' | 'events';
        if (filter) {
          this.setFilter(filter);
          container.innerHTML = this.renderHTML();
          this.bindEvents(container);
        }
      });
    });

    // Restore Stray Lore
    container.querySelectorAll('[data-action="restore-stray"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const id = target.dataset.id;
        if (id && this.onRestoreStrayLore) {
          this.onRestoreStrayLore(id);
        }
      });
    });

    // Purge Stray Lore
    container.querySelectorAll('[data-action="purge-stray"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const id = target.dataset.id;
        if (id && this.onPurgeStrayLore) {
          this.onPurgeStrayLore(id);
        }
      });
    });

    // Delete PRH Rule
    container.querySelectorAll('[data-action="delete-prh"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const id = target.dataset.id;
        if (id && this.onDeletePrhRule) {
          this.onDeletePrhRule(id);
        }
      });
    });
  }

  private getRuleLabel(ruleType: string): string {
    switch (ruleType) {
      case 'double-negation':
        return '二重否定';
      case 'particle-repetition':
        return '助詞重複';
      case 'consecutive-passive':
      case 'passive-voice':
        return '受動態過多';
      case 'demonstrative-overuse':
        return '指示語多用';
      case 'subject-predicate-mismatch':
        return '主述不整合';
      case 'kanji-hiraku':
        return 'ひらく漢字';
      case 'ellipsis-dash':
        return '三点・ダッシュ';
      case 'bracket-pair':
        return '括弧不整合';
      case 'qwerty-typo':
        return 'タイポ検知';
      case 'prh-rule':
        return '用字用語(PRH)';
      case 'consecutive-punctuation':
        return '句読点連続';
      case 'char-repetition':
        return '文字連続';
      default:
        return '構文不備';
    }
  }

  private getRuleBadgeClass(ruleType: string): string {
    switch (ruleType) {
      case 'double-negation':
        return 'tag-double-neg';
      case 'particle-repetition':
        return 'tag-particle';
      case 'consecutive-passive':
      case 'passive-voice':
        return 'tag-passive';
      case 'demonstrative-overuse':
        return 'tag-warning';
      case 'subject-predicate-mismatch':
        return 'tag-mismatch';
      case 'kanji-hiraku':
        return 'tag-gold';
      case 'prh-rule':
        return 'tag-gold';
      case 'ellipsis-dash':
        return 'tag-ellipsis';
      case 'bracket-pair':
        return 'tag-bracket';
      case 'qwerty-typo':
        return 'tag-typo';
      case 'consecutive-punctuation':
      case 'char-repetition':
        return 'tag-danger';
      default:
        return 'tag-default';
    }
  }


  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
