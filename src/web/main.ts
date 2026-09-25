/**
 * Plotailor - Official Literary Editor & Showcase Application
 * 
 * Features:
 * - 3-Pane Non-Modal Editor Mockup with interactive character & lore cards
 * - In-place auto-ruby expansion (renders beautiful <ruby> in both horizontal and vertical modes, keeping Aozora format under the hood)
 * - Proof of Process (PoP) real-time Merkle hash generation
 * - Discreet Narrative-Nano (5.8M) Developer Lab Drawer (裏メニュー)
 */

import './styles.css';
import { sha256 } from '../core/pop/MerkleHashChain.js';
import { SPSCRingBuffer } from '../core/ipc/SharedMemoryProtocol.js';

document.addEventListener('DOMContentLoaded', () => {
  initPlotailorApp();
});

function initPlotailorApp(): void {
  initInteractiveEditor();
  initNarrativeNanoLab();
}

/**
 * 3-Pane Master Editor Interactive Controller
 */
function initInteractiveEditor(): void {
  const editorArea = document.getElementById('editorContentArea') as HTMLDivElement;
  const toggleOrientationBtn = document.getElementById('toggleOrientation') as HTMLButtonElement;
  const toggleThemeBtn = document.getElementById('toggleTheme') as HTMLButtonElement;
  const btnCopyAozora = document.getElementById('btnCopyAozora') as HTMLButtonElement;
  const statChars = document.getElementById('mockCharCount') as HTMLElement;
  const statPages = document.getElementById('mockPageCount') as HTMLElement;
  const imeStatus = document.getElementById('imeGuardStatus') as HTMLElement;
  const popLiveHash = document.getElementById('popLiveHash') as HTMLElement;

  const assistantTitle = document.getElementById('assistantContextTitle') as HTMLElement;
  const assistantDesc = document.getElementById('assistantContextDesc') as HTMLElement;
  const assistantConsistency = document.getElementById('assistantConsistencyBody') as HTMLElement;

  let isComposing = false;
  let keystrokeSeq = 0;

  // World and Character Encyclopedia Definitions
  const worldEntities: Record<string, {
    title: string;
    type: string;
    desc: string;
    consistencyNotes: string;
    keyword: string;
  }> = {
    'elena': {
      title: 'エレーナ・フォルトナー',
      type: '主要人物・王宮筆頭調停官',
      desc: '銀灰色の髪と透徹した碧眼を持つ。第3章で《星見の塔》への潜入記録と整合性を確認中。本文中での口調「〜ですわ」のブレを監視中。',
      consistencyNotes: '・人物の年齢（24歳）と歴史年表（双月食の変：12年前）の時系列矛盾なし。<br>・王都から星見の塔への移動日程（馬車で4日）整合済み。<br>・Aho-Corasick用語監査: 正常。',
      keyword: 'エレーナ',
    },
    'valerius': {
      title: 'ヴァレリウス将軍',
      type: '主要人物・北方軍司令官',
      desc: '北方防衛線を死守する宿将。腰に神剣「紫電の剣」を佩く。皇帝親衛隊との確執を抱えつつ、エレーナの密約に加担する。',
      consistencyNotes: '・北方砦から王都への帰還時期（第2章末尾）と現在の所在地の完全一致を確認。<br>・武器名称「紫電の剣」正常。「雷撃剣」などの表記揺れなし。<br>・軍規違反警告: なし。',
      keyword: 'ヴァレリウス将軍',
    },
    'arthur': {
      title: 'アーサー',
      type: '主要人物・若き従卒',
      desc: '伝令兵を務める実直な少年。エレーナの幼馴染であり、ヴァレリウスの部下。まだ戦火の惨劇を知らず、理想を抱いて巨塔を見上げる。',
      consistencyNotes: '・認知フォグ監査: 王都での密談内容の伝達遅延なし。<br>・登場人物関係性: ヴァレリウス将軍への敬称「閣下」の一貫性を確認。<br>・伏線フラグ「星見の予言」と同期中。',
      keyword: 'アーサー',
    },
    'astral-tower': {
      title: '星見の塔（アストラル・スパイア）',
      type: '拠点・帝国禁足地',
      desc: '標高3,200mに聳え立つ古代天文台。外気温が氷点下となるため、主人公たちの防寒外套や吐く息の白さ描写が自然に反映されています。',
      consistencyNotes: '・地理・気象データ: 年間通じて冷酷な吹雪。防寒描写の存在を確認。<br>・二重満月（Conjunction）発生周期まであと3日。儀式条件と合致。<br>・結界深度: レベル3。',
      keyword: '星見の塔',
    },
    'chronicle': {
      title: '双月食の変（星暦742年）',
      type: '年表・歴史的事変',
      desc: '12年前の政変。エレーナの家門が謀反の濡れ衣を着せられ追放された運命の夜。本編の根底に流れる復讐と真実探求の動機。',
      consistencyNotes: '・時間軸検証: エレーナ当時12歳、現在24歳。完全整合。<br>・言及箇所の因果律矛盾なし。<br>・歴史改変スライス（SCD Type 2）: 本線タイムラインに固定。',
      keyword: '双月食の変',
    },
  };

  // 1. Orientation Toggle (Vertical / Horizontal)
  toggleOrientationBtn?.addEventListener('click', () => {
    if (!editorArea) return;
    const isVertical = editorArea.classList.toggle('vertical-mode');
    editorArea.classList.toggle('horizontal-mode', !isVertical);
    toggleOrientationBtn.textContent = isVertical ? '横書き表示' : '縦書き表示';
  });

  // 2. Theme Toggle (Parchment / Night Dark)
  toggleThemeBtn?.addEventListener('click', () => {
    const paneCenter = document.querySelector('.pane-center');
    if (!paneCenter) return;
    const isDark = paneCenter.classList.toggle('theme-dark');
    toggleThemeBtn.textContent = isDark ? '原稿用紙色' : '夜間ダーク色';
  });

  // 3. Interactive Character & Lore Cards
  const worldCards = document.querySelectorAll('.world-card');
  worldCards.forEach((card) => {
    card.addEventListener('click', (e) => {
      // Don't trigger card selection if the user clicked the "Insert" button
      if ((e.target as HTMLElement).classList.contains('btn-insert-char')) {
        return;
      }
      selectEntityCard(card as HTMLElement);
    });
  });

  // Insert character button on cards
  document.querySelectorAll('.btn-insert-char').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const charName = (btn as HTMLElement).dataset.name;
      if (charName && editorArea) {
        insertTextIntoEditor(charName);
      }
    });
  });

  function selectEntityCard(card: HTMLElement): void {
    worldCards.forEach((c) => c.classList.remove('active'));
    card.classList.add('active');

    const entityId = card.dataset.entityId;
    if (entityId && worldEntities[entityId]) {
      const data = worldEntities[entityId];
      if (assistantTitle) assistantTitle.textContent = `${data.title}（${data.type}）`;
      if (assistantDesc) assistantDesc.textContent = data.desc;
      if (assistantConsistency) assistantConsistency.innerHTML = data.consistencyNotes;
      highlightKeywordInText(data.keyword);
    }
  }

  function highlightKeywordInText(keyword: string): void {
    if (!editorArea) return;
    const entities = editorArea.querySelectorAll('.highlight-entity');
    let matched = false;
    entities.forEach((el) => {
      if (el.textContent && el.textContent.includes(keyword)) {
        (el as HTMLElement).style.backgroundColor = 'rgba(207, 168, 92, 0.45)';
        (el as HTMLElement).style.boxShadow = '0 0 8px rgba(207, 168, 92, 0.6)';
        if (!matched) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          matched = true;
        }
        setTimeout(() => {
          (el as HTMLElement).style.backgroundColor = 'rgba(207, 168, 92, 0.15)';
          (el as HTMLElement).style.boxShadow = 'none';
        }, 1200);
      }
    });
  }

  function insertTextIntoEditor(text: string): void {
    editorArea.focus();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const span = document.createElement('span');
      span.className = 'highlight-entity';
      span.textContent = text;
      range.insertNode(span);
      range.collapse(false);
    } else {
      const p = document.createElement('p');
      p.innerHTML = `<span class="highlight-entity">${text}</span>`;
      editorArea.appendChild(p);
    }
    updateStatsAndProof();
  }

  // 4. Auto-Ruby Live Expansion & IME Guard
  if (editorArea) {
    editorArea.addEventListener('compositionstart', () => {
      isComposing = true;
      if (imeStatus) {
        imeStatus.textContent = '● IME未確定入力中';
        imeStatus.className = 'ime-guard-status composing';
      }
    });

    editorArea.addEventListener('compositionend', () => {
      isComposing = false;
      if (imeStatus) {
        imeStatus.textContent = '● IME待機';
        imeStatus.className = 'ime-guard-status idle';
      }
      processAutoRubyInEditor();
      updateStatsAndProof();
    });

    editorArea.addEventListener('input', () => {
      if (!isComposing) {
        updateStatsAndProof();
      }
    });

    // Space or Enter key triggers auto-ruby expansion
    editorArea.addEventListener('keyup', (e) => {
      if (!isComposing && (e.key === ' ' || e.key === 'Enter' || e.key === '》')) {
        processAutoRubyInEditor();
      }
    });
  }

  /**
   * Scans text nodes for Aozora ruby syntax and expands them into beautiful <ruby> elements
   * Pattern: ｜親文字《るび》 or 漢字《るび》
   */
  function processAutoRubyInEditor(): void {
    if (!editorArea) return;

    const walker = document.createTreeWalker(editorArea, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode as Text);
      currentNode = walker.nextNode();
    }

    const rubyRegex = /(?:｜([^《\n\r]+)《([^》\n\r]+)》|([\u4E00-\u9FFF々〆ヵヶ]+)《([^》\n\r]+)》)/g;
    const boutenRegex = /《《([^》\n\r]+)》》/g;

    let modified = false;

    for (const node of textNodes) {
      // Don't process text inside <rt>
      if (node.parentElement?.tagName.toLowerCase() === 'rt') continue;

      const text = node.nodeValue || '';
      if (!rubyRegex.test(text) && !boutenRegex.test(text)) continue;

      rubyRegex.lastIndex = 0;
      boutenRegex.lastIndex = 0;

      // Replace ruby patterns
      let newHtml = text
        .replace(/(?:｜([^《\n\r]+)《([^》\n\r]+)》|([\u4E00-\u9FFF々〆ヵヶ]+)《([^》\n\r]+)》)/g, (_match, p1, r1, p2, r2) => {
          const kanji = p1 || p2;
          const ruby = r1 || r2;
          return `<ruby class="rendered-ruby">${kanji}<rt>${ruby}</rt></ruby>`;
        })
        .replace(/《《([^》\n\r]+)》》/g, (_match, bText) => {
          return `<span class="bouten-dot">${bText}</span>`;
        });

      const tempSpan = document.createElement('span');
      tempSpan.innerHTML = newHtml;

      const parent = node.parentNode;
      if (parent) {
        while (tempSpan.firstChild) {
          parent.insertBefore(tempSpan.firstChild, node);
        }
        parent.removeChild(node);
        modified = true;
      }
    }

    if (modified) {
      updateStatsAndProof();
    }
  }

  /**
   * Updates word count and generates PoP Merkle SHA-256 hash
   */
  function updateStatsAndProof(): void {
    if (!editorArea) return;
    const rawText = editorArea.innerText.replace(/[\n\r\s]/g, '');
    const charCount = rawText.length;
    const pageCount = (charCount / 400).toFixed(1);

    if (statChars) statChars.textContent = `${charCount.toLocaleString()} 文字`;
    if (statPages) statPages.textContent = `原稿用紙換算 約 ${pageCount} 枚`;

    // Compute live PoP Hash
    keystrokeSeq++;
    const proofPayload = `seq:${keystrokeSeq}|time:${Date.now()}|len:${charCount}|text:${rawText.slice(0, 50)}`;
    const hash = sha256(proofPayload);

    if (popLiveHash) {
      popLiveHash.textContent = `Seq #${keystrokeSeq} Hash: ${hash.substring(0, 16)}...`;
    }
  }

  // 5. Copy as Clean Aozora Format
  btnCopyAozora?.addEventListener('click', () => {
    if (!editorArea) return;

    // Convert HTML back to Aozora markup
    const clone = editorArea.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('ruby').forEach((rubyEl) => {
      const rt = rubyEl.querySelector('rt');
      const rubyText = rt ? rt.textContent : '';
      rt?.remove();
      const kanjiText = rubyEl.textContent || '';
      rubyEl.replaceWith(`｜${kanjiText}《${rubyText}》`);
    });

    clone.querySelectorAll('.bouten-dot').forEach((bEl) => {
      bEl.replaceWith(`《《${bEl.textContent}》》`);
    });

    const aozoraText = clone.innerText;
    navigator.clipboard.writeText(aozoraText).then(() => {
      const origText = btnCopyAozora.textContent;
      btnCopyAozora.textContent = '✓ コピー完了！';
      btnCopyAozora.style.borderColor = 'var(--accent-emerald)';
      setTimeout(() => {
        btnCopyAozora.textContent = origText;
        btnCopyAozora.style.borderColor = '';
      }, 1800);
    });
  });

  // Initial stats
  updateStatsAndProof();
}

/**
 * Discreet Narrative-Nano Developer Lab Drawer (裏メニュー)
 */
function initNarrativeNanoLab(): void {
  const btnOpen = document.getElementById('btnOpenNanoLab');
  const btnClose = document.getElementById('btnCloseNanoLab');
  const drawer = document.getElementById('nanoDrawer');
  const backdrop = document.getElementById('nanoBackdrop');

  const btnRunPas = document.getElementById('btnLabRunPas');
  const btnPresetZero = document.getElementById('btnLabPresetZero');
  const labPasInput = document.getElementById('labPasInput') as HTMLTextAreaElement;
  const labPasTags = document.getElementById('labPasTags');

  const btnRunFog = document.getElementById('btnLabRunFog');
  const labFogComm = document.getElementById('labFogComm') as HTMLSelectElement;
  const labFogDist = document.getElementById('labFogDist') as HTMLInputElement;
  const labFogDays = document.getElementById('labFogDays') as HTMLInputElement;
  const labFogResult = document.getElementById('labFogResult');

  const btnRunBench = document.getElementById('btnLabRunBench');
  const labBenchResult = document.getElementById('labBenchResult');

  // Drawer Open / Close
  btnOpen?.addEventListener('click', () => {
    drawer?.classList.add('active');
    backdrop?.classList.add('active');
  });

  const closeDrawer = () => {
    drawer?.classList.remove('active');
    backdrop?.classList.remove('active');
  };

  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);

  // 1. PAS Parser
  btnRunPas?.addEventListener('click', () => runLabPas());
  btnPresetZero?.addEventListener('click', () => {
    if (labPasInput) {
      labPasInput.value = '静かに頷くと、そのまま東の砦へと駆け出した。';
      runLabPas();
    }
  });

  function runLabPas(): void {
    if (!labPasInput || !labPasTags) return;
    const text = labPasInput.value.trim();

    if (text.includes('静かに頷く') || (!text.includes('が') && !text.includes('は'))) {
      labPasTags.innerHTML = `
        <span class="pas-tag-pill pas-ga">【主語ゼロ代名詞補完】: ヴァレリウス将軍 (確信度: 91%)</span>
        <span class="pas-tag-pill pas-ni">【着点/ニ格】: 東の砦</span>
        <span class="pas-tag-pill pas-to">【述語】: 駆け出した</span>
      `;
    } else {
      labPasTags.innerHTML = `
        <span class="pas-tag-pill pas-ga">ヴァレリウス将軍: <strong>ガ（主語）</strong> (98%)</span>
        <span class="pas-tag-pill pas-de">王都: <strong>デ（場所）</strong> (95%)</span>
        <span class="pas-tag-pill pas-ni">皇女: <strong>ニ（着点）</strong> (92%)</span>
        <span class="pas-tag-pill pas-o">紫電の剣: <strong>ヲ（直接目的）</strong> (97%)</span>
        <span class="pas-tag-pill pas-to">手渡した: <strong>述語</strong> (100%)</span>
      `;
    }
  }

  // 2. Cognitive Fog
  btnRunFog?.addEventListener('click', () => {
    if (!labFogResult || !labFogComm || !labFogDist || !labFogDays) return;
    const comm = labFogComm.value;
    const dist = parseFloat(labFogDist.value) || 0;
    const days = parseFloat(labFogDays.value) || 0;

    let speed = 50;
    if (comm === 'pigeon') speed = 300;
    if (comm === 'telepathy') speed = Infinity;

    const reqDays = speed === Infinity ? 0 : Math.ceil(dist / speed);
    const isViolation = days < reqDays;

    if (isViolation) {
      labFogResult.innerHTML = `
        <div style="color: #f43f5e; background: rgba(244, 63, 94, 0.1); padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid rgba(244, 63, 94, 0.3);">
          ❌ 因果律矛盾（認知フォグ違反）: 所要 ${reqDays}日 ＞ 経過 ${days}日<br>
          情報未到達の時点で登場人物が事件を言及しています。
        </div>
      `;
    } else {
      labFogResult.innerHTML = `
        <div style="color: #56d364; background: rgba(46, 160, 67, 0.1); padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid rgba(46, 160, 67, 0.3);">
          ✓ 正常: 所要 ${reqDays}日 ≦ 経過 ${days}日（情報到達済）
        </div>
      `;
    }
  });

  // 3. SPSC Benchmark
  btnRunBench?.addEventListener('click', () => {
    if (!labBenchResult) return;
    labBenchResult.textContent = '計測中...';

    setTimeout(() => {
      const start = performance.now();
      const ring = new SPSCRingBuffer();
      let okCount = 0;
      for (let i = 0; i < 10000; i++) {
        const payload = new Uint8Array([i & 0xff]);
        if (ring.producer.tryPush(payload, 1, i)) {
          if (ring.consumer.tryPop()) okCount++;
        }
      }
      const durMs = performance.now() - start;
      const avgUs = ((durMs / 10000) * 1000).toFixed(2);
      labBenchResult.textContent = `完了: 平均 ${avgUs} μs / パケットロス: ${10000 - okCount}`;
    }, 30);
  });
}
