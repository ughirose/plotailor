import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFileSystem } from '../src/core/fs/VirtualFileSystem.js';
import { InMemoryAdapter } from '../src/core/fs/adapters/InMemoryAdapter.js';
import { ProjectManager } from '../src/core/project/ProjectManager.js';
import { LoreEntityManager } from '../src/core/lore/LoreEntityManager.js';
import { ProjectDuplicateEngine } from '../src/core/project/ProjectDuplicateEngine.js';

describe('ProjectDuplicateEngine', () => {
  let vfs: VirtualFileSystem;
  let pm: ProjectManager;
  let loreManager: LoreEntityManager;
  let duplicateEngine: ProjectDuplicateEngine;

  beforeEach(() => {
    vfs = new VirtualFileSystem(new InMemoryAdapter());
    pm = new ProjectManager(vfs);
    loreManager = new LoreEntityManager(vfs);
    duplicateEngine = new ProjectDuplicateEngine(vfs);
  });

  it('duplicates a complete project with chapters, lore, and remapped IDs', async () => {
    // 1. Create source project
    const sourceMeta = await pm.createProject({
      id: 'source_proj',
      title: '銀河開拓記',
      author: '星野創',
      description: 'SF長編',
    });

    // Save chapters
    await pm.saveChapter('source_proj', 'ch_1', '第一章', '宇宙船発進。char_alice');
    await pm.saveChapter('source_proj', 'ch_2', '第二章', '未知の惑星。char_bob');

    // Save lore entities with relations
    loreManager.setEntities([
      {
        id: 'char_alice',
        name: 'アリス',
        category: 'character',
        description: '操縦士',
        relations: [{ targetId: 'char_bob', label: '相棒' }],
      },
      {
        id: 'char_bob',
        name: 'ボブ',
        category: 'character',
        description: '機関士',
        relations: [{ targetId: 'char_alice', label: '相棒' }],
      },
    ]);
    await loreManager.saveToVFS('source_proj');

    // 2. Perform duplicate
    const res = await duplicateEngine.duplicateProject('source_proj');

    expect(res.sourceProjectId).toBe('source_proj');
    expect(res.targetProjectId).not.toBe('source_proj');
    expect(res.targetMeta.title).toBe('銀河開拓記（コピー）');
    expect(res.targetMeta.author).toBe('星野創');
    expect(res.targetMeta.createdAt).toBeGreaterThan(0);

    // 3. Verify target project data
    const targetProjData = await pm.getProject(res.targetProjectId);
    expect(targetProjData.chapters.length).toBe(2);

    const targetCh1Id = targetProjData.chapters[0].id;
    const targetCh2Id = targetProjData.chapters[1].id;

    expect(targetCh1Id).not.toBe('ch_1');
    expect(targetCh2Id).not.toBe('ch_2');

    const targetCh1 = await pm.loadChapter(res.targetProjectId, targetCh1Id);
    expect(targetCh1.meta.title).toBe('第一章');

    // 4. Verify target lore entities and remapped foreign keys
    const targetLoreManager = new LoreEntityManager(vfs);
    await targetLoreManager.loadFromVFS(res.targetProjectId);
    const targetEntities = targetLoreManager.getEntities();

    expect(targetEntities.length).toBe(2);
    const targetAlice = targetEntities.find((e) => e.name === 'アリス')!;
    const targetBob = targetEntities.find((e) => e.name === 'ボブ')!;

    expect(targetAlice.id).not.toBe('char_alice');
    expect(targetBob.id).not.toBe('char_bob');

    // Check remapped relations (foreign key consistency)
    expect(targetAlice.relations?.[0].targetId).toBe(targetBob.id);
    expect(targetBob.relations?.[0].targetId).toBe(targetAlice.id);

    // 5. Verify activeChapterId remapping in target metadata
    expect(targetProjData.meta.activeChapterId).toBe(targetCh2Id);
  });

  it('supports custom title and custom target project ID options', async () => {
    await pm.createProject({
      id: 'proj_orig',
      title: 'オリジナルタイトル',
    });

    const res = await duplicateEngine.duplicateProject('proj_orig', {
      title: 'カスタム複製タイトル',
      targetProjectId: 'custom_target_id',
    });

    expect(res.targetProjectId).toBe('custom_target_id');
    expect(res.targetMeta.title).toBe('カスタム複製タイトル');

    const targetProjData = await pm.getProject('custom_target_id');
    expect(targetProjData.meta.title).toBe('カスタム複製タイトル');
  });

  it('maintains source project immutability during and after duplication', async () => {
    await pm.createProject({
      id: 'immutable_source',
      title: '不変ソース作品',
    });
    await pm.saveChapter('immutable_source', 'ch_init', '序章', '原文のテキスト。');

    const sourceBefore = await pm.getProject('immutable_source');

    await duplicateEngine.duplicateProject('immutable_source');

    const sourceAfter = await pm.getProject('immutable_source');
    expect(sourceAfter.meta.title).toBe(sourceBefore.meta.title);
    expect(sourceAfter.chapters).toEqual(sourceBefore.chapters);

    const loadedCh = await pm.loadChapter('immutable_source', 'ch_init');
    expect(loadedCh.content).toBe('原文のテキスト。');
  });

  it('throws error when source project does not exist', async () => {
    await expect(duplicateEngine.duplicateProject('non_existent_proj')).rejects.toThrow(
      'Source project non_existent_proj not found'
    );
  });

  it('throws error when target project directory already exists', async () => {
    await pm.createProject({ id: 'proj_a', title: '作品A' });
    await pm.createProject({ id: 'proj_b', title: '作品B' });

    await expect(
      duplicateEngine.duplicateProject('proj_a', { targetProjectId: 'proj_b' })
    ).rejects.toThrow('already exists');
  });

  it('duplicates PRH rules across VFS and localStorage when present', async () => {
    await pm.createProject({ id: 'proj_with_prh', title: '辞書付き作品' });

    // Seed VFS PRH rules
    await vfs.mkdir('/projects/proj_with_prh/editor', true);
    await vfs.writeText(
      '/projects/proj_with_prh/editor/prh_rules.json',
      JSON.stringify([{ id: 'r1', expected: 'エルフ', patterns: ['妖精'] }])
    );

    // Seed localStorage if mockable
    const mockStorage = new Map<string, string>();
    mockStorage.set(
      'plotailor_project_proj_with_prh_prh_rules',
      JSON.stringify([{ id: 'r1', expected: 'エルフ', patterns: ['妖精'] }])
    );
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockStorage.set(k, v),
    };

    const res = await duplicateEngine.duplicateProject('proj_with_prh', {
      targetProjectId: 'proj_duplicated_prh',
    });

    // Check VFS duplicate
    const targetPrhVfs = await vfs.readText('/projects/proj_duplicated_prh/editor/prh_rules.json');
    expect(JSON.parse(targetPrhVfs)).toEqual([{ id: 'r1', expected: 'エルフ', patterns: ['妖精'] }]);

    // Check localStorage duplicate
    const targetPrhStorage = (globalThis as any).localStorage.getItem(
      'plotailor_project_proj_duplicated_prh_prh_rules'
    );
    expect(JSON.parse(targetPrhStorage)).toEqual([{ id: 'r1', expected: 'エルフ', patterns: ['妖精'] }]);
  });
});
