import type { FileSystemAdapter, VFSEntry, VFSStat, VNodeType } from '../types.js';

interface InMemoryNode {
  type: VNodeType;
  data?: Uint8Array;
  children?: Map<string, InMemoryNode>;
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
  }
}
