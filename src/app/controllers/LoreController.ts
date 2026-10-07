import type { EditorView } from '@codemirror/view';
import { showInlineConfirm } from '../InlineDialog.js';
import {
  LoreEntityManager,
  type LoreCategory,
} from '../../core/lore/LoreEntityManager.js';
import { CausalDagEngine } from '../../core/causality/CausalDagEngine.js';
import { LoreInspectorDock } from '../../ui/LoreInspectorDock.js';
import { NarrativeInspectorDock } from '../../ui/NarrativeInspectorDock.js';
import { DualTrackTimelineEngine, type TimelineSceneInput } from '../../core/timeline/DualTrackTimeline.js';
import {
  calculateManualScore,
  reconcileEntityLifecycles,
  findShelvedCandidates,
} from '../../core/lore/ShelvedLoreLifecycle.js';
import { StrayLoreEngine } from '../../core/lore/StrayLoreEngine.js';
import { CharacterEmotionalArcTracker } from '../../core/editor/CharacterEmotionalArcTracker.js';
import { CharacterInteractionMatrix } from '../../core/editor/CharacterInteractionMatrix.js';
import {
  CausalTimelineSyncEngine,
  type CausalNodeInput,
  type CausalEdgeInput,
  type ConflictDetail,
  type JumpAnchor,
  type SyncAnalysisResult,
} from '../../core/editor/CausalTimelineSyncEngine.js';
import type { ChapterData } from './ExportController.js';

export interface LoreControllerDependencies {
  getLoreManager: () => LoreEntityManager;
  getLoreDock: () => LoreInspectorDock;
  getDagEngine: () => CausalDagEngine;
  getTimelineEngine: () => DualTrackTimelineEngine;
  getNarrativeDock: () => NarrativeInspectorDock;
  getPrhRules?: () => import('@worldcraft/schema').PlotailorPrhRule[];
  getEditorView: () => EditorView | null;
  getCurrentProjectId: () => string;
  getActiveLeftTab: () => string;
  setActiveLeftTab: (tab: string) => void;
  getActiveRightTab: () => string;
  setActiveRightTab: (tab: string) => void;
  getActiveLoreFilter: () => LoreCategory | 'all' | 'shelved';
  setActiveLoreFilter: (filter: LoreCategory | 'all' | 'shelved') => void;
  getChapters: () => ChapterData[];
  loadChapter: (id: string) => void;
  getCurrentChapterId: () => string;
  getChapterSnapshots: () => Map<string, Array<any>>;
  getWorkTitle: () => string;
  getKeystrokeCount: () => number;
  exportPoPCertificate: () => void;
  addNewChapter: () => void;
  loadChapterBySelect: (id: string) => void;
  renameChapter: (id: string, title: string) => void;
  deleteChapter: (id: string) => void;
  reorderChapters: (from: number, to: number) => void;
  updateMultiLayerDecorations: () => void;
  showToast: (msg: string) => void;
  jumpToPosition?: (chapterId: string, line: number, offset: number) => void;
}

export type LoreChangeListener = (action: 'create' | 'update' | 'delete' | 'shelve' | 'promote', entityId?: string) => void;

export class LoreController {
  private deps: LoreControllerDependencies;
  private changeListeners: LoreChangeListener[] = [];
  private strayEngine = new StrayLoreEngine();
  private lastSyncEngine: CausalTimelineSyncEngine | null = null;

  constructor(deps: LoreControllerDependencies) {
    this.deps = deps;
  }

  public getCausalSyncEngine(): CausalTimelineSyncEngine | null {
    return this.lastSyncEngine;
  }

  public getStrayLoreEngine(): StrayLoreEngine {
    return this.strayEngine;
  }

  public registerLoreChangeListener(listener: LoreChangeListener): void {
    this.changeListeners.push(listener);
  }

  private notifyChange(action: 'create' | 'update' | 'delete' | 'shelve' | 'promote', entityId?: string): void {
    for (const listener of this.changeListeners) {
      listener(action, entityId);
    }
  }

  public renderTimelineSvg(): string {
    const chapters = this.deps.getChapters();
    const timelineEngine = this.deps.getTimelineEngine();
    const scenes: TimelineSceneInput[] = chapters.map((ch, idx) => ({
      id: ch.id,
      chapterId: ch.id,
      title: ch.title,
      charCount: Math.max(100, ch.charCount || ch.content.length),
      storyDayStart: idx === 1 ? 10 : (idx === 0 ? 100 : 250),
      storyDayEnd: idx === 1 ? 12 : (idx === 0 ? 102 : 255),
      foreshadowingRef: idx === 0
        ? { type: 'plant', foreshadowingId: 'fore-omen' }
        : idx === 2
        ? { type: 'resolve', foreshadowingId: 'fore-omen' }
        : undefined,
    }));

    timelineEngine.setScenes(scenes);
    return timelineEngine.renderSvg();
  }

  public renderLeftPane(): void {
    const container = document.getElementById('leftPaneContent');
    if (!container) return;

    const activeLeftTab = this.deps.getActiveLeftTab();
    const chapters = this.deps.getChapters();
    const currentChapterId = this.deps.getCurrentChapterId();

    if (activeLeftTab === 'toc') {
      container.innerHTML = `
        <div class="nav-section-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>章一覧・構成</span>
          <span style="font-size: 11px; color: var(--color-text-dim);">ドラッグで並び替え</span>
        </div>
        <div id="chapterListDndContainer">
          ${chapters.map((ch, idx) => `
            <div class="chapter-item ${ch.id === currentChapterId ? 'active' : ''}" data-id="${ch.id}" data-index="${idx}" draggable="true">
              <span class="chapter-drag-handle" title="ドラッグして並び替え">⋮⋮</span>
              <div class="chapter-title-wrapper" title="ダブルクリックして章名を変更">
                <span class="chapter-title-text">${ch.title}</span>
              </div>
              <span class="chapter-char-count">${ch.charCount.toLocaleString()} 字</span>
              <button class="chapter-rename-btn" data-id="${ch.id}" title="章名を変更" style="background: transparent; border: none; font-size: 11px; cursor: pointer; color: var(--color-text-dim); padding: 1px 3px;">✏️</button>
              ${chapters.length > 1 ? `<button class="chapter-delete-btn" data-id="${ch.id}" title="章を削除">✕</button>` : ''}
            </div>
          `).join('')}
        </div>
        <button class="ide-btn" style="width: 100%; margin-top: 12px; justify-content: center;" id="btnNewChapter">
          ＋ 新規章を追加
        </button>
      `;

      let draggedIdx: number | null = null;
      const items = container.querySelectorAll('.chapter-item');

      items.forEach((item) => {
        const el = item as HTMLElement;

        el.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.chapter-delete-btn') || (e.target as HTMLElement).closest('.chapter-rename-btn') || (e.target as HTMLElement).tagName === 'INPUT') {
            return;
          }
          const id = el.dataset.id;
          if (id) this.deps.loadChapterBySelect(id);
        });

        const titleWrapper = el.querySelector('.chapter-title-wrapper');
        const startRename = (e: Event) => {
          e.stopPropagation();
          const titleTextEl = titleWrapper?.querySelector('.chapter-title-text') as HTMLElement | null;
          if (!titleTextEl || !titleWrapper) return;
          const currentTitle = titleTextEl.textContent || '';

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'chapter-rename-input';
          input.value = currentTitle;
          input.style.cssText = 'width: 100%; font-size: 13px; background: rgba(0,0,0,0.5); border: 1px solid var(--color-gold); color: var(--color-text); padding: 1px 4px; border-radius: 3px; outline: none;';

          titleWrapper.innerHTML = '';
          titleWrapper.appendChild(input);
          input.focus();
          input.select();

          const finishRename = () => {
            const nextTitle = input.value.trim();
            const id = el.dataset.id;
            if (id && nextTitle && nextTitle !== currentTitle) {
              this.deps.renameChapter(id, nextTitle);
            } else {
              this.renderLeftPane();
            }
          };

          input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') {
              ke.preventDefault();
              finishRename();
            } else if (ke.key === 'Escape') {
              this.renderLeftPane();
            }
          });
          input.addEventListener('blur', finishRename);
        };

        titleWrapper?.addEventListener('dblclick', startRename);
        const btnRename = el.querySelector('.chapter-rename-btn');
        btnRename?.addEventListener('click', startRename);

        const btnDel = el.querySelector('.chapter-delete-btn');
        btnDel?.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) this.deps.deleteChapter(id);
        });

        el.addEventListener('dragstart', (e) => {
          draggedIdx = parseInt(el.dataset.index || '0', 10);
          el.classList.add('dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', el.dataset.id || '');
          }
        });

        el.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

          const rect = el.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            el.classList.add('drag-over-top');
            el.classList.remove('drag-over-bottom');
          } else {
            el.classList.add('drag-over-bottom');
            el.classList.remove('drag-over-top');
          }
        });

        el.addEventListener('dragleave', () => {
          el.classList.remove('drag-over-top');
          el.classList.remove('drag-over-bottom');
        });

        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('drag-over-top');
          el.classList.remove('drag-over-bottom');

          if (draggedIdx === null) return;
          const targetIdx = parseInt(el.dataset.index || '0', 10);
          const rect = el.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const insertIdx = e.clientY < midY ? targetIdx : targetIdx;

          if (draggedIdx !== insertIdx) {
            this.deps.reorderChapters(draggedIdx, insertIdx);
          }
        });

        el.addEventListener('dragend', () => {
          el.classList.remove('dragging');
          items.forEach((it) => {
            it.classList.remove('drag-over-top');
            it.classList.remove('drag-over-bottom');
          });
          draggedIdx = null;
        });
      });

      const btnNew = container.querySelector('#btnNewChapter');
      btnNew?.addEventListener('click', () => this.deps.addNewChapter());
    } else if (activeLeftTab === 'lore') {
      const loreManager = this.deps.getLoreManager();
      const allEntities = loreManager.getEntities();
      const activeLoreFilter = this.deps.getActiveLoreFilter();

      let filtered = allEntities;
      if (activeLoreFilter === 'shelved') {
        filtered = allEntities.filter((e) => e.status === 'shelved');
      } else if (activeLoreFilter !== 'all') {
        filtered = loreManager.getEntities(activeLoreFilter).filter((e) => e.status !== 'shelved');
      }

      const counts = {
        all: allEntities.length,
        character: allEntities.filter((e) => e.category === 'character' && e.status !== 'shelved').length,
        term: allEntities.filter((e) => e.category === 'term' && e.status !== 'shelved').length,
        item: allEntities.filter((e) => e.category === 'item' && e.status !== 'shelved').length,
        foreshadowing: allEntities.filter((e) => e.category === 'foreshadowing' && e.status !== 'shelved').length,
        location: allEntities.filter((e) => e.category === 'location' && e.status !== 'shelved').length,
        shelved: allEntities.filter((e) => e.status === 'shelved').length,
      };

      const getCategoryLabel = (cat: string) => {
        switch (cat) {
          case 'character': return '登場人物';
          case 'term': return '重要用語';
          case 'item': return 'アイテム';
          case 'foreshadowing': return '伏線';
          case 'location': return '拠点・地名';
          default: return cat;
        }
      };

      container.innerHTML = `
        <div class="nav-section-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>世界観・設定資料</span>
          <button class="ide-btn btn-primary" id="btnOpenNewLoreModal" style="font-size: 11px; padding: 2px 7px;">＋ 追加</button>
        </div>

        <div class="lore-filter-bar">
          <button class="lore-filter-chip ${activeLoreFilter === 'all' ? 'active' : ''}" data-cat="all">全て (${counts.all})</button>
          <button class="lore-filter-chip ${activeLoreFilter === 'character' ? 'active' : ''}" data-cat="character">人物 (${counts.character})</button>
          <button class="lore-filter-chip ${activeLoreFilter === 'term' ? 'active' : ''}" data-cat="term">用語 (${counts.term})</button>
          <button class="lore-filter-chip ${activeLoreFilter === 'item' ? 'active' : ''}" data-cat="item">武具 (${counts.item})</button>
          <button class="lore-filter-chip ${activeLoreFilter === 'foreshadowing' ? 'active' : ''}" data-cat="foreshadowing">伏線 (${counts.foreshadowing})</button>
          <button class="lore-filter-chip ${activeLoreFilter === 'location' ? 'active' : ''}" data-cat="location">拠点 (${counts.location})</button>
          <button class="lore-filter-chip ${activeLoreFilter === 'shelved' ? 'active' : ''}" data-cat="shelved" style="border-color: rgba(168,85,247,0.4); color: #c084fc;">未配置 (${counts.shelved})</button>
        </div>

        <div id="loreCardList">
          ${filtered.length === 0 ? `<div style="font-size: 12px; color: var(--color-text-dim); text-align: center; padding: 20px;">該当する設定項目がありません</div>` : ''}
          ${filtered.map((ent) => {
            const score = calculateManualScore(ent);
            const isShelved = ent.status === 'shelved';
            return `
            <div class="lore-card" data-id="${ent.id}">
              <div class="lore-card-header">
                <span class="lore-card-title">${ent.name}</span>
                <span style="display: flex; gap: 4px; align-items: center;">
                  <span class="score-badge ${isShelved ? 'shelved' : ''}">S: ${score}</span>
                  <span class="lore-badge cat-${ent.category}">${getCategoryLabel(ent.category)}</span>
                </span>
              </div>
              ${ent.role ? `<div class="lore-card-role">${ent.role} ${ent.status ? `<span style="opacity: 0.7; font-size: 10px;">[${ent.status}]</span>` : ''}</div>` : ''}
              <div class="lore-card-desc">${ent.description}</div>
              <div class="lore-card-actions">
                ${isShelved ? `<button class="ide-btn btn-promote-lore" data-id="${ent.id}">＋ 本文へ再配置 (Alt+P)</button>` : ''}
                <button class="ide-btn btn-insert-lore" data-name="${ent.name}" style="font-size: 10px; padding: 2px 6px;">＋ 挿入</button>
                <button class="ide-btn btn-edit-lore" data-id="${ent.id}" style="font-size: 10px; padding: 2px 6px;">✏️ 編集</button>
                <button class="ide-btn btn-delete-lore" data-id="${ent.id}" style="font-size: 10px; padding: 2px 6px; color: var(--color-danger);">✕</button>
              </div>
            </div>
            `;
          }).join('')}
        </div>
      `;

      container.querySelectorAll('.lore-filter-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          const cat = (e.currentTarget as HTMLElement).dataset.cat as LoreCategory | 'all' | 'shelved';
          this.deps.setActiveLoreFilter(cat || 'all');
          this.renderLeftPane();
        });
      });

      container.querySelectorAll('.btn-promote-lore').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) this.promoteShelvedLore(id);
        });
      });

      container.querySelector('#btnOpenNewLoreModal')?.addEventListener('click', () => {
        this.openLoreModal();
      });

      container.querySelectorAll('.btn-edit-lore').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) this.openLoreModal(id);
        });
      });

      container.querySelectorAll('.btn-insert-lore').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = (e.currentTarget as HTMLElement).dataset.name;
          const cm = this.deps.getEditorView();
          if (name && cm) {
            const pos = cm.state.selection.main.head;
            cm.dispatch({
              changes: { from: pos, insert: name },
              selection: { anchor: pos + name.length },
            });
            this.deps.showToast(`📥 本文に「${name}」を挿入しました`);
          }
        });
      });

      container.querySelectorAll('.btn-delete-lore').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) {
            const confirmed = await showInlineConfirm({
              message: 'この設定項目を削除してもよろしいですか？',
              destructive: true,
              confirmText: '削除',
            });
            if (confirmed) {
              this.deleteLore(id);
            }
          }
        });
      });

      container.querySelectorAll('.lore-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const id = (card as HTMLElement).dataset.id;
          if (id) this.openLoreModal(id);
        });
      });
    } else if (activeLeftTab === 'timeline') {
      container.innerHTML = `
        <div class="nav-section-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>デュアル軸タイムライン (Sjuzhet / Fabula)</span>
          <span style="font-size: 10px; color: var(--color-gold);">三次ベジェスプライン</span>
        </div>
        <div class="dual-track-container" id="dualTrackContainer">
          ${this.renderTimelineSvg()}
        </div>
        <div class="dock-card" style="margin-top: 10px;">
          <div class="dock-card-title">🌙 帝国星辰暦 742年</div>
          <div class="dock-card-body">
            現在の日付: 第4月 14日（絶対日: 2,450）<br>
            第一衛星月相: 満月（1.00） | 第二衛星月相: 満月（0.98）<br>
            <strong style="color: var(--color-gold);">✦ 今夜: 二重満月合（Conjunction）</strong>
          </div>
        </div>
      `;

      container.querySelectorAll('.timeline-node').forEach((node) => {
        node.addEventListener('click', () => {
          const sId = (node as HTMLElement).dataset.sceneId;
          if (sId) this.deps.loadChapterBySelect(sId);
        });
      });
    }
  }

  public renderRightPane(): void {
    const container = document.getElementById('dockContent');
    if (!container) return;

    const activeRightTab = this.deps.getActiveRightTab();
    const rightTabBtns = document.querySelectorAll('.pane-right .pane-tab-btn');
    rightTabBtns.forEach((b) => {
      const btn = b as HTMLElement;
      if (btn.dataset.dockTab === activeRightTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (activeRightTab === 'linter') {
      const narrativeDock = this.deps.getNarrativeDock();
      if (this.deps.getPrhRules) {
        narrativeDock.updatePrhRules(this.deps.getPrhRules());
      }
      const dagEngine = this.deps.getDagEngine();
      const cycleReport = dagEngine.detectCycles();
      const loreManager = this.deps.getLoreManager();
      const cm = this.deps.getEditorView();
      const currentDocText = cm ? cm.state.doc.toString() : '';
      const currentChapterId = this.deps.getCurrentChapterId();
      const allChapters = this.deps.getChapters();

      // Concatenate text from all chapters, using the current live editor text for the active chapter
      const fullManuscriptText = allChapters
        .map((ch) => (ch.id === currentChapterId ? currentDocText : ch.content))
        .join('\n');

      const allEntities = loreManager.getEntities();
      const { strayLores } = this.strayEngine.scanAndReconcile(fullManuscriptText, allEntities, {
        isCommitted: false,
        provenanceBlockId: currentChapterId,
      });
      narrativeDock.updateContinuityState({
        dagCycleReport: cycleReport,
        strayLoreItems: strayLores,
      });
      container.innerHTML = narrativeDock.renderHTML();
      narrativeDock.bindEvents(container);
    } else if (activeRightTab === 'lore') {

      const cm = this.deps.getEditorView();
      const docText = cm ? cm.state.doc.toString() : '';
      const cursorPos = cm ? cm.state.selection.main.head : 0;
      const loreDock = this.deps.getLoreDock();

      const occurrences = loreDock.extractOccurrences({
        from: 0,
        to: docText.length,
        text: docText,
        cursorPos,
      });

      container.innerHTML = loreDock.renderInlinePanelHTML(occurrences);

      container.querySelectorAll('.btn-quick-replace').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const termId = (e.currentTarget as HTMLElement).dataset.termId;
          const occ = occurrences.find((o) => o.termId === termId);
          if (occ) loreDock.handleQuickReplace(occ);
        });
      });

      container.querySelectorAll('.btn-shelve').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const termId = (e.currentTarget as HTMLElement).dataset.termId;
          if (termId) loreDock.handleShelveItem(termId);
        });
      });

      container.querySelectorAll('.btn-unshelve').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const termId = (e.currentTarget as HTMLElement).dataset.termId;
          if (termId) loreDock.handleUnshelveItem(termId);
        });
      });

      container.querySelectorAll('[data-action="toggle"]').forEach((header) => {
        header.addEventListener('click', (e) => {
          const target = (e.currentTarget as HTMLElement).dataset.target;
          if (target) {
            loreDock.togglePanel(target);
            this.renderRightPane();
          }
        });
      });
    } else if (activeRightTab === 'causality') {
      const loreEntities = this.deps.getLoreManager().getEntities();
      const chapters = this.deps.getChapters();
      const dagEngine = this.deps.getDagEngine();
      dagEngine.populateFromLore(loreEntities);
      const cycleReport = dagEngine.detectCycles();
      const nodes = dagEngine.getNodes();
      const edges = dagEngine.getEdges();
      const isVirtualized = nodes.length >= 8;

      // Build CausalNodeInputs & CausalEdgeInputs for CausalTimelineSyncEngine
      const causalNodes: CausalNodeInput[] = nodes.map((n, idx) => {
        const ent = loreEntities.find((e) => e.id === n.id);
        const chapterIdx = Math.min(Math.max(0, chapters.length - 1), idx % Math.max(1, chapters.length));
        const ch = chapters[chapterIdx] || { id: 'ch1', title: '第1章' };
        return {
          id: n.id,
          label: n.label,
          chapterId: ch.id,
          chapterIndex: chapterIdx,
          chapterTitle: ch.title,
          lineNumber: (idx * 3) + 1,
          charOffset: idx * 25,
          storyDay: (idx + 1) * 10,
          discourseRatio: (idx + 1) / Math.max(1, nodes.length),
          isForeshadowing: ent?.category === 'foreshadowing',
        };
      });

      const causalEdges: CausalEdgeInput[] = edges.map((e) => ({
        fromId: e.fromId,
        toId: e.toId,
        relationType: 'causes',
      }));

      const syncEngine = new CausalTimelineSyncEngine(causalNodes, causalEdges);
      this.lastSyncEngine = syncEngine;
      const syncResult = syncEngine.analyzeAndSynchronize(Math.max(0, chapters.length - 1));
      const conflictMap = new Map<string, ConflictDetail>();
      for (const conf of syncResult.conflicts) {
        conflictMap.set(conf.nodeId, conf);
      }

      const initialViewport = { scrollTop: 0, scrollLeft: 0, viewportWidth: 340, viewportHeight: 280, overscan: 80 };
      const svgHtml = isVirtualized
        ? dagEngine.renderVirtualizedSvgGraph(initialViewport)
        : dagEngine.renderSvgGraph(340, 280);

      const hasConflict = syncResult.conflicts.length > 0;

      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🕸 因果DAG・タイムライン同期</span>
            <span style="font-size: 11px; color: ${hasConflict ? '#ef4444' : 'var(--color-success)'}; font-weight: bold;">
              ${hasConflict ? `🚨 矛盾検出 (${syncResult.conflicts.length})` : '✓ 正常 (Valid DAG)'}
            </span>
          </div>
          <div class="dock-card-body" style="padding-bottom: 4px;">
            <div style="font-size: 11px; color: var(--color-text-dim); display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>登録ノード: <strong>${nodes.length}</strong></span>
              <span>有向エッジ: <strong>${edges.length}</strong></span>
              <span style="color: ${hasConflict ? '#ef4444' : 'var(--color-gold)'};"><strong>${hasConflict ? '矛盾ハイライト中' : (isVirtualized ? '⚡ 仮想カリングON' : '通常描画')}</strong></span>
            </div>
            ${hasConflict ? `
              <div class="causal-conflicts-banner" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; font-size: 11px;">
                <div style="color: #ef4444; font-weight: bold; margin-bottom: 2px;">⚠️ 因果ループ・時間矛盾を検出しました:</div>
                ${syncResult.conflicts.map((c) => {
                  const anc = c.anchor || syncResult.jumpAnchors.get(c.nodeId);
                  return `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px;">
                      <span style="color: #1f2937;">・${c.description}</span>
                      ${anc ? `
                        <button class="btn-jump-conflict-banner" data-node-id="${anc.nodeId}" style="padding: 1px 6px; font-size: 10px; background: #ef4444; color: #fff; border: none; border-radius: 2px; cursor: pointer;">
                          第${anc.chapterIndex + 1}章へジャンプ
                        </button>
                      ` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}
            <div class="dag-wrapper" id="dagSvgContainer" style="max-height: 320px; overflow: auto; position: relative;">
              ${svgHtml}
            </div>
            <div style="margin-top: 8px; font-size: 10.5px; color: var(--color-text-dim); line-height: 1.5;">
              <span style="color: #58a6ff;">■ 人物</span> &nbsp;
              <span style="color: #e3b341;">■ 用語</span> &nbsp;
              <span style="color: #bc8cff;">■ 伏線</span> &nbsp;
              <span style="color: #56d364;">■ 拠点</span> &nbsp;
              <span style="color: #ef4444; font-weight: bold;">■ 矛盾ノード</span>
              <div style="margin-top: 2px;">※ ノードをクリックするとエディタ該当行・設定へジャンプします</div>
            </div>
          </div>
        </div>
      `;

      const attachNodeListeners = (wrapper: HTMLElement) => {
        wrapper.querySelectorAll('.dag-node').forEach((nodeEl) => {
          const id = (nodeEl as HTMLElement).dataset.nodeId;
          if (id && conflictMap.has(id)) {
            const conf = conflictMap.get(id)!;
            nodeEl.classList.add('conflict-node');
            nodeEl.setAttribute('data-is-conflict', 'true');
            nodeEl.setAttribute('data-conflict-type', conf.category);
            const rect = nodeEl.querySelector('rect');
            if (rect) {
              rect.setAttribute('stroke', '#ef4444');
              rect.setAttribute('stroke-width', '2.5');
              rect.setAttribute('fill', 'rgba(239, 68, 68, 0.25)');
            }
          }

          nodeEl.addEventListener('click', (e) => {
            const nodeId = (e.currentTarget as HTMLElement).dataset.nodeId;
            if (!nodeId) return;

            if (conflictMap.has(nodeId)) {
              const conf = conflictMap.get(nodeId)!;
              const anchor = conf.anchor || syncResult.jumpAnchors.get(nodeId);
              if (anchor) {
                this.deps.loadChapter(anchor.chapterId);
                if (this.deps.jumpToPosition) {
                  this.deps.jumpToPosition(anchor.chapterId, anchor.lineNumber, anchor.charOffset);
                } else {
                  const cm = this.deps.getEditorView();
                  if (cm) cm.dispatch({ selection: { anchor: anchor.charOffset }, scrollIntoView: true });
                }
                this.deps.showToast(`🚨 因果矛盾検出 [${anchor.label}]: 第${anchor.chapterIndex + 1}章 ${anchor.lineNumber}行目へジャンプ`);
                return;
              }
            }

            const ent = this.deps.getLoreManager().getEntity(nodeId);
            if (ent) {
              this.deps.showToast(`📌 [${ent.name}] ${ent.role || ent.category}: ${ent.description.slice(0, 30)}...`);
            }
          });
        });

        // Banner jump buttons
        container.querySelectorAll('.btn-jump-conflict-banner').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const nodeId = (e.currentTarget as HTMLElement).dataset.nodeId;
            if (nodeId && conflictMap.has(nodeId)) {
              const anchor = conflictMap.get(nodeId)!.anchor || syncResult.jumpAnchors.get(nodeId);
              if (anchor) {
                this.deps.loadChapter(anchor.chapterId);
                if (this.deps.jumpToPosition) {
                  this.deps.jumpToPosition(anchor.chapterId, anchor.lineNumber, anchor.charOffset);
                } else {
                  const cm = this.deps.getEditorView();
                  if (cm) cm.dispatch({ selection: { anchor: anchor.charOffset }, scrollIntoView: true });
                }
                this.deps.showToast(`🚨 因果矛盾検出 [${anchor.label}]: 第${anchor.chapterIndex + 1}章 ${anchor.lineNumber}行目へジャンプ`);
              }
            }
          });
        });
      };

      const dagWrapper = container.querySelector('#dagSvgContainer') as HTMLElement | null;
      if (dagWrapper) {
        attachNodeListeners(dagWrapper);
        if (isVirtualized) {
          let scrollDebounce: any = null;
          dagWrapper.addEventListener('scroll', () => {
            if (scrollDebounce) cancelAnimationFrame(scrollDebounce);
            scrollDebounce = requestAnimationFrame(() => {
              const vp = {
                scrollTop: dagWrapper.scrollTop,
                scrollLeft: dagWrapper.scrollLeft,
                viewportWidth: dagWrapper.clientWidth || 340,
                viewportHeight: dagWrapper.clientHeight || 280,
                overscan: 100,
              };
              dagWrapper.innerHTML = dagEngine.renderVirtualizedSvgGraph(vp);
              attachNodeListeners(dagWrapper);
            });
          });
        }
      }
    } else if (activeRightTab === 'pop') {
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
        this.deps.exportPoPCertificate();
      });
    } else if (activeRightTab === 'history') {
      const currentChapterId = this.deps.getCurrentChapterId();
      const snapshotsMap = this.deps.getChapterSnapshots();
      const snapshots = snapshotsMap.get(currentChapterId) || [];
      const listItems = snapshots.length === 0
        ? '<div style="color: var(--color-text-dim); font-size: 12px; padding: 8px;">まだ履歴がありません。</div>'
        : snapshots.slice().reverse().map((snap: any, idx: number) => {
            const time = new Date(snap.time).toLocaleTimeString('ja-JP');
            const charCount = (snap.text || '').replace(/\s+/g, '').length;
            return `<div class="history-entry" data-snap-idx="${snapshots.length - 1 - idx}" style="padding: 6px 8px; border-bottom: 1px solid var(--color-border); cursor: pointer; font-size: 12px; transition: background 0.15s;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--color-gold);">${time}</span>
                <span style="color: var(--color-text-dim);">${charCount}字</span>
              </div>
            </div>`;
          }).join('');

      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🕒 編集履歴・ロールバック</span>
            <span style="font-size: 11px; color: var(--color-text-dim);">最大500件</span>
          </div>
          <div class="dock-card-body" style="padding: 0;">
            <p style="font-size: 11px; color: var(--color-text-dim); padding: 8px; margin: 0; border-bottom: 1px solid var(--color-border);">
              過去の編集ポイントをクリックすると、その時点の本文へロールバックします。
            </p>
            <div style="max-height: 400px; overflow-y: auto;">
              ${listItems}
            </div>
          </div>
        </div>
      `;

      container.querySelectorAll('.history-entry').forEach((entry) => {
        entry.addEventListener('click', () => {
          const snapIdx = parseInt((entry as HTMLElement).dataset.snapIdx || '0', 10);
          const snap = snapshots[snapIdx];
          const cm = this.deps.getEditorView();
          if (snap && cm) {
            cm.dispatch({
              changes: { from: 0, to: cm.state.doc.length, insert: snap.text },
            });
            this.deps.showToast(`🕒 履歴 ${new Date(snap.time).toLocaleTimeString('ja-JP')} へロールバックしました`);
          }
        });
        entry.addEventListener('mouseenter', () => {
          (entry as HTMLElement).style.background = 'rgba(207,168,92,0.1)';
        });
        entry.addEventListener('mouseleave', () => {
          (entry as HTMLElement).style.background = '';
        });
      });
    } else if (activeRightTab === 'help') {
      const shortcuts = [
        ['元に戻す / やり直す', 'Ctrl + Z / Ctrl + Y'],
        ['選択テキストをルビ化', 'Ctrl + R'],
        ['全画面集中執筆モード', 'F11 / Escで解除'],
        ['左ペイン（目次）開閉', 'Ctrl + B'],
        ['段落字下げ / 逆字下げ', 'Tab / Shift + Tab'],
        ['縦書き段落移動', '← / →'],
        ['縦書き文字移動', '↑ / ↓'],
        ['パレット / ESC', 'Esc'],
      ];
      const rows = shortcuts.map(([fn, key]) =>
        `<tr style="border-bottom: 1px solid var(--color-border); height: 28px;">
          <td style="padding: 4px 8px;">${fn}</td>
          <td style="text-align: right; padding: 4px 8px; font-family: var(--font-mono); color: var(--color-accent);">${key}</td>
        </tr>`
      ).join('');

      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">📖 操作ガイド ＆ ショートカット</span>
          </div>
          <div class="dock-card-body" style="padding: 0;">
            <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid var(--color-border); height: 28px;">
                <th style="text-align: left; color: var(--color-gold); padding: 4px 8px;">機能</th>
                <th style="text-align: right; color: var(--color-gold); padding: 4px 8px;">キー / 操作</th>
              </tr>
              ${rows}
            </table>
          </div>
        </div>
      `;
    } else if (activeRightTab === 'analytics') {
      const cm = this.deps.getEditorView();
      const text = cm ? cm.state.doc.toString() : '';
      const chars = this.deps.getLoreManager().getEntities('character').map((c) => ({
        id: c.id,
        name: c.name,
        aliases: c.aliases,
      }));

      const matrixCalc = new CharacterInteractionMatrix();
      const matrixSummary = matrixCalc.analyze(text, chars);

      const arcTracker = new CharacterEmotionalArcTracker();
      const arcResult = arcTracker.analyze(text, chars);
      const arcSvg = arcTracker.renderSvgArcChart(arcResult, { width: 280, height: 160 });

      const topPairsHtml = matrixSummary.topPairs.length === 0
        ? '<div style="color: var(--color-text-dim); font-size: 11px;">登場人物間の対話・共起がまだありません。</div>'
        : matrixSummary.topPairs.slice(0, 5).map((p) =>
            `<div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; border-bottom: 1px dashed var(--color-border);">
              <span>${p.char1.name} ↔ ${p.char2.name}</span>
              <span style="color: var(--color-gold); font-weight: 600;">親密度 ${p.relationshipScore.toFixed(0)}</span>
            </div>`
          ).join('');

      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🎭 人物感情曲線（Emotional Arc）</span>
          </div>
          <div class="dock-card-body" style="padding: 4px; overflow-x: auto;">
            ${arcSvg}
          </div>
        </div>
        <div class="dock-card" style="margin-top: 10px;">
          <div class="dock-card-header">
            <span class="dock-card-title">👥 人物関係・共起マトリクス</span>
          </div>
          <div class="dock-card-body">
            <div style="font-size: 11px; color: var(--color-text-dim); margin-bottom: 6px;">
              会話ターン・同一場面共起による結びつき上位:
            </div>
            ${topPairsHtml}
          </div>
        </div>
      `;
    }
  }

  public openLoreModal(entityId?: string): void {
    const modal = document.getElementById('loreModal');
    if (!modal) return;

    const idInput = document.getElementById('loreEntityId') as HTMLInputElement;
    const nameInput = document.getElementById('loreEntityName') as HTMLInputElement;
    const catInput = document.getElementById('loreEntityCategory') as HTMLSelectElement;
    const roleInput = document.getElementById('loreEntityRole') as HTMLInputElement;
    const statusInput = document.getElementById('loreEntityStatus') as HTMLSelectElement;
    const aliasesInput = document.getElementById('loreEntityAliases') as HTMLInputElement;
    const descInput = document.getElementById('loreEntityDesc') as HTMLTextAreaElement;
    const heading = document.getElementById('loreModalHeading');
    const btnDel = document.getElementById('btnDeleteLoreEntity');
    const loreManager = this.deps.getLoreManager();

    if (entityId) {
      const ent = loreManager.getEntity(entityId);
      if (ent) {
        if (idInput) idInput.value = ent.id;
        if (nameInput) nameInput.value = ent.name;
        if (catInput) catInput.value = ent.category;
        if (roleInput) roleInput.value = ent.role || '';
        if (statusInput) statusInput.value = ent.status || 'active';
        if (aliasesInput) aliasesInput.value = (ent.aliases || []).join(', ');
        if (descInput) descInput.value = ent.description;
        if (heading) heading.innerHTML = `<span>✏️</span> 設定項目の編集: ${ent.name}`;
        if (btnDel) btnDel.style.display = 'inline-block';
      }
    } else {
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (catInput) catInput.value = 'character';
      if (roleInput) roleInput.value = '';
      if (statusInput) statusInput.value = 'active';
      if (aliasesInput) aliasesInput.value = '';
      if (descInput) descInput.value = '';
      if (heading) heading.innerHTML = `<span>＋</span> 新規設定項目の作成`;
      if (btnDel) btnDel.style.display = 'none';
    }

    modal.style.display = 'flex';
  }

  public closeLoreModal(): void {
    const modal = document.getElementById('loreModal');
    if (modal) modal.style.display = 'none';
  }

  public async saveLoreFromForm(): Promise<void> {
    const idInput = document.getElementById('loreEntityId') as HTMLInputElement;
    const nameInput = document.getElementById('loreEntityName') as HTMLInputElement;
    const catInput = document.getElementById('loreEntityCategory') as HTMLSelectElement;
    const roleInput = document.getElementById('loreEntityRole') as HTMLInputElement;
    const statusInput = document.getElementById('loreEntityStatus') as HTMLSelectElement;
    const aliasesInput = document.getElementById('loreEntityAliases') as HTMLInputElement;
    const descInput = document.getElementById('loreEntityDesc') as HTMLTextAreaElement;

    const name = nameInput.value.trim();
    if (!name) return;

    const id = idInput.value;
    const category = (catInput.value || 'character') as LoreCategory;
    const role = roleInput.value.trim() || undefined;
    const status = statusInput.value || 'active';
    const aliases = aliasesInput.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const description = descInput.value.trim();
    const loreManager = this.deps.getLoreManager();

    if (id) {
      loreManager.updateEntity(id, {
        name,
        category,
        role,
        status,
        aliases,
        description,
      });
      this.deps.showToast(`✏️ 設定「${name}」を更新しました`);
      this.notifyChange('update', id);
    } else {
      const created = loreManager.createEntity({
        name,
        category,
        role,
        status,
        aliases,
        description,
      });
      this.deps.showToast(`✨ 新規設定「${name}」を追加しました`);
      this.notifyChange('create', created.id);
    }

    await this.saveLoreData();
    this.closeLoreModal();
    this.renderLeftPane();
    this.renderRightPane();
  }

  public async deleteLore(id: string): Promise<void> {
    const loreManager = this.deps.getLoreManager();
    const ent = loreManager.getEntity(id);
    const name = ent?.name || id;
    loreManager.deleteEntity(id);
    await this.saveLoreData();
    this.closeLoreModal();
    this.renderLeftPane();
    this.renderRightPane();
    this.deps.showToast(`🗑️ 設定「${name}」を削除しました`);
    this.notifyChange('delete', id);
  }

  public async saveLoreData(): Promise<void> {
    const loreManager = this.deps.getLoreManager();
    try {
      localStorage.setItem('plotailor_lore_data', JSON.stringify(loreManager.getEntities()));
    } catch {}

    try {
      await loreManager.saveToVFS(this.deps.getCurrentProjectId());
    } catch (err) {
      console.warn('Failed to save lore to VFS:', err);
    }

    this.deps.getLoreDock().updateDictionary(loreManager.toLoreTermDefinitions());
  }

  public checkShelvedCandidates(): void {
    const cm = this.deps.getEditorView();
    if (!cm) return;
    const text = cm.state.doc.toString();
    const shelvedEntities = this.deps.getLoreManager().getEntities().filter((e) => e.status === 'shelved');
    const matches = findShelvedCandidates(text, shelvedEntities);
    if (matches.length > 0) {
      const match = matches[0];
      const saveIndicator = document.getElementById('saveStatusIndicator');
      if (saveIndicator) {
        saveIndicator.innerHTML = `💡 未配置設定「<strong>${match.matchedText}</strong>」検知 (Alt+Pで再バインド)`;
        saveIndicator.style.color = 'var(--color-gold)';
      }
    }
  }

  public reconcileShelvedLore(isCommitted: boolean): void {
    const fullText = this.deps.getChapters().map((c) => c.content).join('\n\n');
    const loreManager = this.deps.getLoreManager();
    const allEntities = loreManager.getEntities();
    const result = reconcileEntityLifecycles(fullText, allEntities, isCommitted);

    let changed = false;
    for (const ent of result.updatedEntities) {
      const existing = loreManager.getEntity(ent.id);
      if (existing && existing.status !== ent.status) {
        loreManager.updateEntity(ent.id, { status: ent.status });
        changed = true;
      }
    }
    for (const purged of result.purgedEntities) {
      loreManager.deleteEntity(purged.id);
      changed = true;
    }

    if (changed) {
      this.renderLeftPane();
      this.renderRightPane();
      this.notifyChange('shelve');
    }
  }

  public promoteShelvedLore(entityId?: string): void {
    const loreManager = this.deps.getLoreManager();
    let target = entityId ? loreManager.getEntity(entityId) : null;
    if (!target) {
      const shelvedList = loreManager.getEntities().filter((e) => e.status === 'shelved');
      if (shelvedList.length > 0) {
        const cm = this.deps.getEditorView();
        if (cm) {
          const text = cm.state.doc.toString();
          const head = cm.state.selection.main.head;
          const matches = findShelvedCandidates(text, shelvedList);
          const nearby = matches.find((m) => Math.abs(m.from - head) < 50);
          target = nearby ? nearby.entity : shelvedList[0];
        } else {
          target = shelvedList[0];
        }
      }
    }

    if (target) {
      loreManager.updateEntity(target.id, { status: 'active' });
      this.saveLoreData();
      this.renderLeftPane();
      this.renderRightPane();
      this.deps.updateMultiLayerDecorations();
      this.deps.showToast(`✨「${target.name}」を未配置棚から復帰（再バインド）しました`);
      this.notifyChange('promote', target.id);
    } else {
      this.deps.showToast(`未配置棚に再バインド可能な項目はありません`);
    }
  }
}
