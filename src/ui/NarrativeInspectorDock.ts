import type {
  NarrativeAnalysisResult,
  SyntacticLinterItem,
  ZeroPronounItem,
  ZeroPronounCandidate,
} from '../core/editor/NarrativeLinterEngine.js';

export interface NarrativeInspectorDockOptions {
  onJumpToTarget?: (from: number, to: number) => void;
  onInsertSubject?: (from: number, candidateText: string) => void;
}

export class NarrativeInspectorDock {
  private currentResult: NarrativeAnalysisResult = {
    syntacticItems: [],
    zeroPronounItems: [],
    syntacticScore: 100,
    totalWarnings: 0,
  };

  private activeFilter: 'all' | 'syntactic' | 'zero-pronoun' = 'all';
  private onJumpToTarget?: (from: number, to: number) => void;
  private onInsertSubject?: (from: number, candidateText: string) => void;

  constructor(options: NarrativeInspectorDockOptions = {}) {
    this.onJumpToTarget = options.onJumpToTarget;
    this.onInsertSubject = options.onInsertSubject;
  }

  public updateResult(result: NarrativeAnalysisResult): void {
    this.currentResult = result;
  }

  public getResult(): NarrativeAnalysisResult {
    return this.currentResult;
  }

  public setFilter(filter: 'all' | 'syntactic' | 'zero-pronoun'): void {
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

    let html = `
      <div class="narrative-inspector-dock" data-testid="narrative-inspector-dock">
        <!-- Top Score & Health Metric -->
        <div class="dock-card dock-score-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🖋️ リアルタイム推敲・構文スコア</span>
            <span class="score-badge" style="color: ${scoreColor}; font-weight: 700; font-size: 16px;">
              ${score} <small style="font-size: 10px; font-weight: 400;">/ 100 点</small>
            </span>
          </div>
          <div class="dock-card-body">
            <div class="linter-metric-row">
              <span>構文警告: <strong>${res.syntacticItems.length} 件</strong></span>
              <span>主語抜け（ゼロ代名詞）: <strong>${res.zeroPronounItems.length} 件</strong></span>
            </div>
            <div class="linter-engine-chips">
              <span class="engine-chip">⚡ Wasm SIMD PAS Head (0.6μs)</span>
              <span class="engine-chip">🔒 SPSC RingBuffer (ゼロコピー)</span>
            </div>
          </div>
        </div>

        <!-- Filter Sub-tabs (Inline within Dock) -->
        <div class="dock-filter-bar">
          <button class="filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">
            すべて (${res.totalWarnings})
          </button>
          <button class="filter-btn ${this.activeFilter === 'syntactic' ? 'active' : ''}" data-action="filter" data-filter="syntactic">
            文体・構文 (${res.syntacticItems.length})
          </button>
          <button class="filter-btn ${this.activeFilter === 'zero-pronoun' ? 'active' : ''}" data-action="filter" data-filter="zero-pronoun">
            主語抜け (${res.zeroPronounItems.length})
          </button>
        </div>
    `;

    if (res.totalWarnings === 0) {
      html += `
        <div class="dock-empty-state">
          <div style="font-size: 24px; margin-bottom: 8px;">✨</div>
          <p><strong>文章構成は極めて清澄です</strong></p>
          <p style="font-size: 11px; color: var(--color-text-dim); margin-top: 4px;">
            助詞重複・二重否定・受身連続・主語省略の不備は見つかりませんでした。
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
              ${item.previewText ? `<div class="issue-preview">対象: <code>${this.escapeHtml(item.previewText)}</code></div>` : ''}
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

    // Filter toggles
    container.querySelectorAll('[data-action="filter"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const filter = target.dataset.filter as 'all' | 'syntactic' | 'zero-pronoun';
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
        return '受身の連続';
      case 'subject-predicate-mismatch':
        return '主述不整合';
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
        return 'tag-passive';
      case 'subject-predicate-mismatch':
        return 'tag-mismatch';
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
