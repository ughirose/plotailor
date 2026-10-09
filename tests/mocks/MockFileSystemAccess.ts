/**
 * Mock implementation of W3C File System Access API
 * (FileSystemHandle, FileSystemFileHandle, FileSystemDirectoryHandle, FileSystemWritableFileStream)
 * for Node.js / Vitest automated test environments.
 */

export class MockFileSystemWritableFileStream {
  private fileHandle: MockFileSystemFileHandle;
  private chunks: Uint8Array[] = [];

  constructor(fileHandle: MockFileSystemFileHandle) {
    this.fileHandle = fileHandle;
  }

  async write(data: Uint8Array | string): Promise<void> {
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      this.chunks.push(encoder.encode(data));
    } else {
      this.chunks.push(new Uint8Array(data));
    }
  }

  async close(): Promise<void> {
    const totalLength = this.chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.fileHandle._setData(combined);
  }
}

export class MockFileSystemFileHandle {
  public kind = 'file' as const;
  public name: string;
  private data: Uint8Array = new Uint8Array(0);
  private lastModified: number = Date.now();

  constructor(name: string, initialData?: Uint8Array) {
    this.name = name;
    if (initialData) {
      this.data = new Uint8Array(initialData);
    }
  }

  _setData(data: Uint8Array) {
    this.data = data;
    this.lastModified = Date.now();
  }

  async getFile(): Promise<{
    name: string;
    size: number;
    lastModified: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    text: () => Promise<string>;
  }> {
    const data = this.data;
    const name = this.name;
    const lastModified = this.lastModified;
    return {
      name,
      size: data.byteLength,
      lastModified,
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      text: async () => new TextDecoder().decode(data),
    };
  }

  async createWritable(): Promise<MockFileSystemWritableFileStream> {
    return new MockFileSystemWritableFileStream(this);
  }

  async queryPermission(_options?: any): Promise<string> {
    return 'granted';
  }

  async requestPermission(_options?: any): Promise<string> {
    return 'granted';
  }
}

export class MockFileSystemDirectoryHandle {
  public kind = 'directory' as const;
  public name: string;
  private entriesMap: Map<string, MockFileSystemFileHandle | MockFileSystemDirectoryHandle> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<MockFileSystemDirectoryHandle> {
    let existing = this.entriesMap.get(name);
    if (!existing) {
      if (options?.create) {
        existing = new MockFileSystemDirectoryHandle(name);
        this.entriesMap.set(name, existing);
      } else {
        throw new Error(`NotFoundError: directory '${name}' not found`);
      }
    }

    if (existing.kind !== 'directory') {
      throw new Error(`TypeMismatchError: '${name}' is a file, not a directory`);
    }

    return existing as MockFileSystemDirectoryHandle;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<MockFileSystemFileHandle> {
    let existing = this.entriesMap.get(name);
    if (!existing) {
      if (options?.create) {
        existing = new MockFileSystemFileHandle(name);
        this.entriesMap.set(name, existing);
      } else {
        throw new Error(`NotFoundError: file '${name}' not found`);
      }
    }

    if (existing.kind !== 'file') {
      throw new Error(`TypeMismatchError: '${name}' is a directory, not a file`);
    }

    return existing as MockFileSystemFileHandle;
  }

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    if (!this.entriesMap.has(name)) {
      throw new Error(`NotFoundError: entry '${name}' does not exist`);
    }
    this.entriesMap.delete(name);
  }

  async *entries(): AsyncIterable<[string, MockFileSystemFileHandle | MockFileSystemDirectoryHandle]> {
    for (const entry of this.entriesMap.entries()) {
      yield entry;
    }
  }

  async *values(): AsyncIterable<MockFileSystemFileHandle | MockFileSystemDirectoryHandle> {
    for (const val of this.entriesMap.values()) {
      yield val;
    }
  }

  async queryPermission(_options?: any): Promise<string> {
    return 'granted';
  }

  async requestPermission(_options?: any): Promise<string> {
    return 'granted';
  }
}
