import { describe, it, expect, beforeEach } from 'vitest';
import {
  EncryptedOPFSStorage,
  InvalidPassphraseError,
  StorageError,
  encryptPayload,
  decryptPayload,
} from '../src/core/storage/EncryptedOPFSStorage.js';

export class MockFileSystemWritableFileStream {
  private data: Uint8Array = new Uint8Array(0);
  private onClose: (data: Uint8Array) => void;

  constructor(onClose: (data: Uint8Array) => void) {
    this.onClose = onClose;
  }

  async write(chunk: BufferSource): Promise<void> {
    const chunkBytes = new Uint8Array(
      chunk instanceof ArrayBuffer
        ? chunk
        : (chunk as ArrayBufferView).buffer.slice(
            (chunk as ArrayBufferView).byteOffset,
            (chunk as ArrayBufferView).byteOffset + (chunk as ArrayBufferView).byteLength
          )
    );
    const newBuffer = new Uint8Array(this.data.length + chunkBytes.length);
    newBuffer.set(this.data, 0);
    newBuffer.set(chunkBytes, this.data.length);
    this.data = newBuffer;
  }

  async close(): Promise<void> {
    this.onClose(this.data);
  }
}

export class MockFileSystemFileHandle {
  readonly kind = 'file' as const;
  readonly name: string;
  private data: Uint8Array = new Uint8Array(0);

  constructor(name: string, initialData: Uint8Array = new Uint8Array(0)) {
    this.name = name;
    this.data = initialData;
  }

  async getFile(): Promise<File> {
    return new File([this.data as unknown as BlobPart], this.name);
  }

  async createWritable(): Promise<MockFileSystemWritableFileStream> {
    return new MockFileSystemWritableFileStream((writtenData) => {
      this.data = writtenData;
    });
  }

  getRawBytes(): Uint8Array {
    return this.data;
  }
}

export class MockFileSystemDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly name: string;
  private files = new Map<string, MockFileSystemFileHandle>();
  private subdirs = new Map<string, MockFileSystemDirectoryHandle>();

  constructor(name = 'root') {
    this.name = name;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemFileHandle> {
    if (this.files.has(name)) {
      return this.files.get(name)!;
    }
    if (options?.create) {
      const fileHandle = new MockFileSystemFileHandle(name);
      this.files.set(name, fileHandle);
      return fileHandle;
    }
    throw new Error(`File not found: ${name}`);
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<MockFileSystemDirectoryHandle> {
    if (this.subdirs.has(name)) {
      return this.subdirs.get(name)!;
    }
    if (options?.create) {
      const dirHandle = new MockFileSystemDirectoryHandle(name);
      this.subdirs.set(name, dirHandle);
      return dirHandle;
    }
    throw new Error(`Directory not found: ${name}`);
  }

  async removeEntry(name: string): Promise<void> {
    if (this.files.has(name)) {
      this.files.delete(name);
      return;
    }
    if (this.subdirs.has(name)) {
      this.subdirs.delete(name);
      return;
    }
    throw new Error(`Entry not found: ${name}`);
  }

  async *values() {
    for (const file of this.files.values()) {
      yield file;
    }
    for (const subdir of this.subdirs.values()) {
      yield subdir;
    }
  }

  async *entries() {
    for (const [name, file] of this.files.entries()) {
      yield [name, file] as [string, MockFileSystemFileHandle];
    }
    for (const [name, subdir] of this.subdirs.entries()) {
      yield [name, subdir] as [string, MockFileSystemDirectoryHandle];
    }
  }
}

describe('Web Crypto AES-GCM-256 + PBKDF2 Low-level Payload Encryption', () => {
  const TEST_PASSPHRASE = 'SecretPassphrase123!';
  const TEST_OPTIONS = { pbkdf2Iterations: 1000 };

  it('should encrypt and decrypt binary payload correctly', async () => {
    const plaintext = new TextEncoder().encode('Hello, Plotailor Local OPFS Encryption!');
    const encrypted = await encryptPayload(plaintext, TEST_PASSPHRASE, TEST_OPTIONS);

    expect(encrypted.length).toBeGreaterThan(68);

    const decrypted = await decryptPayload(encrypted, TEST_PASSPHRASE, TEST_OPTIONS);
    expect(new TextDecoder().decode(decrypted)).toBe('Hello, Plotailor Local OPFS Encryption!');
  });

  it('should fail decryption when given wrong passphrase', async () => {
    const plaintext = new TextEncoder().encode('Confidential Manuscript Draft');
    const encrypted = await encryptPayload(plaintext, TEST_PASSPHRASE, TEST_OPTIONS);

    await expect(decryptPayload(encrypted, 'WrongPassword', TEST_OPTIONS)).rejects.toThrow(
      InvalidPassphraseError
    );
  });

  it('should detect tampered ciphertext via HMAC and GCM authentication tag verification', async () => {
    const plaintext = new TextEncoder().encode('Tamper Resistance Check');
    const encrypted = await encryptPayload(plaintext, TEST_PASSPHRASE, TEST_OPTIONS);

    // Tamper with ciphertext byte (after header offset 68)
    const tampered = new Uint8Array(encrypted);
    tampered[70] ^= 0xff;

    await expect(decryptPayload(tampered, TEST_PASSPHRASE, TEST_OPTIONS)).rejects.toThrow(
      InvalidPassphraseError
    );
  });

  it('should detect tampered HMAC header tag', async () => {
    const plaintext = new TextEncoder().encode('Header Integrity Check');
    const encrypted = await encryptPayload(plaintext, TEST_PASSPHRASE, TEST_OPTIONS);

    // Tamper with HMAC tag byte (offset 36 to 68)
    const tampered = new Uint8Array(encrypted);
    tampered[40] ^= 0xff;

    await expect(decryptPayload(tampered, TEST_PASSPHRASE, TEST_OPTIONS)).rejects.toThrow(
      InvalidPassphraseError
    );
  });
});

describe('EncryptedOPFSStorage Operations & Zero Telemetry Verification', () => {
  let mockRootDir: MockFileSystemDirectoryHandle;
  let storage: EncryptedOPFSStorage;
  const PASSPHRASE = 'MyManuscriptVaultPasswordKey';
  const STORAGE_OPTIONS = { pbkdf2Iterations: 1000 };

  beforeEach(() => {
    mockRootDir = new MockFileSystemDirectoryHandle('opfs-root');
    storage = new EncryptedOPFSStorage(STORAGE_OPTIONS);
    storage.setPassphrase(PASSPHRASE);
    storage.setRootDirHandle(mockRootDir as unknown as FileSystemDirectoryHandle);
  });

  it('should transparently write and read encrypted manuscript text file', async () => {
    const path = 'manuscript.txt';
    const content = 'Chapter 1: The Secret In The Stars.\nPlotailor IDE manuscript content.';

    await storage.writeFile(path, content);

    const exists = await storage.exists(path);
    expect(exists).toBe(true);

    const readText = await storage.readFileAsString(path);
    expect(readText).toBe(content);
  });

  it('should enforce Zero Telemetry: disk contains only encrypted binary and no plaintext fragments', async () => {
    const path = 'secret-manuscript.txt';
    const sensitiveContent = 'TOP_SECRET_MANUSCRIPT_PROSE_PLOT_TWIST_98765';

    await storage.writeFile(path, sensitiveContent);

    // Fetch the raw file handle from mock OPFS storage
    const mockFileHandle = await mockRootDir.getFileHandle(path);
    const rawStoredBytes = mockFileHandle.getRawBytes();

    // Verify magic header 'ENCOPFS1'
    const headerMagicStr = new TextDecoder().decode(rawStoredBytes.subarray(0, 8));
    expect(headerMagicStr).toBe('ENCOPFS1');

    // Confirm that the sensitive plaintext string does NOT appear anywhere in the raw binary stored on disk
    const rawStoredStr = String.fromCharCode(...rawStoredBytes);
    expect(rawStoredStr.includes('TOP_SECRET')).toBe(false);
    expect(rawStoredStr.includes('MANUSCRIPT')).toBe(false);
    expect(rawStoredStr.includes('PROSE_PLOT_TWIST')).toBe(false);
  });

  it('should support binary data (Uint8Array and ArrayBuffer)', async () => {
    const path = 'data/binary-chapter.bin';
    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xfe, 0xff, 0x42, 0x99]);

    await storage.writeFile(path, binaryData);

    const readBinary = await storage.readFile(path);
    expect(Array.from(readBinary)).toEqual(Array.from(binaryData));
  });

  it('should handle nested directory paths cleanly', async () => {
    const path = 'drafts/2026/chapter1.txt';
    const content = 'Draft 1 content for nested directory storage.';

    await storage.writeFile(path, content);

    expect(await storage.exists(path)).toBe(true);
    expect(await storage.readFileAsString(path)).toBe(content);
  });

  it('should delete files cleanly and verify existence', async () => {
    const path = 'temp-chapter.txt';
    await storage.writeFile(path, 'Temporary content');

    expect(await storage.exists(path)).toBe(true);
    await storage.deleteFile(path);
    expect(await storage.exists(path)).toBe(false);

    await expect(storage.readFile(path)).rejects.toThrow(StorageError);
  });

  it('should list files in root and subdirectories', async () => {
    await storage.writeFile('file1.txt', 'Content 1');
    await storage.writeFile('file2.txt', 'Content 2');

    const fileList = await storage.listFiles();
    expect(fileList).toContain('file1.txt');
    expect(fileList).toContain('file2.txt');
  });

  it('should verify passphrase correctness with verifyPassphrase()', async () => {
    const path = 'auth-test.txt';
    await storage.writeFile(path, 'Authentication verification content');

    const isValid = await storage.verifyPassphrase(path, PASSPHRASE);
    expect(isValid).toBe(true);

    const isWrongValid = await storage.verifyPassphrase(path, 'WrongPassphrase');
    expect(isWrongValid).toBe(false);
  });

  it('should throw InvalidPassphraseError if reading without passphrase or wrong passphrase', async () => {
    const path = 'guarded.txt';
    await storage.writeFile(path, 'Guarded content', 'PasswordA');

    await expect(storage.readFile(path, 'PasswordB')).rejects.toThrow(InvalidPassphraseError);

    // No passphrase provided
    const noPassStorage = new EncryptedOPFSStorage(STORAGE_OPTIONS);
    noPassStorage.setRootDirHandle(mockRootDir as unknown as FileSystemDirectoryHandle);

    await expect(noPassStorage.readFile(path)).rejects.toThrow(InvalidPassphraseError);
  });
});
