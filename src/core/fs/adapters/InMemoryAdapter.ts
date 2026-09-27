import type { FileSystemAdapter, VFSEntry, VFSStat, VNodeType } from '../types.js';

interface InMemoryNode {
  type: VNodeType;
  data?: Uint8Array;
  children?: Map<string, InMemoryNode>;
  mtime: number;
  ctime: number;
}

interface SerializedNode {
  type: VNodeType;
  text?: string;
  children?: Record<string, SerializedNode>;
  mtime: number;
  ctime: number;
}

export class InMemoryAdapter implements FileSystemAdapter {
  private root: InMemoryNode = {
    type: 'directory',
    children: new Map(),
    mtime: Date.now(),
    ctime: Date.now(),
  };

  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private storageKey: string | null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(storageKey: string | null = 'plotailor_vfs_tree') {
    this.storageKey = storageKey;
    if (this.storageKey && typeof localStorage !== 'undefined') {
      this.loadFromStorage();
    }
  }

  private serializeNode(node: InMemoryNode): SerializedNode {
    const serialized: SerializedNode = {
      type: node.type,
      mtime: node.mtime,
      ctime: node.ctime,
    };
    if (node.type === 'file' && node.data) {
      serialized.text = this.decoder.decode(node.data);
    } else if (node.type === 'directory' && node.children) {
      serialized.children = {};
      for (const [name, child] of node.children.entries()) {
        serialized.children[name] = this.serializeNode(child);
      }
    }
    return serialized;
  }

  private deserializeNode(serialized: SerializedNode): InMemoryNode {
    const node: InMemoryNode = {
      type: serialized.type,
      mtime: serialized.mtime || Date.now(),
      ctime: serialized.ctime || Date.now(),
    };
    if (serialized.type === 'file') {
      node.data = serialized.text ? this.encoder.encode(serialized.text) : new Uint8Array(0);
    } else if (serialized.type === 'directory') {
      node.children = new Map();
      if (serialized.children) {
        for (const [name, child] of Object.entries(serialized.children)) {
          node.children.set(name, this.deserializeNode(child));
        }
      }
    }
    return node;
  }

  private saveToStorage(): void {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const serialized = this.serializeNode(this.root);
        localStorage.setItem(this.storageKey!, JSON.stringify(serialized));
      } catch (err) {
        console.warn('VFS persist error:', err);
      }
    }, 50);
  }

  private loadFromStorage(): void {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed: SerializedNode = JSON.parse(raw);
        if (parsed && parsed.type === 'directory') {
          this.root = this.deserializeNode(parsed);
        }
      }
    } catch (err) {
      console.warn('VFS load error:', err);
    }
  }

  private normalizePath(rawPath: string): string[] {
    return rawPath
      .replace(/\\/g, '/')
      .split('/')
      .filter((seg) => seg.length > 0 && seg !== '.');
  }

  private getNode(pathParts: string[]): InMemoryNode | null {
    let current: InMemoryNode = this.root;
    for (const part of pathParts) {
      if (current.type !== 'directory' || !current.children) return null;
      const next = current.children.get(part);
      if (!next) return null;
      current = next;
    }
    return current;
  }

  async exists(path: string): Promise<boolean> {
    const parts = this.normalizePath(path);
    return this.getNode(parts) !== null;
  }

  async stat(path: string): Promise<VFSStat> {
    const parts = this.normalizePath(path);
    const node = this.getNode(parts);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }
    return {
      type: node.type,
      size: node.type === 'file' ? node.data?.byteLength ?? 0 : 0,
      mtime: node.mtime,
      ctime: node.ctime,
    };
  }

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    const parts = this.normalizePath(path);
    let current = this.root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current.children) {
        throw new Error(`ENOTDIR: not a directory`);
      }
      let next = current.children.get(part);
      if (!next) {
        if (!recursive && i < parts.length - 1) {
          throw new Error(`ENOENT: parent directory does not exist for '${path}'`);
        }
        next = {
          type: 'directory',
          children: new Map(),
          mtime: Date.now(),
          ctime: Date.now(),
        };
        current.children.set(part, next);
        current.mtime = Date.now();
      } else if (next.type !== 'directory') {
        throw new Error(`EEXIST: file already exists in path '${path}'`);
      }
      current = next;
    }
    this.saveToStorage();
  }

  async readdir(path: string): Promise<VFSEntry[]> {
    const parts = this.normalizePath(path);
    const node = this.getNode(parts);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, readdir '${path}'`);
    }
    if (node.type !== 'directory' || !node.children) {
      throw new Error(`ENOTDIR: not a directory, readdir '${path}'`);
    }

    const basePath = parts.length === 0 ? '/' : '/' + parts.join('/') + '/';
    const entries: VFSEntry[] = [];
    for (const [name, child] of node.children.entries()) {
      entries.push({
        name,
        path: basePath + name,
        type: child.type,
      });
    }
    return entries;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const parts = this.normalizePath(path);
    const node = this.getNode(parts);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (node.type !== 'file' || !node.data) {
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
    }
    return new Uint8Array(node.data);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const parts = this.normalizePath(path);
    if (parts.length === 0) {
      throw new Error(`EISDIR: illegal operation on root directory`);
    }
    const fileName = parts[parts.length - 1];
    const dirParts = parts.slice(0, parts.length - 1);

    await this.mkdir(dirParts.join('/'), true);
    const parentNode = this.getNode(dirParts);
    if (!parentNode || !parentNode.children) {
      throw new Error(`ENOENT: could not resolve directory for '${path}'`);
    }

    const existing = parentNode.children.get(fileName);
    const now = Date.now();
    if (existing && existing.type === 'directory') {
      throw new Error(`EISDIR: cannot overwrite directory with file '${path}'`);
    }

    parentNode.children.set(fileName, {
      type: 'file',
      data: new Uint8Array(data),
      mtime: now,
      ctime: existing ? existing.ctime : now,
    });
    parentNode.mtime = now;
    this.saveToStorage();
  }

  async readText(path: string): Promise<string> {
    const bytes = await this.readFile(path);
    return this.decoder.decode(bytes);
  }

  async writeText(path: string, content: string): Promise<void> {
    const bytes = this.encoder.encode(content);
    await this.writeFile(path, bytes);
  }

  async unlink(path: string): Promise<void> {
    const parts = this.normalizePath(path);
    if (parts.length === 0) {
      throw new Error(`EPERM: cannot remove root`);
    }
    const fileName = parts[parts.length - 1];
    const parentParts = parts.slice(0, parts.length - 1);
    const parent = this.getNode(parentParts);
    if (!parent || !parent.children || !parent.children.has(fileName)) {
      throw new Error(`ENOENT: no such file '${path}'`);
    }
    const target = parent.children.get(fileName)!;
    if (target.type === 'directory') {
      throw new Error(`EISDIR: cannot unlink directory, use rmdir '${path}'`);
    }
    parent.children.delete(fileName);
    parent.mtime = Date.now();
    this.saveToStorage();
  }

  async rmdir(path: string, recursive: boolean = false): Promise<void> {
    const parts = this.normalizePath(path);
    if (parts.length === 0) {
      throw new Error(`EPERM: cannot remove root`);
    }
    const dirName = parts[parts.length - 1];
    const parentParts = parts.slice(0, parts.length - 1);
    const parent = this.getNode(parentParts);
    if (!parent || !parent.children || !parent.children.has(dirName)) {
      throw new Error(`ENOENT: no such directory '${path}'`);
    }
    const target = parent.children.get(dirName)!;
    if (target.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory '${path}'`);
    }
    if (!recursive && target.children && target.children.size > 0) {
      throw new Error(`ENOTEMPTY: directory not empty '${path}'`);
    }
    parent.children.delete(dirName);
    parent.mtime = Date.now();
    this.saveToStorage();
  }
}
