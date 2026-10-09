import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFileSystem } from '../src/core/fs/VirtualFileSystem.js';
import { LocalDirectorySyncEngine, type SyncConnectionStatus } from '../src/core/fs/LocalDirectorySyncEngine.js';
import { MockFileSystemDirectoryHandle } from './mocks/MockFileSystemAccess.js';
import { ProjectManager } from '../src/core/project/ProjectManager.js';

describe('LocalDirectorySyncEngine & ProjectManager integration', () => {
  let vfs: VirtualFileSystem;
  let syncEngine: LocalDirectorySyncEngine;
  let rootMock: MockFileSystemDirectoryHandle;
  let statusLog: SyncConnectionStatus[] = [];

  beforeEach(() => {
    vfs = new VirtualFileSystem();
    statusLog = [];
    syncEngine = new LocalDirectorySyncEngine(vfs, {
      onStatusChange: (s) => statusLog.push(s),
    });
    rootMock = new MockFileSystemDirectoryHandle('my-novel-repo');
  });

  it('mounts local directory handle and transitions status to connected', async () => {
    expect(syncEngine.getStatus()).toBe('disconnected');

    await syncEngine.mountDirectoryHandle(rootMock as unknown as FileSystemDirectoryHandle);

    expect(syncEngine.getStatus()).toBe('connected');
    expect(syncEngine.getDirectoryName()).toBe('my-novel-repo');
    expect(statusLog).toContain('connected');
  });

  it('executes full ProjectManager workflow directly on mounted local directory', async () => {
    await syncEngine.mountDirectoryHandle(rootMock as unknown as FileSystemDirectoryHandle);

    const pm = new ProjectManager(vfs);
    await pm.initWorkspace();

    // Create project
    const project = await pm.createProject({
      title: 'ローカル保存小説',
      author: 'テスト執筆者',
    });

    expect(project.title).toBe('ローカル保存小説');
    expect(await vfs.exists(`/projects/${project.id}/project.json`)).toBe(true);

    // Save and load chapter directly to mock local directory
    await pm.saveChapter(project.id, 'ch1', '第1章', 'ローカル同期テキスト。');
    const loaded = await pm.loadChapter(project.id, 'ch1');
    expect(loaded.content).toBe('ローカル同期テキスト。');

    // Verify file exists in mock directory structure
    const projectsDir = await rootMock.getDirectoryHandle('projects');
    const projDir = await projectsDir.getDirectoryHandle(project.id);
    const msDir = await projDir.getDirectoryHandle('manuscript');
    const file = await msDir.getFileHandle('ch1.aozora');
    const text = await (await file.getFile()).text();
    expect(text).toBe('ローカル同期テキスト。');
  });

  it('disconnects and resets status to disconnected', async () => {
    await syncEngine.mountDirectoryHandle(rootMock as unknown as FileSystemDirectoryHandle);
    expect(syncEngine.getStatus()).toBe('connected');

    syncEngine.disconnect();
    expect(syncEngine.getStatus()).toBe('disconnected');
    expect(syncEngine.getDirectoryName()).toBe(null);
  });
});
