export type VNodeType = 'file' | 'directory';

export interface VFSStat {
  type: VNodeType;
  size: number;
  mtime: number;
  ctime: number;
}

export interface VFSEntry {
  name: string;
  path: string;
  type: VNodeType;
}

export interface VFSChangeEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
  nodeType: VNodeType;
}

export type VFSWatcher = (event: VFSChangeEvent) => void;

export interface FileSystemAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  readdir(path: string): Promise<VFSEntry[]>;
  stat(path: string): Promise<VFSStat>;
  exists(path: string): Promise<boolean>;
  unlink(path: string): Promise<void>;
  rmdir(path: string, recursive?: boolean): Promise<void>;
}
