import type { FileSystemAdapter, VFSEntry, VFSStat, VNodeType } from '../types.js';

export interface FileSystemAccessAdapterOptions {
  rootHandle: FileSystemDirectoryHandle;
}

/**
 * FileSystemAccessAdapter
 * Adapts W3C File System Access API (FileSystemDirectoryHandle) to Plotailor's FileSystemAdapter.
 * Fully supports nested subdirectories, binary/text read/write, stat, and recursive removal.
 */
export class FileSystemAccessAdapter implements FileSystemAdapter {
  private rootHandle: FileSystemDirectoryHandle;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(options: FileSystemAccessAdapterOptions) {
    this.rootHandle = options.rootHandle;
  }

  public getRootHandle(): FileSystemDirectoryHandle {
    return this.rootHandle;
  }

  /**
   * Normalizes and cleans paths defensively, ensuring no escape outside root directory.
   */
  private normalizePathParts(rawPath: string): string[] {
    return rawPath
      .replace(/\\/g, '/')
      .split('/')
      .filter((seg) => seg.length > 0 && seg !== '.' && seg !== '..');
  }

  /**
   * Resolves a path to its parent directory handle and leaf name.
   */
  private async resolvePath(
    rawPath: string,
    createDirectories = false
  ): Promise<{ parentDir: FileSystemDirectoryHandle; name: string }> {
    const parts = this.normalizePathParts(rawPath);
    if (parts.length === 0) {
      throw new Error(`EISDIR: Operation on root directory is invalid: '${rawPath}'`);
    }

    let current = this.rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      try {
        current = await current.getDirectoryHandle(part, { create: createDirectories });
      } catch (err) {
        throw new Error(`ENOENT: Directory not found in path '${rawPath}' at segment '${part}': ${err}`);
      }
    }

    return {
      parentDir: current,
      name: parts[parts.length - 1],
    };
  }

  async exists(path: string): Promise<boolean> {
    const parts = this.normalizePathParts(path);
    if (parts.length === 0) return true; // root exists

    try {
      let current = this.rootHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i], { create: false });
      }
      const leaf = parts[parts.length - 1];
      try {
        await current.getFileHandle(leaf, { create: false });
        return true;
      } catch {
        try {
          await current.getDirectoryHandle(leaf, { create: false });
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<VFSStat> {
    const parts = this.normalizePathParts(path);
    if (parts.length === 0) {
      return {
        type: 'directory',
        size: 0,
        mtime: Date.now(),
        ctime: Date.now(),
      };
    }

    const { parentDir, name } = await this.resolvePath(path, false);

    // Try as file first
    try {
      const fileHandle = await parentDir.getFileHandle(name, { create: false });
      const file = await fileHandle.getFile();
      return {
        type: 'file',
        size: file.size,
        mtime: file.lastModified || Date.now(),
        ctime: file.lastModified || Date.now(),
      };
    } catch {
      // Try as directory
      try {
        await parentDir.getDirectoryHandle(name, { create: false });
        return {
          type: 'directory',
          size: 0,
          mtime: Date.now(),
          ctime: Date.now(),
        };
      } catch {
        throw new Error(`ENOENT: No such file or directory, stat '${path}'`);
      }
    }
  }

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    const parts = this.normalizePathParts(path);
    if (parts.length === 0) return;

    let current = this.rootHandle;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!recursive && i < parts.length - 1) {
        current = await current.getDirectoryHandle(part, { create: false });
      } else {
        current = await current.getDirectoryHandle(part, { create: true });
      }
    }
  }

  async readdir(path: string): Promise<VFSEntry[]> {
    const parts = this.normalizePathParts(path);
    let targetDir = this.rootHandle;

    for (const part of parts) {
      try {
        targetDir = await targetDir.getDirectoryHandle(part, { create: false });
      } catch {
        throw new Error(`ENOENT: Directory not found for readdir '${path}'`);
      }
    }

    const basePath = parts.length === 0 ? '/' : '/' + parts.join('/') + '/';
    const entries: VFSEntry[] = [];

    // Async iteration over directory handle entries
    // Cast to any to handle environments where FileSystemDirectoryHandle iterator is AsyncIterable
    const dirAny = targetDir as any;
    if (typeof dirAny.entries === 'function') {
      for await (const [name, handle] of dirAny.entries()) {
        const type: VNodeType = handle.kind === 'directory' ? 'directory' : 'file';
        entries.push({
          name,
          path: basePath + name,
          type,
        });
      }
    } else if (typeof dirAny.values === 'function') {
      for await (const handle of dirAny.values()) {
        const type: VNodeType = handle.kind === 'directory' ? 'directory' : 'file';
        entries.push({
          name: handle.name,
          path: basePath + handle.name,
          type,
        });
      }
    }

    return entries;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const { parentDir, name } = await this.resolvePath(path, false);
    try {
      const fileHandle = await parentDir.getFileHandle(name, { create: false });
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (err) {
      throw new Error(`ENOENT: Unable to read file '${path}': ${err}`);
    }
  }

  async readText(path: string): Promise<string> {
    const bytes = await this.readFile(path);
    return this.decoder.decode(bytes);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const { parentDir, name } = await this.resolvePath(path, true);
    const fileHandle = await parentDir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(data as any);
    } finally {
      await writable.close();
    }
  }

  async writeText(path: string, content: string): Promise<void> {
    const bytes = this.encoder.encode(content);
    await this.writeFile(path, bytes);
  }

  async unlink(path: string): Promise<void> {
    const { parentDir, name } = await this.resolvePath(path, false);
    try {
      await parentDir.removeEntry(name, { recursive: false });
    } catch (err) {
      throw new Error(`ENOENT: Unable to unlink '${path}': ${err}`);
    }
  }

  async rmdir(path: string, recursive: boolean = false): Promise<void> {
    const { parentDir, name } = await this.resolvePath(path, false);
    try {
      await parentDir.removeEntry(name, { recursive });
    } catch (err) {
      throw new Error(`Unable to rmdir '${path}': ${err}`);
    }
  }
}
