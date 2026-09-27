/**
 * ForeshadowingProgressPanel - 3-Pane Integrated IDE Right Dock View Panel
 *
 * Renders chapter-wise foreshadowing recovery progress bars and the unresolved
 * foreshadowing list with interactive click-to-jump capabilities.
 */

import {
  ForeshadowingEngine,
  type ForeshadowingJumpTarget,
  type ForeshadowingItem,
} from './ForeshadowingEngine.js';

export class ForeshadowingProgressPanel {
  private engine: ForeshadowingEngine;

  constructor(engine: ForeshadowingEngine) {
    this.engine = engine;
  }

  public renderHtml(): string {
    const overall = this.engine.getOverallProgress();
    const unresolvedList = this.engine.getUnresolvedForeshadowings();

    return `
      <div class="foreshadowing-panel-container">
        <!-- 1. Overall Progress Header -->
        <div class="tree-group">
          <div class="tree-title">📊 伏線回収率 (全体進捗)</div>
          <div class="diagnostic-card" style="background: rgba(99, 102, 241, 0.08); border-color: rgba(99, 102, 241, 0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
              <span style="font-size: 0.85rem; font-weight: 600; color: #a5b4fc;">回収達成率</span>
              <span style="font-size: 0.95rem; font-weight: 700; color: #10b981;">${overall.overallProgressPercentage}%</span>
            </div>
            <div style="background: rgba(255, 255, 255, 0.1); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem;">
              <div style="background: linear-gradient(90deg, #6366f1, #10b981); width: ${overall.overallProgressPercentage}%; height: 100%; transition: width 0.3s ease;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-dim, #94a3b8);">
              <span>設置: ${overall.totalPlanted}件</span>
              <span>回収: ${overall.totalResolved}件</span>
              <span style="color: ${overall.totalUnresolved > 0 ? '#f59e0b' : '#10b981'};">未回収: ${overall.totalUnresolved}件</span>
            </div>
          </div>
        </div>

        <!-- 2. Chapter Progress Bars -->
        <div class="tree-group">
          <div class="tree-title">📜 章別回収進捗</div>
          <div class="chapter-progress-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${
              overall.chapterProgresses.length === 0
                ? `<div style="font-size: 0.8rem; color: var(--text-dim, #94a3b8);">章のデータがありません</div>`
                : overall.chapterProgresses
                    .map(
                      (ch) => `
              <div class="chapter-progress-card" style="background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); padding: 0.5rem; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.3rem;">
                  <span style="font-weight: 600; color: #e2e8f0;">${ch.chapterTitle}</span>
                  <span style="color: ${ch.progressPercentage === 100 ? '#10b981' : '#6366f1'}; font-weight: 600;">${ch.progressPercentage}%</span>
                </div>
                <div style="background: rgba(255, 255, 255, 0.1); height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 0.3rem;">
                  <div style="background: ${ch.progressPercentage === 100 ? '#10b981' : '#6366f1'}; width: ${ch.progressPercentage}%; height: 100%;"></div>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-dim, #94a3b8); display: flex; justify-content: space-between;">
                  <span>設置 ${ch.plantedCount} / 回収 ${ch.resolvedCount}</span>
                  <span>未回収 ${ch.unresolvedCount}件</span>
                </div>
              </div>
            `
                    )
                    .join('')
            }
          </div>
        </div>

        <!-- 3. Unresolved Foreshadowing List -->
        <div class="tree-group">
          <div class="tree-title">🔍 未回収伏線一覧 (${unresolvedList.length}件)</div>
          <div class="unresolved-foreshadowing-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${
              unresolvedList.length === 0
                ? `
              <div style="font-size: 0.8rem; color: #10b981; padding: 0.5rem 0; text-align: center;">
                ✨ すべての伏線が回収されています！
              </div>
            `
                : unresolvedList
                    .map((item) => this.renderUnresolvedItemCard(item))
                    .join('')
            }
          </div>
        </div>
      </div>
    `;
  }

  private renderUnresolvedItemCard(item: ForeshadowingItem): string {
    const jump = this.engine.jumpToForeshadowing(item.id);
    const lineNum = jump ? jump.lineNumber : item.plantedLine;
    const offset = jump ? jump.charOffset : item.plantedOffset;

    const statusBadge =
      item.status === 'HINTED'
        ? `<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 4px;">@hint (${item.hints.length})</span>`
        : `<span style="background: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.4); font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 4px;">@plant</span>`;

    return `
      <div class="diagnostic-card unresolved-item-card" data-foreshadowing-id="${item.id}" style="border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.05); cursor: pointer;">
        <div class="diagnostic-header" style="margin-bottom: 0.25rem; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #f1f5f9; font-weight: 600; font-size: 0.825rem;">📌 ${item.title}</span>
          ${statusBadge}
        </div>
        <div style="font-size: 0.725rem; color: var(--text-dim, #94a3b8); margin-bottom: 0.4rem;">
          設置: ${item.plantedChapterTitle} (L${item.plantedLine})
          ${item.hints.length > 0 ? ` / 展開: ${item.hints.length}回` : ''}
        </div>
        ${
          item.description
            ? `<p style="color: var(--text-muted, #cbd5e1); font-size: 0.75rem; margin-bottom: 0.4rem; line-height: 1.4;">${item.description}</p>`
            : ''
        }
        <button class="tool-btn foreshadowing-jump-btn" data-jump-id="${item.id}" data-jump-line="${lineNum}" data-jump-offset="${offset}" style="font-size: 0.725rem; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); width: 100%;">
          🎯 該当行 (L${lineNum}) へジャンプ
        </button>
      </div>
    `;
  }

  /**
   * Binds click events to jump buttons and item cards.
   */
  public bindEvents(
    container: HTMLElement,
    onJump?: (target: ForeshadowingJumpTarget) => void
  ): void {
    const cards = container.querySelectorAll('.unresolved-item-card, .foreshadowing-jump-btn');

    cards.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetEl = e.currentTarget as HTMLElement;
        const id =
          targetEl.dataset.jumpId ||
          targetEl.dataset.foreshadowingId ||
          targetEl.closest('.unresolved-item-card')?.getAttribute('data-foreshadowing-id');

        if (id) {
          const jumpTarget = this.engine.jumpToForeshadowing(id);
          if (jumpTarget && onJump) {
            onJump(jumpTarget);
          }
        }
      });
    });
  }
}
