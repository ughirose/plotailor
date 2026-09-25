/**
 * EditorView - Interactive 3-Pane Non-Modal Literature IDE Mock
 */

import { AozoraParser } from '../core/editor/AozoraParser.js';
import { LoreLinterEngine, type LoreDiagnostic, type TermRegulation } from '../core/editor/LoreLinter.js';
import { PoPAuditEngine } from '../core/pop/PoPAuditEngine.js';
import { CelestialCalendarEngine } from '@core';

export class EditorView {
  private container: HTMLElement;
  private linter: LoreLinterEngine;
  private popEngine: PoPAuditEngine;
  private celestialEngine: CelestialCalendarEngine;
  private rawText: string;
  private isVerticalMode: boolean = false;
  private isComposing: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.linter = new LoreLinterEngine();
    this.popEngine = new PoPAuditEngine('author-session-01');

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
「近衛軍の動きが妙だ。停戦の誓いを破る気か」
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
            </div>
            <div class="toolbar-group">
              <span id="ime-indicator" style="font-size: 0.75rem; color: #10b981;">● IME: 待機</span>
            </div>
          </div>

          <div class="editor-workspace">
            <!-- Raw Editor -->
            <textarea class="raw-textarea" id="editor-raw" spellcheck="false" placeholder="ここに原稿を執筆...">${this.rawText}</textarea>

            <!-- Vertical Ruby Preview -->
            <div class="vertical-preview-container" id="vertical-preview">
              <div class="vertical-manuscript" id="manuscript-content"></div>
            </div>
          </div>

          <div class="editor-footer">
            <div id="word-count-display">文字数: 0字 / 原稿用紙 約0枚</div>
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
            <!-- Lore Diagnostics -->
            <div class="tree-group">
              <div class="tree-title">設定語句リント (Aho-Corasick)</div>
              <div id="linter-results-container"></div>
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

    // 2. Word count
    const wordCount = this.rawText.length;
    const pages = (wordCount / 400).toFixed(1);
    const wordCountDisplay = this.container.querySelector('#word-count-display');
    if (wordCountDisplay) {
      wordCountDisplay.textContent = `文字数: ${wordCount.toLocaleString()}字 / 原稿用紙 約${pages}枚 (400字詰)`;
    }

    // 3. Run Lore Linter
    const diagnostics = this.linter.lint(this.rawText);
    this.renderDiagnostics(diagnostics);

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
}
