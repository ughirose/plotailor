import { ProjectManager } from '../../core/project/index.js';
import type { LoreEntityManager } from '../../core/lore/LoreEntityManager.js';
import type { LoreInspectorDock } from '../../ui/LoreInspectorDock.js';
import type { ChapterData } from './ExportController.js';
import { showInlinePrompt, showInlineAlert } from '../InlineDialog.js';
import { LocalDirectorySyncEngine } from '../../core/fs/LocalDirectorySyncEngine.js';

export interface ProjectControllerDependencies {
  getProjectManager: () => ProjectManager;
  getCurrentProjectId: () => string;
  setCurrentProjectId: (id: string) => void;
  getWorkTitle: () => string;
  setWorkTitle: (title: string) => void;
  getChapters: () => ChapterData[];
  setChapters: (chs: ChapterData[]) => void;
  getCurrentChapterId: () => string;
  setCurrentChapterId: (id: string) => void;
  getLoreManager: () => LoreEntityManager;
  getLoreDock: () => LoreInspectorDock;
  saveToStorage: () => void;
  renderChapterSelect: () => void;
  loadChapter: (id: string) => void;
  renderLeftPane: () => void;
  renderRightPane: () => void;
  updateStats: () => void;
  updateMultiLayerDecorations: () => void;
  showToast: (msg: string) => void;
  clearChapterStatesAndSnapshots: () => void;
}

export type ProjectSwitchListener = (projectId: string, title: string) => void;

export class ProjectController {
  private deps: ProjectControllerDependencies;
  private switchListeners: ProjectSwitchListener[] = [];
  private syncEngine: LocalDirectorySyncEngine;

  constructor(deps: ProjectControllerDependencies) {
    this.deps = deps;
    this.syncEngine = new LocalDirectorySyncEngine(this.deps.getProjectManager().getVFS(), {
      onStatusChange: (status, dirName) => this.handleSyncStatusChange(status, dirName),
      onError: (err) => this.deps.showToast(`ローカル同期エラー: ${err.message}`),
    });
  }

  public getSyncEngine(): LocalDirectorySyncEngine {
    return this.syncEngine;
  }

  public registerProjectSwitchListener(listener: ProjectSwitchListener): void {
    this.switchListeners.push(listener);
  }

  private notifyProjectSwitch(projectId: string, title: string): void {
    for (const listener of this.switchListeners) {
      listener(projectId, title);
    }
  }

  public async initProjectVFS(): Promise<void> {
    try {
      const pm = this.deps.getProjectManager();
      await pm.initWorkspace();
      const projects = await pm.listProjects();

      let currentProjectId = this.deps.getCurrentProjectId();
      const chapters = this.deps.getChapters();
      const loreManager = this.deps.getLoreManager();

      if (projects.length === 0) {
        const migrated = await pm.migrateFromLegacyStorage();
        if (migrated) {
          currentProjectId = migrated.id;
          this.deps.setCurrentProjectId(currentProjectId);
        } else {
          let defaultProj: any;
          try {
            defaultProj = await pm.getProject('default_work').then((d) => d.meta);
          } catch {
            defaultProj = await pm.createProject({
              id: 'default_work',
              title: this.deps.getWorkTitle() || '星辰の境界線',
            });
          }
          currentProjectId = defaultProj.id;
          this.deps.setCurrentProjectId(currentProjectId);
          for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            await pm.saveChapter(currentProjectId, ch.id, ch.title, ch.content);
          }
          await loreManager.saveToVFS(currentProjectId);
        }
      } else {
        const targetProj = projects.find((p) => p.id === currentProjectId) || projects[0];
        if (targetProj) {
          currentProjectId = targetProj.id;
          this.deps.setCurrentProjectId(currentProjectId);
          const projData = await pm.getProject(targetProj.id);
          this.deps.setWorkTitle(projData.meta.title);
          const titleEl = document.getElementById('workTitleText');
          if (titleEl) titleEl.textContent = projData.meta.title;

          if (projData.chapters.length > 0) {
            const newChapters: ChapterData[] = [];
            for (const ch of projData.chapters) {
              const loaded = await pm.loadChapter(targetProj.id, ch.id);
              newChapters.push({
                id: ch.id,
                title: ch.title,
                charCount: ch.charCount,
                content: loaded.content,
              });
            }
            this.deps.setChapters(newChapters);
          }
          const loadedChapters = this.deps.getChapters();
          if (projData.meta.activeChapterId && loadedChapters.some((c) => c.id === projData.meta.activeChapterId)) {
            this.deps.setCurrentChapterId(projData.meta.activeChapterId);
          } else if (loadedChapters.length > 0) {
            this.deps.setCurrentChapterId(loadedChapters[0].id);
          }

          await loreManager.loadFromVFS(currentProjectId);
          this.deps.getLoreDock().updateDictionary(loreManager.toLoreTermDefinitions());
        }
      }

      this.deps.saveToStorage();
      this.deps.renderChapterSelect();
      this.deps.loadChapter(this.deps.getCurrentChapterId());
      this.deps.renderLeftPane();
      this.deps.renderRightPane();
      this.deps.updateStats();
      this.deps.updateMultiLayerDecorations();
    } catch (err) {
      console.warn('VFS init warning:', err);
    }
  }

  public async saveToVFS(): Promise<void> {
    try {
      const pm = this.deps.getProjectManager();
      const currentProjectId = this.deps.getCurrentProjectId();
      const workTitle = this.deps.getWorkTitle();
      const chapters = this.deps.getChapters();
      const currentChapterId = this.deps.getCurrentChapterId();

      if (!(await pm.getVFS().exists(`/projects/${currentProjectId}`))) {
        await pm.createProject({
          id: currentProjectId,
          title: workTitle,
        });
      }

      for (const ch of chapters) {
        await pm.saveChapter(
          currentProjectId,
          ch.id,
          ch.title,
          ch.content
        );
      }
      await pm.updateProjectMeta(currentProjectId, {
        title: workTitle,
        activeChapterId: currentChapterId,
      });
      await this.deps.getLoreManager().saveToVFS(currentProjectId);
    } catch (err) {
      console.warn('VFS auto-save warning:', err);
    }
  }

  private handleSyncStatusChange(status: string, dirName?: string): void {
    const banner = document.getElementById('localDirStatusBanner');
    const text = document.getElementById('localDirStatusText');
    if (banner && text) {
      if (status === 'connected') {
        banner.style.display = 'flex';
        text.textContent = `📁 ローカル同期中: ${dirName || '接続済み'}`;
      } else {
        banner.style.display = 'none';
        text.textContent = '📁 ローカル同期中: -';
      }
    }
  }

  public async connectLocalDirectory(): Promise<void> {
    try {
      const connected = await this.syncEngine.requestAndConnectDirectory();
      if (connected) {
        this.deps.showToast(`📁 ローカルフォルダ「${this.syncEngine.getDirectoryName()}」に接続しました`);
        await this.initProjectVFS();
        await this.renderProjectList();
      }
    } catch (err: any) {
      this.deps.showToast(`ローカル接続失敗: ${err.message}`);
    }
  }

  public async disconnectLocalDirectory(): Promise<void> {
    this.syncEngine.disconnect();
    this.deps.showToast('ローカルフォルダとの接続を解除しました');
    await this.initProjectVFS();
    await this.renderProjectList();
  }

  public async openProjectModal(): Promise<void> {
    const modal = document.getElementById('projectModal');
    if (!modal) return;
    this.handleSyncStatusChange(this.syncEngine.getStatus(), this.syncEngine.getDirectoryName() || undefined);
    await this.renderProjectList();
    modal.style.display = 'flex';
  }

  public closeProjectModal(): void {
    const modal = document.getElementById('projectModal');
    if (modal) modal.style.display = 'none';
  }

  public async renderProjectList(): Promise<void> {
    const container = document.getElementById('projectListContainer');
    if (!container) return;

    // Bind Connect / Disconnect Local Directory buttons
    const btnConnect = document.getElementById('btnConnectLocalDir');
    if (btnConnect) {
      btnConnect.onclick = () => this.connectLocalDirectory();
    }
    const btnDisconnect = document.getElementById('btnDisconnectLocalDir');
    if (btnDisconnect) {
      btnDisconnect.onclick = () => this.disconnectLocalDirectory();
    }

    try {
      const projects = await this.deps.getProjectManager().listProjects();
      if (projects.length === 0) {
        container.innerHTML = '<div style="font-size: 13px; color: var(--color-text-dim); text-align: center; padding: 24px;">まだ保存された作品がありません。</div>';
        return;
      }

      const currentProjectId = this.deps.getCurrentProjectId();
      container.innerHTML = projects.map((p) => {
        const isCurrent = p.id === currentProjectId;
        const dateStr = new Date(p.updatedAt).toLocaleDateString() + ' ' + new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="history-item ${isCurrent ? 'active' : ''}" data-project-id="${p.id}" style="${isCurrent ? 'border-color: var(--color-gold); background: rgba(184, 134, 11, 0.08);' : ''}">
            <div class="history-item-info">
              <div class="history-item-time" style="font-weight: 600; color: var(--color-text);">
                ${p.title} ${isCurrent ? '<span style="color: var(--color-gold); font-size: 11px; margin-left: 6px;">[執筆中]</span>' : ''}
              </div>
              <div class="history-item-preview" style="font-size: 11px;">
                総文字数: ${p.totalCharCount.toLocaleString()} 字 | 更新: ${dateStr}
              </div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              ${!isCurrent ? `<button class="ide-btn btn-switch-proj" data-id="${p.id}" style="font-size: 11px; padding: 2px 8px;">開く</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-switch-proj').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) {
            await this.switchProject(id);
            this.closeProjectModal();
          }
        });
      });
    } catch (err) {
      const errorDiv = document.createElement('div');
      errorDiv.style.color = 'var(--color-danger)';
      errorDiv.style.padding = '12px';
      errorDiv.textContent = `作品一覧の読込に失敗しました: ${err}`;
      container.innerHTML = '';
      container.appendChild(errorDiv);
    }
  }

  public async createNewProjectPrompt(): Promise<void> {
    const title = await showInlinePrompt({
      message: '新規作品のタイトルを入力してください:',
      defaultValue: `長編小説_${new Date().toISOString().slice(0, 10)}`,
      placeholder: '作品タイトル',
    });
    if (!title || !title.trim()) return;

    try {
      await this.saveToVFS();
      const pm = this.deps.getProjectManager();
      const newProj = await pm.createProject({ title: title.trim() });
      await pm.saveChapter(
        newProj.id,
        'ch1',
        '第一章 幕開け',
        '　ここに新しい物語の最初の一行を書き始めます。'
      );

      // Reset lore entities completely to eliminate residual sample data
      const loreManager = this.deps.getLoreManager();
      loreManager.setEntities([]);
      await loreManager.saveToVFS(newProj.id);

      await this.switchProject(newProj.id);
      this.closeProjectModal();
      this.deps.showToast(`✨ 新規作品「${newProj.title}」を作成し、執筆を開始しました`);
    } catch (err) {
      await showInlineAlert({ message: `作品の作成に失敗しました: ${err}` });
    }
  }

  public async switchProject(projectId: string): Promise<void> {
    try {
      await this.saveToVFS();

      const pm = this.deps.getProjectManager();
      const data = await pm.getProject(projectId);
      this.deps.setCurrentProjectId(projectId);
      this.deps.setWorkTitle(data.meta.title);

      const titleEl = document.getElementById('workTitleText');
      if (titleEl) titleEl.textContent = data.meta.title;

      if (data.chapters.length > 0) {
        const loadedChapters: ChapterData[] = [];
        for (const ch of data.chapters) {
          const loaded = await pm.loadChapter(projectId, ch.id);
          loadedChapters.push({
            id: ch.id,
            title: ch.title,
            charCount: ch.charCount,
            content: loaded.content,
          });
        }
        this.deps.setChapters(loadedChapters);
      } else {
        this.deps.setChapters([
          { id: 'ch1', title: '第一章 幕開け', charCount: 22, content: '　ここに新しい物語の最初の一行を書き始めます。' },
        ]);
      }

      const chapters = this.deps.getChapters();
      const activeChId = data.meta.activeChapterId && chapters.some((c) => c.id === data.meta.activeChapterId)
        ? data.meta.activeChapterId
        : chapters[0].id;
      this.deps.setCurrentChapterId(activeChId);

      const loreManager = this.deps.getLoreManager();
      await loreManager.loadFromVFS(projectId);
      this.deps.getLoreDock().updateDictionary(loreManager.toLoreTermDefinitions());

      this.deps.clearChapterStatesAndSnapshots();

      this.deps.saveToStorage();
      this.deps.renderChapterSelect();
      this.deps.loadChapter(activeChId);
      this.deps.renderLeftPane();
      this.deps.renderRightPane();
      this.deps.updateStats();
      this.deps.updateMultiLayerDecorations();

      this.notifyProjectSwitch(projectId, data.meta.title);
      this.deps.showToast(`📚 作品「${data.meta.title}」を開きました`);
    } catch (err) {
      console.error('Failed to switch project:', err);
      this.deps.showToast(`❌ 作品切り替えエラー: ${err}`);
    }
  }
}
