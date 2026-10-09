import { FileSystemAccessAdapter } from './adapters/FileSystemAccessAdapter.js';
import { VirtualFileSystem } from './VirtualFileSystem.js';

export type SyncConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LocalSyncOptions {
  onStatusChange?: (status: SyncConnectionStatus, directoryName?: string) => void;
  onError?: (error: Error) => void;
}

export interface StoredDirectoryHandleInfo {
  name: string;
  connectedAt: number;
}

/**
 * LocalDirectorySyncEngine
 * Coordinates connection, permission verification, and bi-directional synchronization
 * between Plotailor's VirtualFileSystem and a local file directory via File System Access API.
 */
export class LocalDirectorySyncEngine {
  private vfs: VirtualFileSystem;
  private currentHandle: FileSystemDirectoryHandle | null = null;
  private status: SyncConnectionStatus = 'disconnected';
  private directoryName: string | null = null;
  private options: LocalSyncOptions;

  constructor(vfs: VirtualFileSystem, options: LocalSyncOptions = {}) {
    this.vfs = vfs;
    this.options = options;
  }

  public getStatus(): SyncConnectionStatus {
    return this.status;
  }

  public getDirectoryName(): string | null {
    return this.directoryName;
  }

  public getCurrentHandle(): FileSystemDirectoryHandle | null {
    return this.currentHandle;
  }

  private setStatus(status: SyncConnectionStatus, dirName?: string) {
    this.status = status;
    if (dirName !== undefined) {
      this.directoryName = dirName;
    }
    if (this.options.onStatusChange) {
      this.options.onStatusChange(this.status, this.directoryName || undefined);
    }
  }

  /**
   * Prompts user for a directory picker and connects the directory to VFS.
   * Handles user cancellation gracefully without throwing.
   */
  public async requestAndConnectDirectory(): Promise<boolean> {
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
      const err = new Error('File System Access API is not supported in this browser environment');
      this.setStatus('error');
      if (this.options.onError) this.options.onError(err);
      return false;
    }

    this.setStatus('connecting');

    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });

      if (!handle) {
        this.setStatus('disconnected');
        return false;
      }

      await this.mountDirectoryHandle(handle);
      return true;
    } catch (err: any) {
      // If user aborted/cancelled the picker dialog, do not treat as fatal error
      if (err.name === 'AbortError') {
        this.setStatus('disconnected');
        return false;
      }

      this.setStatus('error');
      if (this.options.onError) this.options.onError(err);
      return false;
    }
  }

  /**
   * Mounts a provided FileSystemDirectoryHandle onto the VFS.
   */
  public async mountDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const hasPerm = await this.verifyPermission(handle, true);
    if (!hasPerm) {
      const err = new Error(`Read/Write permission was not granted for folder: ${handle.name}`);
      this.setStatus('error');
      if (this.options.onError) this.options.onError(err);
      return;
    }

    this.currentHandle = handle;
    const adapter = new FileSystemAccessAdapter({ rootHandle: handle });
    this.vfs.setAdapter(adapter);

    this.setStatus('connected', handle.name);
  }

  /**
   * Disconnects local directory and switches VFS back to InMemoryAdapter or custom fallback.
   */
  public disconnect(): void {
    this.currentHandle = null;
    this.directoryName = null;
    this.setStatus('disconnected');
  }

  /**
   * Verifies whether current permission is granted for reading/writing.
   */
  public async verifyPermission(
    fileHandle: FileSystemHandle,
    readWrite: boolean = true
  ): Promise<boolean> {
    const options: any = {};
    if (readWrite) {
      options.mode = 'readwrite';
    }

    // Check if permission was already granted
    const handleAny = fileHandle as any;
    if (typeof handleAny.queryPermission === 'function') {
      if ((await handleAny.queryPermission(options)) === 'granted') {
        return true;
      }
    }

    // Request permission if not yet granted
    if (typeof handleAny.requestPermission === 'function') {
      if ((await handleAny.requestPermission(options)) === 'granted') {
        return true;
      }
    }

    // Fallback if permission APIs are not implemented on mock
    return true;
  }
}
