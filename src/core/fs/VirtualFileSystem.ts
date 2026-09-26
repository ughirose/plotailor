import type {
  FileSystemAdapter,
  VFSEntry,
  VFSStat,
  VFSWatcher,
  VFSChangeEvent,
  VNodeType,
} from './types.js';
import { InMemoryAdapter } from './adapters/InMemoryAdapter.js';

export class VirtualFileSystem {
  private adapter: FileSystemAdapter;
  private watchers: Set<VFSWatcher> = new Set();

  constructor(adapter?: FileSystemAdapter) {
    this.adapter = adapter || new InMemoryAdapter();
  }

  public getAdapter(): FileSystemAdapter {
    return this.adapter;
  }

  public setAdapter(adapter: FileSystemAdapter): void {
    this.adapter = adapter;
  }

  public watch(watcher: VFSWatcher): () => void {
    this.watchers.add(watcher);
    return () => this.watchers.delete(watcher);
  }

  private notify(type: 'create' | 'update' | 'delete', path: string, nodeType: VNodeType) {
    const event: VFSChangeEvent = { type, path, nodeType };
    for (const watcher of this.watchers) {
      try {
        watcher(event);
      } catch (err) {
        console.error('VFS watcher error:', err);
      }
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.adapter.exists(path);
  }

  async stat(path: string): Promise<VFSStat> {
    return this.adapter.stat(path);
  }

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    await this.adapter.mkdir(path, recursive);
    this.notify('create', path, 'directory');
  }

  async readdir(path: string): Promise<VFSEntry[]> {
    return this.adapter.readdir(path);
  }

  async readFile(path: string): Promise<Uint8Array> {
    return this.adapter.readFile(path);
  }

  async readText(path: string): Promise<string> {
    return this.adapter.readText(path);
  }

  async readJson<T = unknown>(path: string): Promise<T> {
    const text = await this.readText(path);
    return JSON.parse(text) as T;
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const existed = await this.exists(path);
    await this.adapter.writeFile(path, data);
    this.notify(existed ? 'update' : 'create', path, 'file');
  }

  async writeText(path: string, content: string): Promise<void> {
    const existed = await this.exists(path);
    await this.adapter.writeText(path, content);
    this.notify(existed ? 'update' : 'create', path, 'file');
  }

  async writeJson(path: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await this.writeText(path, content);
  }

  async unlink(path: string): Promise<void> {
    await this.adapter.unlink(path);
    this.notify('delete', path, 'file');
  }

  async rmdir(path: string, recursive: boolean = false): Promise<void> {
    await this.adapter.rmdir(path, recursive);
    this.notify('delete', path, 'directory');
  }

  async move(sourcePath: string, targetPath: string): Promise<void> {
    const st = await this.stat(sourcePath);
    if (st.type === 'file') {
      const data = await this.readFile(sourcePath);
      await this.writeFile(targetPath, data);
      await this.unlink(sourcePath);
    } else {
      await this.mkdir(targetPath, true);
      const entries = await this.readdir(sourcePath);
      for (const entry of entries) {
        const subTarget = targetPath.replace(/\/$/, '') + '/' + entry.name;
        await this.move(entry.path, subTarget);
      }
      await this.rmdir(sourcePath, true);
    }
  }

  async copy(sourcePath: string, targetPath: string): Promise<void> {
    const st = await this.stat(sourcePath);
    if (st.type === 'file') {
      const data = await this.readFile(sourcePath);
      await this.writeFile(targetPath, data);
    } else {
      await this.mkdir(targetPath, true);
      const entries = await this.readdir(sourcePath);
      for (const entry of entries) {
        const subTarget = targetPath.replace(/\/$/, '') + '/' + entry.name;
        await this.copy(entry.path, subTarget);
      }
    }
  }

  async walk(dirPath: string): Promise<VFSEntry[]> {
    const result: VFSEntry[] = [];
    const entries = await this.readdir(dirPath);
    for (const entry of entries) {
      result.push(entry);
      if (entry.type === 'directory') {
        const sub = await this.walk(entry.path);
        result.push(...sub);
      }
    }
    return result;
  }
}
