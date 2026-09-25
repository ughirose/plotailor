/**
 * Plotailor - 作家向けインタラクティブスクリプト (main.js)
 * 縦書き/横書き切り替え、世界観ピン連動、ヘルプ検索、FAQアコーディオン、βテストモーダル
 */

document.addEventListener('DOMContentLoaded', () => {
  initEditorMock();
  initBetaModal();
  initHelpSearch();
  initFaqAccordion();
});

/**
 * 3ペインエディタモックのインタラクティブ制御
 */
function initEditorMock() {
  const toggleOrientationBtn = document.getElementById('toggleOrientation');
  const toggleThemeBtn = document.getElementById('toggleTheme');
  const editorArea = document.getElementById('editorContentArea');
  const worldCards = document.querySelectorAll('.world-card');
  const assistantTitle = document.getElementById('assistantContextTitle');
  const assistantDesc = document.getElementById('assistantContextDesc');
  const statChars = document.getElementById('mockCharCount');
  const statPages = document.getElementById('mockPageCount');

  // 世界観データの定義
  const worldData = {
    'elena': {
      title: 'エレーナ・フォルトナー',
      type: '人物・王宮筆頭調停官',
      desc: '銀灰色の髪と透徹した碧眼を持つ。第3章で《星見の塔》への潜入記録と整合性を確認中。本文中での口調「〜ですわ」のブレを検知中。',
      highlightWord: 'エレーナ'
    },
    'astral-tower': {
      title: '星見の塔（アストラル・スパイア）',
      type: '拠点・帝国禁足地',
      desc: '標高3,200mに築かれた古代天文台。外気温が氷点下となるため、主人公たちの「防寒外套」の描写が自然に反映されています。',
      highlightWord: '星見の塔'
    },
    'chronicle': {
      title: '星暦742年・双月食の変',
      type: '年表・歴史的事変',
      desc: '12年前の政変。エレーナの父が失脚した事件。現在の登場人物の年齢（24歳）と歴史的時間軸の完全な一致を確認済み。',
      highlightWord: '双月食の変'
    }
  };

  // 1. 縦書き / 横書き 切り替え
  if (toggleOrientationBtn && editorArea) {
    toggleOrientationBtn.addEventListener('click', () => {
      const isVertical = editorArea.classList.toggle('vertical-mode');
      editorArea.classList.toggle('horizontal-mode', !isVertical);
      toggleOrientationBtn.textContent = isVertical ? '横書き表示' : '縦書き表示';
    });
  }

  // 2. 原稿用紙 / 夜間執筆テーマ切り替え
  if (toggleThemeBtn && editorArea) {
    const paneCenter = document.querySelector('.pane-center');
    toggleThemeBtn.addEventListener('click', () => {
      const isDark = paneCenter.classList.toggle('theme-dark');
      toggleThemeBtn.textContent = isDark ? '原稿用紙色' : '夜間ダーク色';
    });
  }

  // 3. 世界観カードの選択と推敲アシスタントの連動
  worldCards.forEach(card => {
    card.addEventListener('click', () => {
      worldCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      const cardId = card.dataset.entityId;
      const data = worldData[cardId];
      if (data && assistantTitle && assistantDesc) {
        assistantTitle.textContent = `${data.title}（${data.type}）`;
        assistantDesc.textContent = data.desc;
        highlightText(data.highlightWord);
      }
    });
  });

  // 本文中のハイライト処理
  function highlightText(word) {
    if (!editorArea) return;
    const entities = editorArea.querySelectorAll('.highlight-entity');
    entities.forEach(el => {
      if (el.textContent.includes(word)) {
        el.style.backgroundColor = 'rgba(207, 168, 92, 0.45)';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        setTimeout(() => {
          el.style.backgroundColor = 'rgba(207, 168, 92, 0.15)';
        }, 1200);
      }
    });
  }

  // 文字数カウント & 原稿用紙換算（400字詰）
  if (editorArea && statChars && statPages) {
    const updateStats = () => {
      const text = editorArea.innerText.replace(/[\n\r\s]/g, '');
      const count = text.length;
      const pages = (count / 400).toFixed(1);
      statChars.textContent = `${count.toLocaleString()} 文字`;
      statPages.textContent = `原稿用紙換算 約 ${pages} 枚`;
    };
    updateStats();
  }
}

/**
 * 先行クローズドβテスト参加モーダル制御
 */
function initBetaModal() {
  const openButtons = document.querySelectorAll('.js-open-beta-modal');
  const closeButton = document.getElementById('closeBetaModal');
  const modalOverlay = document.getElementById('betaModal');
  const betaForm = document.getElementById('betaSignupForm');
  const formSuccess = document.getElementById('betaFormSuccess');

  if (!modalOverlay) return;

  const openModal = () => {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  openButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  if (closeButton) {
    closeButton.addEventListener('click', closeModal);
  }

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeModal();
    }
  });

  // フォーム送信シミュレーション
  if (betaForm) {
    betaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = betaForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '登録中...';
      }

      setTimeout(() => {
        betaForm.style.display = 'none';
        if (formSuccess) formSuccess.style.display = 'block';
      }, 700);
    });
  }
}

/**
 * ヘルプポータル (help.html) のリアルタイム絞り込み検索 & カテゴリフィルター
 */
function initHelpSearch() {
  const searchInput = document.getElementById('helpSearchInput');
  const articles = document.querySelectorAll('.guide-article');
  const categoryButtons = document.querySelectorAll('.category-btn');
  const noResultBox = document.getElementById('helpNoResults');

  if (!searchInput && categoryButtons.length === 0) return;

  function filterGuides() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const activeCategoryBtn = document.querySelector('.category-btn.active');
    const selectedCategory = activeCategoryBtn ? activeCategoryBtn.dataset.category : 'all';

    let matchCount = 0;

    articles.forEach(article => {
      const category = article.dataset.category || '';
      const text = article.innerText.toLowerCase();
      const matchesCategory = (selectedCategory === 'all' || category === selectedCategory);
      const matchesQuery = query === '' || text.includes(query);

      if (matchesCategory && matchesQuery) {
        article.style.display = 'block';
        matchCount++;
      } else {
        article.style.display = 'none';
      }
    });

    if (noResultBox) {
      noResultBox.style.display = matchCount === 0 ? 'block' : 'none';
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterGuides);
  }

  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterGuides();
    });
  });
}

/**
 * FAQアコーディオン開閉
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (question) {
      question.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        // 他のFAQを閉じる場合はここで処理
        item.classList.toggle('open', !isOpen);
      });
    }
  });
}
