/**
 * OPFS (Origin Private File System) Storage Abstraction and SyncAccessHandle Interface
 */

export interface SyncAccessHandle {
  read(buffer: ArrayBufferView, options?: { at?: number }): number;
  write(buffer: ArrayBufferView, options?: { at?: number }): number;
  flush(): void;
  truncate(newSize: number): void;
  getSize(): number;
  close(): void;
}

/**
 * In-memory / Node-compatible SyncAccessHandle implementation for testing and non-worker environments.
 */
export class InMemorySyncAccessHandle implements SyncAccessHandle {
  private buffer: Uint8Array;
  private size: number;
  private isClosed: boolean = false;

  constructor(initialCapacity: number = 1024 * 1024) {
    this.buffer = new Uint8Array(initialCapacity);
    this.size = 0;
  }

  private ensureCapacity(required: number): void {
    if (required > this.buffer.byteLength) {
      let newCap = Math.max(this.buffer.byteLength * 2, required);
      const newBuf = new Uint8Array(newCap);
      newBuf.set(this.buffer.subarray(0, this.size));
      this.buffer = newBuf;
    }
  }

  read(target: ArrayBufferView, options?: { at?: number }): number {
    if (this.isClosed) throw new Error('AccessHandle is closed');
    const offset = options?.at ?? 0;
    if (offset >= this.size) return 0;

    const readLen = Math.min(target.byteLength, this.size - offset);
    const targetView = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
    targetView.set(this.buffer.subarray(offset, offset + readLen));
    return readLen;
  }

  write(source: ArrayBufferView, options?: { at?: number }): number {
    if (this.isClosed) throw new Error('AccessHandle is closed');
    const offset = options?.at ?? this.size;
    const sourceView = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);

    this.ensureCapacity(offset + sourceView.byteLength);
    this.buffer.set(sourceView, offset);
    if (offset + sourceView.byteLength > this.size) {
      this.size = offset + sourceView.byteLength;
    }
    return sourceView.byteLength;
  }

  flush(): void {
    if (this.isClosed) throw new Error('AccessHandle is closed');
    // In-memory flush is a no-op
  }

  truncate(newSize: number): void {
    if (this.isClosed) throw new Error('AccessHandle is closed');
    if (newSize < 0) throw new Error('Invalid size for truncate');
    if (newSize < this.size) {
      this.buffer.fill(0, newSize, this.size);
    }
    this.size = newSize;
  }

  getSize(): number {
    if (this.isClosed) throw new Error('AccessHandle is closed');
    return this.size;
  }

  close(): void {
    this.isClosed = true;
  }

  getBuffer(): Uint8Array {
    return this.buffer.subarray(0, this.size);
  }
}

/**
 * OPFS Storage Service managing file access handles and ultra-low latency atomic writes.
 */
export class OPFSStorage {
  private handles: Map<string, SyncAccessHandle> = new Map();

  /**
   * Registers or creates a SyncAccessHandle for a path.
   */
  registerHandle(path: string, handle: SyncAccessHandle): void {
    this.handles.set(path, handle);
  }

  /**
   * Gets an existing handle or creates an InMemorySyncAccessHandle as fallback.
   */
  getOrCreateHandle(path: string): SyncAccessHandle {
    let handle = this.handles.get(path);
    if (!handle) {
      handle = new InMemorySyncAccessHandle();
      this.handles.set(path, handle);
    }
    return handle;
  }

  /**
   * Performs an ultra-low latency atomic write to a target file.
   * Write data at specified offset or zero, and immediately flush to guarantee persistence.
   */
  atomicWrite(path: string, data: Uint8Array, offset: number = 0): void {
    const handle = this.getOrCreateHandle(path);
    handle.write(data, { at: offset });
    handle.flush();
  }

  /**
   * Reads data from path into buffer.
   */
  read(path: string, length: number, offset: number = 0): Uint8Array {
    const handle = this.getOrCreateHandle(path);
    const result = new Uint8Array(length);
    const readBytes = handle.read(result, { at: offset });
    return result.subarray(0, readBytes);
  }

  /**
   * Truncates file at path.
   */
  truncate(path: string, newSize: number): void {
    const handle = this.getOrCreateHandle(path);
    handle.truncate(newSize);
    handle.flush();
  }

  /**
   * Closes handle for path.
   */
  closeHandle(path: string): void {
    const handle = this.handles.get(path);
    if (handle) {
      handle.close();
      this.handles.delete(path);
    }
  }

  /**
   * Closes all active handles.
   */
  closeAll(): void {
    for (const [path, handle] of this.handles.entries()) {
      handle.close();
    }
    this.handles.clear();
  }
}
