import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFileSystem } from '../src/core/fs/VirtualFileSystem.js';
import { InMemoryAdapter } from '../src/core/fs/adapters/InMemoryAdapter.js';
import { ProjectManager } from '../src/core/project/ProjectManager.js';

describe('VirtualFileSystem & ProjectManager', () => {
  let vfs: VirtualFileSystem;
  let pm: ProjectManager;

  beforeEach(() => {
    vfs = new VirtualFileSystem(new InMemoryAdapter());
    pm = new ProjectManager(vfs);
  });

  describe('VirtualFileSystem Core', () => {
    it('creates directories recursively and checks existence', async () => {
      expect(await vfs.exists('/a/b/c')).toBe(false);
      await vfs.mkdir('/a/b/c', true);
      expect(await vfs.exists('/a/b/c')).toBe(true);

      const stat = await vfs.stat('/a/b/c');
      expect(stat.type).toBe('directory');
    });

    it('writes, reads, and deletes text files', async () => {
      await vfs.writeText('/docs/intro.txt', '吾輩は猫である。');
      expect(await vfs.exists('/docs/intro.txt')).toBe(true);

      const content = await vfs.readText('/docs/intro.txt');
      expect(content).toBe('吾輩は猫である。');

      const stat = await vfs.stat('/docs/intro.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBeGreaterThan(0);

      await vfs.unlink('/docs/intro.txt');
      expect(await vfs.exists('/docs/intro.txt')).toBe(false);
    });

    it('reads and writes JSON', async () => {
      const data = { title: '星辰の境界線', chapters: 3, published: false };
      await vfs.writeJson('/config/settings.json', data);

      const loaded = await vfs.readJson<typeof data>('/config/settings.json');
      expect(loaded).toEqual(data);
    });

    it('lists directory entries and walks recursively', async () => {
      await vfs.writeText('/root/f1.txt', '1');
      await vfs.writeText('/root/f2.txt', '2');
      await vfs.writeText('/root/sub/f3.txt', '3');

      const entries = await vfs.readdir('/root');
      expect(entries.length).toBe(3); // f1.txt, f2.txt, sub

      const all = await vfs.walk('/root');
      const names = all.map((e) => e.name);
      expect(names).toContain('f1.txt');
      expect(names).toContain('f2.txt');
      expect(names).toContain('sub');
      expect(names).toContain('f3.txt');
    });

    it('supports file move and copy', async () => {
      await vfs.writeText('/source/chapter1.aozora', '第一章');
      await vfs.copy('/source/chapter1.aozora', '/backup/chapter1.aozora');

      expect(await vfs.readText('/backup/chapter1.aozora')).toBe('第一章');
      expect(await vfs.exists('/source/chapter1.aozora')).toBe(true);

      await vfs.move('/backup/chapter1.aozora', '/dest/chapter1.aozora');
      expect(await vfs.exists('/backup/chapter1.aozora')).toBe(false);
      expect(await vfs.readText('/dest/chapter1.aozora')).toBe('第一章');
    });

    it('notifies watchers on mutations', async () => {
      const events: string[] = [];
      const unwatch = vfs.watch((ev) => {
        events.push(`${ev.type}:${ev.path}`);
      });

      await vfs.writeText('/watch_test.txt', 'hello');
      await vfs.unlink('/watch_test.txt');

      expect(events).toContain('create:/watch_test.txt');
      expect(events).toContain('delete:/watch_test.txt');

      unwatch();
      await vfs.writeText('/after_unwatch.txt', 'ignored');
      expect(events).not.toContain('create:/after_unwatch.txt');
    });
  });

  describe('ProjectManager', () => {
    it('creates project with standardized directory hierarchy and metadata', async () => {
      const meta = await pm.createProject({
        title: '星辰の境界線',
        author: '文芸作家',
        description: '双月の世界を描く長編ファンタジー',
      });

      expect(meta.title).toBe('星辰の境界線');
      expect(await vfs.exists(`/projects/${meta.id}/project.json`)).toBe(true);
      expect(await vfs.exists(`/projects/${meta.id}/manuscript/order.json`)).toBe(true);
      expect(await vfs.exists(`/projects/${meta.id}/lore`)).toBe(true);
      expect(await vfs.exists(`/projects/${meta.id}/plot`)).toBe(true);
      expect(await vfs.exists(`/projects/${meta.id}/.pop`)).toBe(true);

      const list = await pm.listProjects();
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(meta.id);
    });

    it('saves, loads, reorders, and deletes chapters', async () => {
      const project = await pm.createProject({ title: 'テスト作品' });

      // 1. Save Chapter 1
      await pm.saveChapter(project.id, 'ch1', '第一章 黎明', '夜明けの光が差し込む。');
      // 2. Save Chapter 2
      await pm.saveChapter(project.id, 'ch2', '第二章 暗雲', '不吉な雲が立ち込める。');

      let data = await pm.getProject(project.id);
      expect(data.chapters.length).toBe(2);
      expect(data.meta.totalCharCount).toBe(22);

      const ch1 = await pm.loadChapter(project.id, 'ch1');
      expect(ch1.meta.title).toBe('第一章 黎明');
      expect(ch1.content).toBe('夜明けの光が差し込む。');

      // 3. Reorder Chapters
      await pm.reorderChapters(project.id, ['ch2', 'ch1']);
      data = await pm.getProject(project.id);
      expect(data.chapters[0].id).toBe('ch2');
      expect(data.chapters[1].id).toBe('ch1');

      // 4. Delete Chapter
      await pm.deleteChapter(project.id, 'ch1');
      data = await pm.getProject(project.id);
      expect(data.chapters.length).toBe(1);
      expect(data.chapters[0].id).toBe('ch2');
      expect(await vfs.exists(`/projects/${project.id}/manuscript/ch1.aozora`)).toBe(false);
    });
  });
});
