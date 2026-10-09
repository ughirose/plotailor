import { VirtualFileSystem } from '../fs/VirtualFileSystem.js';

export interface ProjectMeta {
  id: string;
  title: string;
  author?: string;
  description?: string;
  genre?: string;
  createdAt: number;
  updatedAt: number;
  activeChapterId?: string;
  totalCharCount: number;
}

export interface ChapterMeta {
  id: string;
  title: string;
  order: number;
  charCount: number;
  fileName: string;
}

export interface ProjectData {
  meta: ProjectMeta;
  chapters: ChapterMeta[];
}

export class ProjectManager {
  private vfs: VirtualFileSystem;
  private readonly rootPath = '/projects';

  constructor(vfs?: VirtualFileSystem) {
    this.vfs = vfs || new VirtualFileSystem();
  }

  public getVFS(): VirtualFileSystem {
    return this.vfs;
  }

  async initWorkspace(): Promise<void> {
    const exists = await this.vfs.exists(this.rootPath);
    if (!exists) {
      await this.vfs.mkdir(this.rootPath, true);
    }
  }

  async listProjects(): Promise<ProjectMeta[]> {
    await this.initWorkspace();
    const entries = await this.vfs.readdir(this.rootPath);
    const projects: ProjectMeta[] = [];

    for (const entry of entries) {
      if (entry.type === 'directory') {
        const metaPath = `${entry.path}/project.json`;
        if (await this.vfs.exists(metaPath)) {
          try {
            const meta = await this.vfs.readJson<ProjectMeta>(metaPath);
            projects.push(meta);
          } catch {
            // Skip corrupted project.json
          }
        }
      }
    }

    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async createProject(options: {
    id?: string;
    title: string;
    author?: string;
    description?: string;
  }): Promise<ProjectMeta> {
    await this.initWorkspace();
    const id = options.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const projDir = `${this.rootPath}/${id}`;

    if (await this.vfs.exists(projDir)) {
      throw new Error(`Project with ID ${id} already exists`);
    }

    const now = Date.now();
    const meta: ProjectMeta = {
      id,
      title: options.title,
      author: options.author || '',
      description: options.description || '',
      createdAt: now,
      updatedAt: now,
      totalCharCount: 0,
    };

    await this.vfs.mkdir(projDir, true);
    await this.vfs.mkdir(`${projDir}/manuscript`, true);
    await this.vfs.mkdir(`${projDir}/lore`, true);
    await this.vfs.mkdir(`${projDir}/plot`, true);
    await this.vfs.mkdir(`${projDir}/.pop`, true);

    await this.vfs.writeJson(`${projDir}/project.json`, meta);
    await this.vfs.writeJson(`${projDir}/manuscript/order.json`, []);

    return meta;
  }

  async getProject(projectId: string): Promise<ProjectData> {
    const projDir = `${this.rootPath}/${projectId}`;
    const metaPath = `${projDir}/project.json`;
    const orderPath = `${projDir}/manuscript/order.json`;

    if (!(await this.vfs.exists(metaPath))) {
      throw new Error(`Project ${projectId} not found`);
    }

    const meta = await this.vfs.readJson<ProjectMeta>(metaPath);
    const chapters = (await this.vfs.exists(orderPath))
      ? await this.vfs.readJson<ChapterMeta[]>(orderPath)
      : [];

    return { meta, chapters };
  }

  async updateProjectMeta(projectId: string, partial: Partial<ProjectMeta>): Promise<ProjectMeta> {
    const data = await this.getProject(projectId);
    const updated: ProjectMeta = {
      ...data.meta,
      ...partial,
      updatedAt: Date.now(),
    };
    await this.vfs.writeJson(`${this.rootPath}/${projectId}/project.json`, updated);
    return updated;
  }

  async saveChapter(
    projectId: string,
    chapterId: string,
    title: string,
    content: string
  ): Promise<ChapterMeta> {
    const data = await this.getProject(projectId);
    const fileName = `${chapterId}.aozora`;
    const filePath = `${this.rootPath}/${projectId}/manuscript/${fileName}`;

    await this.vfs.writeText(filePath, content);

    const charCount = content.replace(/\s+/g, '').length;
    let chapters = [...data.chapters];
    const existingIdx = chapters.findIndex((c) => c.id === chapterId);

    const chapterMeta: ChapterMeta = {
      id: chapterId,
      title,
      order: existingIdx >= 0 ? chapters[existingIdx].order : chapters.length,
      charCount,
      fileName,
    };

    if (existingIdx >= 0) {
      chapters[existingIdx] = chapterMeta;
    } else {
      chapters.push(chapterMeta);
    }

    chapters = chapters.sort((a, b) => a.order - b.order);

    const totalCharCount = chapters.reduce((acc, c) => acc + c.charCount, 0);

    await this.vfs.writeJson(`${this.rootPath}/${projectId}/manuscript/order.json`, chapters);
    await this.updateProjectMeta(projectId, {
      totalCharCount,
      activeChapterId: chapterId,
    });

    return chapterMeta;
  }

  async loadChapter(projectId: string, chapterId: string): Promise<{ meta: ChapterMeta; content: string }> {
    const data = await this.getProject(projectId);
    const meta = data.chapters.find((c) => c.id === chapterId);
    if (!meta) {
      throw new Error(`Chapter ${chapterId} not found in project ${projectId}`);
    }
    const filePath = `${this.rootPath}/${projectId}/manuscript/${meta.fileName}`;
    const content = (await this.vfs.exists(filePath)) ? await this.vfs.readText(filePath) : '';
    return { meta, content };
  }

  async deleteChapter(projectId: string, chapterId: string): Promise<void> {
    const data = await this.getProject(projectId);
    const targetIdx = data.chapters.findIndex((c) => c.id === chapterId);
    if (targetIdx === -1) return;

    const target = data.chapters[targetIdx];
    const filePath = `${this.rootPath}/${projectId}/manuscript/${target.fileName}`;
    if (await this.vfs.exists(filePath)) {
      await this.vfs.unlink(filePath);
    }

    const nextChapters = data.chapters
      .filter((c) => c.id !== chapterId)
      .map((c, idx) => ({ ...c, order: idx }));

    const totalCharCount = nextChapters.reduce((acc, c) => acc + c.charCount, 0);

    await this.vfs.writeJson(`${this.rootPath}/${projectId}/manuscript/order.json`, nextChapters);
    await this.updateProjectMeta(projectId, {
      totalCharCount,
      activeChapterId:
        data.meta.activeChapterId === chapterId
          ? nextChapters[0]?.id || undefined
          : data.meta.activeChapterId,
    });
  }

  async reorderChapters(projectId: string, orderedChapterIds: string[]): Promise<ChapterMeta[]> {
    const data = await this.getProject(projectId);
    const map = new Map(data.chapters.map((c) => [c.id, c]));

    const nextChapters: ChapterMeta[] = [];
    for (let i = 0; i < orderedChapterIds.length; i++) {
      const id = orderedChapterIds[i];
      const ch = map.get(id);
      if (ch) {
        nextChapters.push({ ...ch, order: i });
      }
    }

    await this.vfs.writeJson(`${this.rootPath}/${projectId}/manuscript/order.json`, nextChapters);
    return nextChapters;
  }

  async migrateFromLegacyStorage(): Promise<ProjectMeta | null> {
    if (typeof localStorage === 'undefined') return null;

    const legacyTitle = localStorage.getItem('plotailor_work_title');
    const legacyChaptersStr = localStorage.getItem('plotailor_chapters');

    if (!legacyTitle && !legacyChaptersStr) return null;

    const projects = await this.listProjects();
    const existing = projects.find((p) => p.title === (legacyTitle || '星辰の境界線') || p.id === 'default_work');
    if (existing) {
      return existing;
    }

    if (await this.vfs.exists(`${this.rootPath}/default_work`)) {
      try {
        const existingData = await this.getProject('default_work');
        return existingData.meta;
      } catch {}
    }

    const title = legacyTitle || '星辰の境界線';
    let projMeta: ProjectMeta;
    if (await this.vfs.exists(`${this.rootPath}/default_work`)) {
      projMeta = (await this.getProject('default_work')).meta;
    } else {
      projMeta = await this.createProject({
        id: 'default_work',
        title,
      });
    }

    if (legacyChaptersStr) {
      try {
        const legacyChapters = JSON.parse(legacyChaptersStr);
        if (Array.isArray(legacyChapters)) {
          for (let i = 0; i < legacyChapters.length; i++) {
            const ch = legacyChapters[i];
            await this.saveChapter(projMeta.id, ch.id || `ch_${i + 1}`, ch.title || `第${i + 1}章`, ch.content || '');
          }
        }
      } catch (err) {
        console.warn('Failed to parse legacy chapters:', err);
      }
    }

    return projMeta;
  }
}
