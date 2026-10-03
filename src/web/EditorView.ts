/**
 * EditorView - Interactive 3-Pane Non-Modal Literature IDE Mock
 */

import { AozoraParser } from '../core/editor/AozoraParser.js';
import { LoreLinterEngine, type LoreDiagnostic, type TermRegulation } from '../core/editor/LoreLinter.js';
import { StyleDiscomfortDetector, type StyleDiagnostic } from '../core/editor/StyleDiscomfortDetector.js';
import { PoPAuditEngine } from '../core/pop/PoPAuditEngine.js';
import { CelestialCalendarEngine } from '@core';
import { ForeshadowingEngine, type ForeshadowingJumpTarget } from '../core/editor/ForeshadowingEngine.js';
import { ForeshadowingProgressPanel } from '../core/editor/ForeshadowingProgressPanel.js';
import { KinsokuEngine, type KinsokuViolation } from '../core/editor/KinsokuEngine.js';
import { WritingVelocityWidget } from '../core/editor/WritingVelocityWidget.js';
import { MultiSiteNovelFormatter } from '../core/exporters/multisite-novel-formatter.js';
import { FullscreenStatusBar } from '../ui/FullscreenStatusBar.js';

export class EditorView {
  private container: HTMLElement;
  private linter: LoreLinterEngine;
  private styleDetector: StyleDiscomfortDetector;
  private popEngine: PoPAuditEngine;
  private celestialEngine: CelestialCalendarEngine;
  private foreshadowingEngine: ForeshadowingEngine;
  private kinsokuEngine: KinsokuEngine;
  private velocityWidget: WritingVelocityWidget;
  private fullscreenStatusBar: FullscreenStatusBar | null = null;
  private rawText: string;
  private isVerticalMode: boolean = false;
  private isComposing: boolean = false;
  private isFullscreen: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.linter = new LoreLinterEngine();
    this.styleDetector = new StyleDiscomfortDetector();
    this.popEngine = new PoPAuditEngine('author-session-01');
    this.foreshadowingEngine = new ForeshadowingEngine();
    this.foreshadowingEngine.parse('第1章\n@plant(f01, "誓いの指輪")');
    this.kinsokuEngine = new KinsokuEngine({ columnsPerLine: 40, allowHanging: true });
    this.velocityWidget = new WritingVelocityWidget();

    // Setup fictional calendar
    this.celestialEngine = new CelestialCalendarEngine(
      {
        id: 'imperial_cal',
        name: '帝国標準暦',
        monthsPerYear: 12,
        daysPerMonth: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        leapYearInterval: 4,
      },
      [
        { id: 'sat_luna', name: '双子月ルナ', synodicPeriodDays: 28, phaseOffsetDays: 0 },
        { id: 'sat_selene', name: '双子月セレーネ', synodicPeriodDays: 42, phaseOffsetDays: 14 },
      ]
    );

    // Initial regulations
    const regulations: TermRegulation[] = [
      {
        canonical: '帝国親衛隊',
        forbidden: ['近衛軍', '親衛連隊', '皇帝警護隊'],
        category: '組織・軍事',
      },
      {
        canonical: '紫電の剣',
        forbidden: ['雷撃剣', '迅雷の剣'],
        category: '神器・武具',
      },
      {
        canonical: 'ヴァレリウス将軍',
        forbidden: ['ヴァレリアス', 'バレリウス'],
        category: '主要人物',
      },
    ];
    this.linter.setRegulations(regulations);

    // Sample initial text with Aozora ruby and lore terms
    this.rawText = `　王都の夜空には二つの月が冷たく輝いていた。
　北の砦から帰還した｜ヴァレリウス将軍《ばれりうすしょうぐん》は、腰の｜紫電の剣《しでんのけん》にそっと触れた。
「近衛軍の動きが妙だ。停戦の誓いを破る気か。過剰な警護は必要ないわけではない。今夜、皇女様がお見えになられる」
　若き従卒のアーサーは恐れおののいた。《《予言の夜》》はすでに始まっていたのだ。`;
  }

  render(): void {
    this.container.innerHTML = `
      <div class="editor-layout">
        <!-- 1. LEFT PANE: Lore & World Tree -->
        <aside class="pane pane-left">
          <div class="pane-header">
            <span>🏛️ 設定・世界観ツリー</span>
            <span class="status-dot"></span>
          </div>
          <div class="pane-content">
            <div class="tree-group">
              <div class="tree-title">主要勢力 ＆ 登場人物</div>
              <div class="tree-item selected">
                <span>👤</span> ヴァレリウス将軍 (北方軍司令)
              </div>
              <div class="tree-item">
                <span>👤</span> アーサー (若き従卒)
              </div>
              <div class="tree-item">
                <span>👤</span> 皇女エレナ (王都在任)
              </div>
              <div class="tree-item">
                <span>⚔️</span> 帝国親衛隊 (中央直属)
              </div>
            </div>

            <div class="tree-group">
              <div class="tree-title">天文カレンダー (帝国標準暦)</div>
              <div class="tree-item" id="celestial-status">
                <span>🌙</span> 暦日: 帝国暦1024年 8月15日
              </div>
              <div class="tree-item">
                <span>🪐</span> ルナ満月度: <strong id="moon-phase-luna">計算中</strong>
              </div>
              <div class="tree-item">
                <span>🪐</span> セレーネ満月度: <strong id="moon-phase-selene">計算中</strong>
              </div>
            </div>

            <div class="tree-group">
              <div class="tree-title">タイムライン分岐スライス (SCD2)</div>
              <div class="tree-item selected">
                <span>🌿</span> 本線: 王都防衛戦 (t=368,450日)
              </div>
              <div class="tree-item">
                <span>🔀</span> 分岐α: 北方砦奪還ルート
              </div>
            </div>
          </div>
        </aside>

        <!-- 2. CENTER PANE: Vertical / Horizontal Editor -->
        <main class="pane editor-center-pane">
          <div class="editor-toolbar">
            <div class="toolbar-group">
              <button class="tool-btn" id="btn-toggle-vertical">
                <span>📜</span> 縦書きプレビュー切替
              </button>
              <button class="tool-btn" id="btn-insert-ruby">
                <span>ふ</span> ルビ挿入
              </button>
              <button class="tool-btn" id="btn-insert-bouten">
                <span>︙</span> 傍点挿入
              </button>
              <button class="tool-btn" id="btn-toggle-fullscreen">
                <span>⛶</span> 全画面
              </button>
              <button class="tool-btn" id="btn-export-kakuyomu" title="カクヨム記法でコピー">
                <span>📖</span> カクヨム
              </button>
              <button class="tool-btn" id="btn-export-narou" title="小説家になろう記法でコピー">
                <span>📗</span> なろう
              </button>
              <button class="tool-btn" id="btn-export-epub" title="電書協EPUB3 XHTMLでコピー">
                <span>📑</span> EPUB3
              </button>
            </div>
            <div class="toolbar-group">
              <span id="ime-indicator" style="font-size: 0.75rem; color: #10b981;">● IME: 待機</span>
            </div>
          </div>

          <div class="editor-workspace" id="editor-workspace">
            <!-- Raw Editor -->
            <textarea class="raw-textarea" id="editor-raw" spellcheck="false" placeholder="ここに原稿を執筆...">${this.rawText}</textarea>

            <!-- Vertical Ruby Preview -->
            <div class="vertical-preview-container" id="vertical-preview">
              <div class="vertical-manuscript" id="manuscript-content"></div>
            </div>
          </div>

          <div class="editor-footer">
            <div id="word-count-display">文字数: 0字 / 原稿用紙 約0枚</div>
            <div id="velocity-display">⚡ 速度: 0 CPM (0字/時)</div>
            <div id="save-status-display">💾 OPFS Auto-Save: 待機中 (WAL同期済)</div>
          </div>
        </main>

        <!-- 3. RIGHT PANE: Real-time Consistency & PoP Audit -->
        <aside class="pane pane-right">
          <div class="pane-header">
            <span>🛡️ 整合性監査 ＆ PoP証明</span>
            <span class="status-dot"></span>
          </div>
          <div class="pane-content">
            <!-- Kinsoku Typesetting Diagnostics -->
            <div class="tree-group">
              <div class="tree-title">📐 組版・禁則検査 (Kinsoku Engine)</div>
              <div id="kinsoku-results-container"></div>
            </div>

            <!-- Lore Diagnostics -->
            <div class="tree-group">
              <div class="tree-title">設定語句リント (Aho-Corasick)</div>
              <div id="linter-results-container"></div>
            </div>

            <!-- Style Discomfort Diagnostics -->
            <div class="tree-group">
              <div class="tree-title">文体違和感・過剰敬語検知</div>
              <div id="style-results-container"></div>
            </div>

            <!-- Foreshadowing Progress Panel -->
            <div id="foreshadowing-panel-container">
              ${new ForeshadowingProgressPanel(this.foreshadowingEngine).renderHtml()}
            </div>

            <!-- Cognitive Fog State -->
            <div class="tree-group">
              <div class="tree-title">認知フォグ因果律判定</div>
              <div class="diagnostic-card" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.25);">
                <div class="diagnostic-header" style="color: #10b981;">
                  <span>✅ 因果律整合: 正常</span>
                </div>
                <p style="color: var(--text-muted); font-size: 0.8rem; line-height: 1.5;">
                  登場人物の発話・行動は、各地点への情報到達日（通信速度: 飛脚50km/日）の範囲内です。
                </p>
              </div>
            </div>

            <!-- Merkle PoP Audit Chain -->
            <div class="tree-group">
              <div class="tree-title">Proof of Process (PoP) Merkle Chain</div>
              <div class="merkle-chain-list" id="merkle-chain-container"></div>
            </div>
          </div>
        </aside>
      </div>
    `;

    // Mount FullscreenStatusBar to workspace
    const workspace = this.container.querySelector('#editor-workspace') as HTMLElement;
    if (workspace) {
      this.fullscreenStatusBar = new FullscreenStatusBar({
        container: workspace,
        initialText: this.rawText,
        isFullscreen: this.isFullscreen,
      });
    }

    this.bindEvents();
    this.updateEditorState();
  }

  private bindEvents(): void {
    const rawTextarea = this.container.querySelector('#editor-raw') as HTMLTextAreaElement;
    const btnToggleVertical = this.container.querySelector('#btn-toggle-vertical');
    const btnInsertRuby = this.container.querySelector('#btn-insert-ruby');
    const btnInsertBouten = this.container.querySelector('#btn-insert-bouten');
    const imeIndicator = this.container.querySelector('#ime-indicator') as HTMLElement;

    // Input events with Japanese IME guard
    rawTextarea?.addEventListener('compositionstart', () => {
      this.isComposing = true;
      if (imeIndicator) {
        imeIndicator.textContent = '● IME: 未確定入力中 (ガード保護)';
        imeIndicator.style.color = '#f59e0b';
      }
    });

    rawTextarea?.addEventListener('compositionend', () => {
      this.isComposing = false;
      if (imeIndicator) {
        imeIndicator.textContent = '● IME: 確定済 (通常)';
        imeIndicator.style.color = '#10b981';
      }
      this.updateEditorState();
    });

    rawTextarea?.addEventListener('input', () => {
      if (!this.isComposing) {
        this.updateEditorState();
      }
    });

    // Vertical toggle
    btnToggleVertical?.addEventListener('click', () => {
      this.isVerticalMode = !this.isVerticalMode;
      const verticalContainer = this.container.querySelector('#vertical-preview');
      if (this.isVerticalMode) {
        verticalContainer?.classList.add('active');
        rawTextarea.style.display = 'none';
        btnToggleVertical.classList.add('active');
      } else {
        verticalContainer?.classList.remove('active');
        rawTextarea.style.display = 'block';
        btnToggleVertical.classList.remove('active');
      }
      this.updateEditorState();
    });

    // Helper insert buttons
    btnInsertRuby?.addEventListener('click', () => {
      this.insertAtCursor('｜漢字《かんじ》');
    });

    btnInsertBouten?.addEventListener('click', () => {
      this.insertAtCursor('《《傍点文字》》');
    });

    // Fullscreen toggle
    const btnFullscreen = this.container.querySelector('#btn-toggle-fullscreen');
    btnFullscreen?.addEventListener('click', () => {
      this.isFullscreen = !this.isFullscreen;
      btnFullscreen.classList.toggle('active', this.isFullscreen);
      this.fullscreenStatusBar?.setFullscreen(this.isFullscreen);
    });

    // Multi-site export buttons
    const btnKakuyomu = this.container.querySelector('#btn-export-kakuyomu');
    btnKakuyomu?.addEventListener('click', () => {
      const res = MultiSiteNovelFormatter.format(this.rawText, { platform: 'kakuyomu' });
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(res.formattedContent).catch(() => {});
      }
      alert(`カクヨム形式（${res.stats.characterCount}文字）をクリップボードにコピーしました`);
    });

    const btnNarou = this.container.querySelector('#btn-export-narou');
    btnNarou?.addEventListener('click', () => {
      const res = MultiSiteNovelFormatter.format(this.rawText, { platform: 'narou' });
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(res.formattedContent).catch(() => {});
      }
      alert(`小説家になろう形式（${res.stats.characterCount}文字）をクリップボードにコピーしました`);
    });

    const btnEpub = this.container.querySelector('#btn-export-epub');
    btnEpub?.addEventListener('click', () => {
      const res = MultiSiteNovelFormatter.format(this.rawText, {
        platform: 'denshokyo_epub',
        title: '作品プレビュー',
        author: 'Author',
      });
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(res.formattedContent).catch(() => {});
      }
      alert('電書協EPUB3 XHTMLをクリップボードにコピーしました');
    });
  }

  private insertAtCursor(text: string): void {
    const rawTextarea = this.container.querySelector('#editor-raw') as HTMLTextAreaElement;
    if (!rawTextarea) return;
    const start = rawTextarea.selectionStart;
    const end = rawTextarea.selectionEnd;
    const val = rawTextarea.value;
    rawTextarea.value = val.substring(0, start) + text + val.substring(end);
    rawTextarea.selectionStart = rawTextarea.selectionEnd = start + text.length;
    rawTextarea.focus();
    this.updateEditorState();
  }

  private updateEditorState(): void {
    const rawTextarea = this.container.querySelector('#editor-raw') as HTMLTextAreaElement;
    if (!rawTextarea) return;
    this.rawText = rawTextarea.value;

    // 1. Render vertical ruby preview
    const manuscript = this.container.querySelector('#manuscript-content');
    if (manuscript) {
      manuscript.innerHTML = AozoraParser.toHtml(this.rawText);
    }

    // 2. Word count & Writing Velocity
    const wordCount = this.rawText.length;
    const pages = (wordCount / 400).toFixed(1);
    const wordCountDisplay = this.container.querySelector('#word-count-display');
    if (wordCountDisplay) {
      wordCountDisplay.textContent = `文字数: ${wordCount.toLocaleString()}字 / 原稿用紙 約${pages}枚 (400字詰)`;
    }

    this.velocityWidget.recordKeystroke(this.rawText);
    this.fullscreenStatusBar?.updateText(this.rawText);
    const vel = this.velocityWidget.getMetrics();
    const velEl = this.container.querySelector('#velocity-display');
    if (velEl) {
      const deltaSign = vel.netCharacterDelta >= 0 ? '+' : '';
      const idleText = vel.isCurrentlyIdle ? ' [休]' : '';
      velEl.textContent = `⚡ 速度: ${vel.cpm} CPM (${vel.cph}字/時 | 純増:${deltaSign}${vel.netCharacterDelta}字${idleText})`;
    }

    // 3. Kinsoku Typesetting Diagnostics
    const kinsokuViolations = this.kinsokuEngine.detectViolations(this.rawText);
    this.renderKinsokuDiagnostics(kinsokuViolations);

    // 4. Run Lore Linter & Style Discomfort Detector
    const diagnostics = this.linter.lint(this.rawText);
    this.renderDiagnostics(diagnostics);

    const styleDiagnostics = this.styleDetector.detect(this.rawText, { isComposing: this.isComposing });
    this.renderStyleDiagnostics(styleDiagnostics);

    // 4. Record PoP Edit Event
    const event = this.popEngine.recordEvent({
      id: `evt-${Date.now()}`,
      eventType: 'TEXT_INSERT',
      payload: { length: wordCount, deltaLength: 1 },
      metadata: { timestamp: Date.now() },
    });
    this.renderPoPChain();

    // 5. Update Moon Phase
    const t = 368450; // Current scalar day
    const lunaPhase = this.celestialEngine.getMoonPhase('sat_luna', t);
    const selenePhase = this.celestialEngine.getMoonPhase('sat_selene', t);
    const lunaEl = this.container.querySelector('#moon-phase-luna');
    const seleneEl = this.container.querySelector('#moon-phase-selene');
    if (lunaEl) lunaEl.textContent = `${(lunaPhase * 100).toFixed(0)}% (${this.celestialEngine.getMoonPhaseName(lunaPhase)})`;
    if (seleneEl) seleneEl.textContent = `${(selenePhase * 100).toFixed(0)}% (${this.celestialEngine.getMoonPhaseName(selenePhase)})`;
  }

  private renderKinsokuDiagnostics(violations: KinsokuViolation[]): void {
    const container = this.container.querySelector('#kinsoku-results-container');
    if (!container) return;

    if (violations.length === 0) {
      container.innerHTML = `
        <div style="font-size: 0.8rem; color: #10b981; padding: 0.5rem 0;">
          ✨ 行頭・行末禁則違反なし（組版正常）
        </div>
      `;
      return;
    }

    container.innerHTML = violations
      .map(
        (v) => `
        <div class="diagnostic-card">
          <div class="diagnostic-header">
            <span>⚠️ ${v.type === 'line-head' ? '行頭禁則' : '行末禁則'}: 「${v.char}」</span>
            <span style="font-size: 0.7rem; color: var(--text-dim);">行 ${v.lineIndex + 1}, 列 ${v.colIndex + 1}</span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.4rem;">
            推奨措置: ${v.suggestedAction === 'push-down' ? '追い出し' : v.suggestedAction === 'hang' ? 'ぶら下げ' : '追い込み'}（${v.offset}文字目）
          </p>
          <button class="tool-btn kinsoku-jump-btn" data-offset="${v.offset}" style="font-size: 0.75rem; background: rgba(207, 168, 92, 0.2);">
            該当箇所へジャンプ
          </button>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('.kinsoku-jump-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const offset = parseInt(target.dataset.offset || '0', 10);
        this.jumpToTarget({ charOffset: offset });
      });
    });
  }

  private renderStyleDiagnostics(diagnostics: StyleDiagnostic[]): void {
    const container = this.container.querySelector('#style-results-container');
    if (!container) return;

    if (diagnostics.length === 0) {
      container.innerHTML = `
        <div style="font-size: 0.8rem; color: #10b981; padding: 0.5rem 0;">
          ✨ 二重否定・過剰敬語の違和感なし
        </div>
      `;
      return;
    }

    container.innerHTML = diagnostics
      .map(
        (d) => `
        <div class="diagnostic-card">
          <div class="diagnostic-header">
            <span>⚠️ ${d.category === 'double_negative' ? '二重否定検知' : '過剰・二重敬語検知'}: 「${d.text}」</span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.4rem;">
            ${d.message}
          </p>
          ${
            d.suggestions.length > 0 && !d.suggestions[0].startsWith('（')
              ? d.suggestions
                  .map(
                    (s) => `
                <button class="tool-btn style-quickfix-btn" data-text="${d.text}" data-suggest="${s}" style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.2); margin-right: 0.25rem;">
                  「${s}」に提案修正
                </button>
              `
                  )
                  .join('')
              : ''
          }
        </div>
      `
      )
      .join('');

    // QuickFix handlers for style fixes
    container.querySelectorAll('.style-quickfix-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const text = target.dataset.text;
        const suggest = target.dataset.suggest;
        if (text && suggest) {
          const rawTextarea = this.container.querySelector('#editor-raw') as HTMLTextAreaElement;
          if (rawTextarea) {
            rawTextarea.value = rawTextarea.value.replaceAll(text, suggest);
            this.updateEditorState();
          }
        }
      });
    });
  }

  private renderDiagnostics(diagnostics: LoreDiagnostic[]): void {
    const container = this.container.querySelector('#linter-results-container');
    if (!container) return;

    if (diagnostics.length === 0) {
      container.innerHTML = `
        <div style="font-size: 0.8rem; color: #10b981; padding: 0.5rem 0;">
          ✨ 用語不整合・表記揺れなし
        </div>
      `;
      return;
    }

    container.innerHTML = diagnostics
      .map(
        (d, idx) => `
        <div class="diagnostic-card">
          <div class="diagnostic-header">
            <span>⚠️ 表記揺れ検知: 「${d.wrongTerm}」</span>
            <span style="font-size: 0.7rem; color: var(--text-dim);">${d.category}</span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.4rem;">
            ${d.message}
          </p>
          <button class="tool-btn quickfix-btn" data-wrong="${d.wrongTerm}" data-canon="${d.canonical}" style="font-size: 0.75rem; background: rgba(99, 102, 241, 0.2);">
            正称「${d.canonical}」に自動置換
          </button>
        </div>
      `
      )
      .join('');

    // QuickFix handlers
    container.querySelectorAll('.quickfix-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const wrong = target.dataset.wrong;
        const canon = target.dataset.canon;
        if (wrong && canon) {
          const rawTextarea = this.container.querySelector('#editor-raw') as HTMLTextAreaElement;
          if (rawTextarea) {
            rawTextarea.value = rawTextarea.value.replaceAll(wrong, canon);
            this.updateEditorState();
          }
        }
      });
    });
  }

  private renderPoPChain(): void {
    const container = this.container.querySelector('#merkle-chain-container');
    if (!container) return;

    const events = this.popEngine.getChain().getEvents().slice(-3).reverse();
    container.innerHTML = events
      .map(
        (ev: any) => `
        <div class="merkle-block">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
            <span style="color: #a5b4fc; font-weight: 600;">#${ev.sequenceNumber} ${ev.eventType}</span>
            <span style="color: var(--text-dim); font-size: 0.7rem;">${new Date(ev.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="merkle-hash">Hash: ${ev.hash.substring(0, 16)}...</div>
        </div>
      `
      )
      .join('');
  }

  public jumpToTarget(target: { charOffset?: number; lineNumber?: number; [key: string]: any }): void {
    const rawTextarea = this.container.querySelector('#editor-raw') as HTMLTextAreaElement;
    if (rawTextarea && target.charOffset !== undefined) {
      rawTextarea.focus();
      rawTextarea.setSelectionRange(target.charOffset, target.charOffset);
    }
  }

  public setKinsokuColumns(cols: number): void {
    this.kinsokuEngine.updateConfig({ columnsPerLine: cols });
    this.updateEditorState();
  }

  public setAllowHanging(allow: boolean): void {
    this.kinsokuEngine.updateConfig({ allowHanging: allow });
    this.updateEditorState();
  }

  public setTargetWordCount(target: number): void {
    this.fullscreenStatusBar?.setTargetWordCount(target);
  }

  public setIdleThreshold(ms: number): void {
    this.velocityWidget.setIdleThreshold(ms);
  }

  public getKinsokuEngine(): KinsokuEngine {
    return this.kinsokuEngine;
  }

  public getVelocityWidget(): WritingVelocityWidget {
    return this.velocityWidget;
  }

  public getFullscreenStatusBar(): FullscreenStatusBar | null {
    return this.fullscreenStatusBar;
  }
}
