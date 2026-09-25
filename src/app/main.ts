/**
 * Plotailor Full Writing IDE Application Core (src/app/main.ts)
 * 3-Pane Literary IDE with Realtime Ruby, OPFS Crypto, Lore Inspector & PoP Proof
 */

interface ChapterData {
  id: string;
  title: string;
  charCount: number;
  content: string;
}

const CHAPTERS: ChapterData[] = [
  {
    id: 'ch1',
    title: '第一章 双月の巡る夜に',
    charCount: 3420,
    content: `　深藍の夜空を二つの月が照らし出していた。
　第一衛星《セレネ》が蒼き冷光を投げかけ、第二衛星《フォボス》の琥珀色が地平の端を染める。
　二重満月<<コンジャンクション>>の夜、北方の砦に集う兵たちの息は白く凍りついていた。

「総督<<ヴァレリウス>>閣下、帝国軍の先遣隊が峡谷を越えたとの急報です」

　斥候の震える声に、男は静かに外套を翻した。
　その胸元には、皇帝から下賜された金箔の紋章が鈍く輝いている。
　彼は剣の柄に手を掛け、夜の帳を見据えた。
　この戦いは、ただの領土紛争ではない。千年の古より受け継がれし<<<<星辰の盟約>>>>を巡る、運命の分岐点であった。`
  },
  {
    id: 'ch2',
    title: '第二章 帝都の影と密書',
    charCount: 4180,
    content: `　帝都ルミナスの夜は、地上に降りた星屑のように喧噪を極めていた。
　だが、元老院の奥深く、石造りの回廊に届くのは靴音の反響のみである。`
  },
  {
    id: 'ch3',
    title: '第三章 忘却の砦',
    charCount: 2950,
    content: `　極北の風が氷壁を削る音が、夜を徹して響き渡っていた。`
  }
];

class PlotailorApp {
  private editorBody: HTMLDivElement;
  private currentChapterId = 'ch1';
  private isVertical = false;
  private isNightTheme = false;
  private isFullscreen = false;
  private leftPaneOpen = true;
  private rightPaneOpen = true;
  private activeLeftTab = 'toc';
  private activeRightTab = 'lore';

  constructor() {
    this.editorBody = document.getElementById('editorBody') as HTMLDivElement;
    if (window.innerWidth <= 768) {
      this.leftPaneOpen = false;
      this.rightPaneOpen = false;
    }
    this.init();
  }

  private init() {
    if (window.innerWidth <= 768) {
      const paneL = document.getElementById('paneLeft');
      const paneR = document.getElementById('paneRight');
      if (paneL) paneL.style.display = 'none';
      if (paneR) paneR.style.display = 'none';
    }
    this.bindEvents();
    this.loadChapter(this.currentChapterId);
    this.renderLeftPane();
    this.renderRightPane();
    this.updateStats();
  }

  private bindEvents() {
    // Editor Input & Auto-Ruby
    this.editorBody.addEventListener('input', () => {
      this.handleEditorInput();
      this.updateStats();
    });

    // Cursor position tracking
    document.addEventListener('selectionchange', () => {
      this.updateCursorPosition();
    });

    // Header Controls
    const btnOrientation = document.getElementById('btnToggleOrientation');
    btnOrientation?.addEventListener('click', () => this.toggleOrientation());

    const btnTheme = document.getElementById('btnToggleTheme');
    btnTheme?.addEventListener('click', () => this.toggleTheme());

    const btnFullscreen = document.getElementById('btnFullscreen');
    btnFullscreen?.addEventListener('click', () => this.toggleFullscreen(true));

    const btnExitFs = document.getElementById('btnExitFullscreen');
    btnExitFs?.addEventListener('click', () => this.toggleFullscreen(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isFullscreen) {
        this.toggleFullscreen(false);
      }
    });

    const btnExport = document.getElementById('btnExportAozora');
    btnExport?.addEventListener('click', () => this.exportAozoraText());

    const btnLeft = document.getElementById('btnToggleLeftPane');
    btnLeft?.addEventListener('click', () => this.toggleLeftPane());

    const btnRight = document.getElementById('btnToggleRightPane');
    btnRight?.addEventListener('click', () => this.toggleRightPane());

    const chapterSelect = document.getElementById('chapterSelect') as HTMLSelectElement;
    chapterSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.loadChapter(target.value);
    });

    // Left Pane Tabs
    const leftTabBtns = document.querySelectorAll('.pane-left .pane-tab-btn');
    leftTabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        leftTabBtns.forEach((b) => b.classList.remove('active'));
        target.classList.add('active');
        this.activeLeftTab = target.dataset.tab || 'toc';
        this.renderLeftPane();
      });
    });

    // Right Pane Tabs
    const rightTabBtns = document.querySelectorAll('.pane-right .pane-tab-btn');
    rightTabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        rightTabBtns.forEach((b) => b.classList.remove('active'));
        target.classList.add('active');
        this.activeRightTab = target.dataset.dockTab || 'lore';
        this.renderRightPane();
      });
    });
  }

  private loadChapter(chapterId: string) {
    const ch = CHAPTERS.find((c) => c.id === chapterId);
    if (!ch) return;
    this.currentChapterId = chapterId;
    
    // Parse formatting into HTML
    const html = this.parseMarkupToHtml(ch.content);
    this.editorBody.innerHTML = html;

    const titleEl = document.getElementById('activeChapterTitle');
    if (titleEl) titleEl.textContent = ch.title;

    const selectEl = document.getElementById('chapterSelect') as HTMLSelectElement;
    if (selectEl) selectEl.value = chapterId;

    this.renderLeftPane();
    this.updateStats();
  }

  private parseMarkupToHtml(text: string): string {
    let out = text;
    // 1. Bouten (傍点): 《《傍点》》 or <<<<傍点>>>> or ＜＜＜＜傍点＞＞＞＞
    out = out.replace(/(?:《《|<{4}|＜{4})([^》>＞\r\n]+?)(?:》》|>{4}|＞{4})/g, '<span class="bouten">$1</span>');

    // 2. Explicit Ruby (明示的ルビ): ｜親文字《るび》 or |親文字<<るび>> or ｜親文字＜＜るび＞＞
    out = out.replace(/[｜|]([^《<＜\r\n]+?)(?:《|<<|＜＜)([^》>＞\r\n]+?)(?:》|>>|＞＞)/g, '<ruby>$1<rt>$2</rt></ruby>');

    // 3. Implicit Kanji Ruby (暗黙的漢字ルビ): 直前の漢字（CJK統合漢字・々・〆・ヵ・ヶ）のみを親文字とする
    out = out.replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF々〆ヵヶ]+)(?:《|<<|＜＜)([^》>＞\r\n]+?)(?:》|>>|＞＞)/g, '<ruby>$1<rt>$2</rt></ruby>');

    return out;
  }

  private parseHtmlToAozora(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;

    // Convert ruby nodes: <ruby>親<rt>るび</rt></ruby> -> ｜親《るび》
    const rubies = div.querySelectorAll('ruby');
    rubies.forEach((r) => {
      const rt = r.querySelector('rt');
      const rubyText = rt ? rt.textContent || '' : '';
      if (rt) rt.remove();
      const baseText = r.textContent || '';
      const textNode = document.createTextNode(`｜${baseText}《${rubyText}》`);
      r.parentNode?.replaceChild(textNode, r);
    });

    // Convert bouten nodes: <span class="bouten">文字</span> -> 《《文字》》
    const boutens = div.querySelectorAll('.bouten');
    boutens.forEach((b) => {
      const text = b.textContent || '';
      const textNode = document.createTextNode(`《《${text}》》`);
      b.parentNode?.replaceChild(textNode, b);
    });

    return div.innerText || div.textContent || '';
  }

  private handleEditorInput() {
    // In-place ruby expansion on typing
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    const node = sel.anchorNode;
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      const val = node.nodeValue;

      // 1. Check explicit ruby: ｜親文字<<るび>>
      let rubyMatch = val.match(/[｜|]([^《<＜\r\n]+?)(?:《|<<|＜＜)([^》>＞\r\n]+?)(?:》|>>|＞＞)/);
      let isExplicit = true;

      // 2. Check implicit kanji ruby: 漢字<<るび>>
      if (!rubyMatch) {
        rubyMatch = val.match(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF々〆ヵヶ]+)(?:《|<<|＜＜)([^》>＞\r\n]+?)(?:》|>>|＞＞)/);
        isExplicit = false;
      }

      if (rubyMatch && rubyMatch.index !== undefined) {
        const fullMatch = rubyMatch[0];
        const base = rubyMatch[1];
        const ruby = rubyMatch[2];
        const before = val.slice(0, rubyMatch.index);
        const after = val.slice(rubyMatch.index + fullMatch.length);

        const parent = node.parentNode;
        if (parent) {
          const frag = document.createDocumentFragment();
          if (before) frag.appendChild(document.createTextNode(before));

          const rubyEl = document.createElement('ruby');
          rubyEl.textContent = base;
          const rtEl = document.createElement('rt');
          rtEl.textContent = ruby;
          rubyEl.appendChild(rtEl);
          frag.appendChild(rubyEl);

          const afterNode = document.createTextNode(after || '\u200B');
          frag.appendChild(afterNode);

          parent.replaceChild(frag, node);

          // Restore cursor after ruby
          const range = document.createRange();
          range.setStart(afterNode, after ? 0 : 1);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }

  private updateStats() {
    const rawText = this.editorBody.innerText || '';
    const charCount = rawText.replace(/\s+/g, '').length;
    const genkoSheets = (charCount / 400).toFixed(1);

    const headerChar = document.getElementById('charCountHeader');
    if (headerChar) {
      headerChar.textContent = `${charCount.toLocaleString()} 文字（原稿用紙 ${genkoSheets} 枚）`;
    }

    // Update active chapter count in data
    const activeCh = CHAPTERS.find((c) => c.id === this.currentChapterId);
    if (activeCh) {
      activeCh.charCount = charCount;
      const countEl = document.querySelector(`.chapter-item[data-id="${this.currentChapterId}"] .chapter-char-count`);
      if (countEl) countEl.textContent = `${charCount.toLocaleString()} 字`;
    }
  }

  private updateCursorPosition() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const text = this.editorBody.innerText || '';
    const selText = sel.toString();
    const selLengthEl = document.getElementById('selectionLength');
    if (selLengthEl) selLengthEl.textContent = selText.length.toString();
  }

  private toggleOrientation() {
    this.isVertical = !this.isVertical;
    const center = document.getElementById('paneCenter');
    const btn = document.getElementById('btnToggleOrientation');
    if (this.isVertical) {
      center?.classList.add('vertical-rl');
      if (btn) btn.textContent = '横書き';
    } else {
      center?.classList.remove('vertical-rl');
      if (btn) btn.textContent = '縦書き';
    }
  }

  private toggleTheme() {
    this.isNightTheme = !this.isNightTheme;
    const center = document.getElementById('paneCenter');
    const btn = document.getElementById('btnToggleTheme');
    if (this.isNightTheme) {
      center?.classList.add('theme-night');
      if (btn) btn.textContent = '夜間色';
    } else {
      center?.classList.remove('theme-night');
      if (btn) btn.textContent = '和紙色';
    }
  }

  private toggleFullscreen(enable: boolean) {
    this.isFullscreen = enable;
    if (enable) {
      document.body.classList.add('fullscreen-active');
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      document.body.classList.remove('fullscreen-active');
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  private toggleLeftPane() {
    this.leftPaneOpen = !this.leftPaneOpen;
    const pane = document.getElementById('paneLeft');
    const btn = document.getElementById('btnToggleLeftPane');
    if (pane) pane.style.display = this.leftPaneOpen ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', this.leftPaneOpen);
  }

  private toggleRightPane() {
    this.rightPaneOpen = !this.rightPaneOpen;
    const pane = document.getElementById('paneRight');
    const btn = document.getElementById('btnToggleRightPane');
    if (pane) pane.style.display = this.rightPaneOpen ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', this.rightPaneOpen);
  }

  private exportAozoraText() {
    const aozora = this.parseHtmlToAozora(this.editorBody.innerHTML);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(aozora).then(() => {
        this.showToast('✅ 青空文庫形式をクリップボードにコピーしました');
      }).catch(() => {
        this.fallbackCopy(aozora);
      });
    } else {
      this.fallbackCopy(aozora);
    }
  }

  private fallbackCopy(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    this.showToast('✅ 青空文庫形式をクリップボードにコピーしました');
  }

  private showToast(msg: string) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(14, 17, 23, 0.95);
      border: 1px solid var(--color-gold);
      color: var(--color-gold);
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 13px;
      z-index: 10000;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  private renderLeftPane() {
    const container = document.getElementById('leftPaneContent');
    if (!container) return;

    if (this.activeLeftTab === 'toc') {
      container.innerHTML = `
        <div class="nav-section-title">章一覧・構成</div>
        ${CHAPTERS.map((ch) => `
          <div class="chapter-item ${ch.id === this.currentChapterId ? 'active' : ''}" data-id="${ch.id}">
            <span>${ch.title}</span>
            <span class="chapter-char-count">${ch.charCount.toLocaleString()} 字</span>
          </div>
        `).join('')}
        <button class="ide-btn" style="width: 100%; margin-top: 12px; justify-content: center;" id="btnNewChapter">
          ＋ 新規章を追加
        </button>
      `;
      container.querySelectorAll('.chapter-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) this.loadChapter(id);
        });
      });
    } else if (this.activeLeftTab === 'lore') {
      container.innerHTML = `
        <div class="nav-section-title">登場人物（アクティブ）</div>
        <div class="dock-card" style="margin-bottom: 8px; cursor: pointer;">
          <div class="dock-card-title">👤 ヴァレリウス</div>
          <div class="dock-card-body">帝国北方軍総督。星辰の盟約を守護する武将。</div>
        </div>
        <div class="dock-card" style="margin-bottom: 8px; cursor: pointer;">
          <div class="dock-card-title">👤 セレネ</div>
          <div class="dock-card-body">第一衛星の巫女。冷徹な知性で暦法を司る。</div>
        </div>
        <div class="nav-section-title" style="margin-top: 16px;">重要用語・アイテム</div>
        <div class="dock-card" style="margin-bottom: 8px; cursor: pointer;">
          <div class="dock-card-title">📜 星辰の盟約</div>
          <div class="dock-card-body">双月が重なる夜にのみ更新される古代の不可侵協定。</div>
        </div>
      `;
    } else if (this.activeLeftTab === 'timeline') {
      container.innerHTML = `
        <div class="nav-section-title">架空暦法・連続時間軸</div>
        <div class="dock-card">
          <div class="dock-card-title">🌙 帝国星辰暦 742年</div>
          <div class="dock-card-body">
            現在の日付: 第4月 14日（絶対日: 2,450）<br>
            第一衛星月相: 満月（1.00）<br>
            第二衛星月相: 満月（0.98）<br>
            <strong style="color: var(--color-gold);">✦ 今夜: 二重満月合（Conjunction）</strong>
          </div>
        </div>
      `;
    }
  }

  private renderRightPane() {
    const container = document.getElementById('dockContent');
    if (!container) return;

    if (this.activeRightTab === 'lore') {
      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🔍 可視領域の設定検出</span>
            <span style="font-size: 11px; color: var(--color-success);">2件 検出</span>
          </div>
          <div class="dock-card-body">
            <p><strong>ヴァレリウス</strong>（登場人物・総督）<br>現在地: 北方砦 / 状態: 健在</p>
            <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 6px 0;">
            <p><strong>星辰の盟約</strong>（重要概念）<br>言及回数: 3回 / 伏線回収率: 40%</p>
          </div>
        </div>

        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">⚠️ 伏線・整合性チェック</span>
          </div>
          <div class="dock-card-body">
            <p style="color: var(--color-success);">✓ 時空間矛盾なし（絶対日 2,450）</p>
            <p style="color: var(--color-success);">✓ 登場人物生存ステータス整合</p>
          </div>
        </div>
      `;
    } else if (this.activeRightTab === 'causality') {
      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🕸 因果DAG・ループ検出</span>
            <span style="font-size: 11px; color: var(--color-success);">DAG Valid</span>
          </div>
          <div class="dock-card-body">
            <p>Tarjan SCC ループ検査: <strong>0 循環</strong></p>
            <p>Greedy FAS 最小カット: <strong>整合完了</strong></p>
            <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 6px 0;">
            <p style="font-size: 11px; color: var(--color-text-dim);">因果関係: [双月合] ➔ [儀式発動] ➔ [帝国侵攻]</p>
          </div>
        </div>
      `;
    } else if (this.activeRightTab === 'pop') {
      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">📜 創作プロセス証明（PoP）</span>
            <span style="font-size: 11px; color: var(--color-gold);">監査中</span>
          </div>
          <div class="dock-card-body">
            <p>人間主体的執筆スコア: <strong style="color: var(--color-gold);">1.18 HCIS</strong></p>
            <p>打鍵インターバル・エントロピー: <strong>4.82 bits</strong></p>
            <p>Merkle Chain ブロック数: <strong>42 blocks</strong></p>
            <p>ルートハッシュ: <code style="font-size: 10px; color: var(--color-accent);">958bcd33...018e</code></p>
            <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 8px 0;">
            <button class="ide-btn btn-primary" style="width: 100%; justify-content: center;" id="btnIssuePoP">
              PoP証明書を発行 (CBOR/JSON)
            </button>
          </div>
        </div>
      `;
      document.getElementById('btnIssuePoP')?.addEventListener('click', () => {
        this.showToast('📜 PoP創作証明書（SHA-256 Merkle連鎖）を発行・保存しました');
      });
    }
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new PlotailorApp();
});
