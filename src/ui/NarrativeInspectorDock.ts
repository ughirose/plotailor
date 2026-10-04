import type {
  NarrativeAnalysisResult,
  SyntacticLinterItem,
  ZeroPronounItem,
  ZeroPronounCandidate,
} from '../core/editor/NarrativeLinterEngine.js';
import type { KinsokuViolation } from '../core/editor/KinsokuEngine.js';

export interface NarrativeInspectorDockOptions {
  onJumpToTarget?: (from: number, to: number) => void;
  onInsertSubject?: (from: number, candidateText: string) => void;
  onReplaceText?: (from: number, to: number, replacement: string) => void;
}

export class NarrativeInspectorDock {
  private currentResult: NarrativeAnalysisResult = {
    syntacticItems: [],
    zeroPronounItems: [],
    syntacticScore: 100,
    totalWarnings: 0,
  };

  private kinsokuViolations: KinsokuViolation[] = [];
  private activeFilter: 'all' | 'syntactic' | 'zero-pronoun' | 'kinsoku' | 'pov' | 'events' = 'all';
  private onJumpToTarget?: (from: number, to: number) => void;
  private onInsertSubject?: (from: number, candidateText: string) => void;
  private onReplaceText?: (from: number, to: number, replacement: string) => void;

  constructor(options: NarrativeInspectorDockOptions = {}) {
    this.onJumpToTarget = options.onJumpToTarget;
    this.onInsertSubject = options.onInsertSubject;
    this.onReplaceText = options.onReplaceText;
  }

  public updateResult(result: NarrativeAnalysisResult): void {
    this.currentResult = result;
  }

  public updateKinsokuViolations(violations: KinsokuViolation[]): void {
    this.kinsokuViolations = violations;
  }

  public getKinsokuViolations(): KinsokuViolation[] {
    return this.kinsokuViolations;
  }

  public getResult(): NarrativeAnalysisResult {
    return this.currentResult;
  }

  public setFilter(filter: 'all' | 'syntactic' | 'zero-pronoun' | 'kinsoku' | 'pov' | 'events'): void {
    this.activeFilter = filter;
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

    let html = `
      <div class="narrative-inspector-dock" data-testid="narrative-inspector-dock">
        <!-- Top Score & Health Metric -->
        <div class="dock-card dock-score-card">
          <div class="dock-card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="dock-card-title">🖋️ リアルタイム推敲・構文スコア</span>
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
            ${eventCount > 0 ? `
            <div class="linter-metric-row" style="margin-top: 4px; font-size: 11px; opacity: 0.9;">
              <span>事象アクション: <strong>${res.eventActionItems?.length || 0} 件</strong></span>
              <span>固有名詞: <strong>${res.entitySpanItems?.length || 0} 件</strong></span>
              <span>談話接続: <strong>${res.connectiveItems?.length || 0} 件</strong></span>
            </div>
            ` : ''}
            <div class="score-criteria-hint" style="font-size: 11px; color: var(--color-text-dim); margin-top: 6px; padding: 4px 8px; background: rgba(0, 0, 0, 0.04); border-radius: 4px; line-height: 1.4;">
              💡 <strong>採点基準:</strong> 基礎点100点からの減点方式（構文・文体指摘: −8点/件、主語抜け: −5点/件、認識POV: −3点/件）
            </div>
          </div>
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

    if (res.totalWarnings === 0 && this.kinsokuViolations.length === 0) {
      html += `
        <div class="dock-empty-state">
          <div style="font-size: 24px; margin-bottom: 8px;">✨</div>
          <p><strong>文章構成は極めて清澄です</strong></p>
          <p style="font-size: 11px; color: var(--color-text-dim); margin-top: 4px;">
            助詞重複・二重否定・受身連続・主語省略・組版禁則の不備は見つかりませんでした。
          </p>
        </div>
      `;
    } else {
      // 1. Syntactic Linter Warnings Section
      if (showSyntactic && res.syntacticItems.length > 0) {
        html += `
          <div class="dock-section-title">
            <span>⚠️ 構文・文体指摘（Syntactic Linter）</span>
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
                      title="この語句をひらがなに置換"
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
      }

      // 2. Zero Pronoun Resolution Section
      if (showZP && res.zeroPronounItems.length > 0) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>👤 主語抜け・ゼロ代名詞（Zero Pronoun）</span>
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

      // 3. Kinsoku Shori (Prohibition & Hanging Rules) Section
      if (showKinsoku && this.kinsokuViolations.length > 0) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>📐 組版・禁則違反（Kinsoku Violations）</span>
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

      // 4. POV (Epistemic / Internal Sensation) Section
      if (showPOV && res.povItems && res.povItems.length > 0) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>👁️ 認識POV・内面描写（Epistemic POV）</span>
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

      // 5. Events, Actions & Discourse Connectives Section
      if (showEvents && ((res.eventActionItems && res.eventActionItems.length > 0) || (res.connectiveItems && res.connectiveItems.length > 0) || (res.entitySpanItems && res.entitySpanItems.length > 0))) {
        html += `
          <div class="dock-section-title" style="margin-top: 14px;">
            <span>⚡ 事象アクション・談話構造（Event & Discourse DAG）</span>
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
