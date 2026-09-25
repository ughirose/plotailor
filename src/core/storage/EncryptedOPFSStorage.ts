/**
 * EncryptedOPFSStorage
 * Web Crypto API (PBKDF2 + AES-GCM-256) Zero Telemetry OPFS Manuscript Storage
 */

export class InvalidPassphraseError extends Error {
  constructor(message = 'Invalid passphrase or corrupted authentication tag') {
    super(message);
    this.name = 'InvalidPassphraseError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface EncryptedStorageOptions {
  passphrase?: string;
  pbkdf2Iterations?: number;
  saltSize?: number;
  ivSize?: number;
}

const MAGIC_HEADER = new Uint8Array([69, 78, 67, 79, 80, 70, 83, 49]); // "ENCOPFS1"
const MAGIC_SIZE = 8;
const DEFAULT_SALT_SIZE = 16;
const DEFAULT_IV_SIZE = 12;
const HMAC_TAG_SIZE = 32;
const HEADER_SIZE = MAGIC_SIZE + DEFAULT_SALT_SIZE + DEFAULT_IV_SIZE + HMAC_TAG_SIZE; // 68 bytes
const DEFAULT_PBKDF2_ITERATIONS = 100000;

function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is not available in this environment');
}

/**
 * Derives AES-GCM-256 key and HMAC-SHA256 key from passphrase and salt using PBKDF2.
 */
export async function deriveKeys(
  passphrase: string,
  salt: Uint8Array,
  iterations = DEFAULT_PBKDF2_ITERATIONS
): Promise<{ aesKey: CryptoKey; hmacKey: CryptoKey }> {
  const cryptoApi = getCrypto();
  const enc = new TextEncoder();
  const passphraseBytes = enc.encode(passphrase);

  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    passphraseBytes as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await cryptoApi.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    512 // 64 bytes
  );

  const aesKeyBytes = derivedBits.slice(0, 32);
  const hmacKeyBytes = derivedBits.slice(32, 64);

  const aesKey = await cryptoApi.subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const hmacKey = await cryptoApi.subtle.importKey(
    'raw',
    hmacKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  return { aesKey, hmacKey };
}

/**
 * Encrypts plaintext payload using Web Crypto PBKDF2 + AES-GCM-256 + HMAC-SHA256.
 */
export async function encryptPayload(
  data: Uint8Array,
  passphrase: string,
  options?: EncryptedStorageOptions
): Promise<Uint8Array> {
  const cryptoApi = getCrypto();
  const iterations = options?.pbkdf2Iterations ?? DEFAULT_PBKDF2_ITERATIONS;

  const salt = new Uint8Array(DEFAULT_SALT_SIZE);
  cryptoApi.getRandomValues(salt);

  const iv = new Uint8Array(DEFAULT_IV_SIZE);
  cryptoApi.getRandomValues(iv);

  const { aesKey, hmacKey } = await deriveKeys(passphrase, salt, iterations);

  const ciphertextBuffer = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    aesKey,
    data as unknown as BufferSource
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  // Compute HMAC over salt + iv + ciphertext
  const dataToSign = new Uint8Array(salt.length + iv.length + ciphertext.length);
  dataToSign.set(salt, 0);
  dataToSign.set(iv, salt.length);
  dataToSign.set(ciphertext, salt.length + iv.length);

  const hmacBuffer = await cryptoApi.subtle.sign(
    { name: 'HMAC' },
    hmacKey,
    dataToSign as unknown as BufferSource
  );
  const hmacTag = new Uint8Array(hmacBuffer);

  // Assemble full encrypted payload
  const result = new Uint8Array(HEADER_SIZE + ciphertext.length);
  result.set(MAGIC_HEADER, 0);
  result.set(salt, MAGIC_SIZE);
  result.set(iv, MAGIC_SIZE + DEFAULT_SALT_SIZE);
  result.set(hmacTag, MAGIC_SIZE + DEFAULT_SALT_SIZE + DEFAULT_IV_SIZE);
  result.set(ciphertext, HEADER_SIZE);

  return result;
}

/**
 * Decrypts encrypted payload using Web Crypto PBKDF2 + AES-GCM-256 + HMAC-SHA256.
 */
export async function decryptPayload(
  encryptedData: Uint8Array,
  passphrase: string,
  options?: EncryptedStorageOptions
): Promise<Uint8Array> {
  if (encryptedData.length < HEADER_SIZE) {
    throw new InvalidPassphraseError('Corrupted file: header size is invalid');
  }

  // Check Magic Header
  for (let i = 0; i < MAGIC_SIZE; i++) {
    if (encryptedData[i] !== MAGIC_HEADER[i]) {
      throw new StorageError('Invalid file format: missing magic header');
    }
  }

  const salt = encryptedData.subarray(MAGIC_SIZE, MAGIC_SIZE + DEFAULT_SALT_SIZE);
  const iv = encryptedData.subarray(
    MAGIC_SIZE + DEFAULT_SALT_SIZE,
    MAGIC_SIZE + DEFAULT_SALT_SIZE + DEFAULT_IV_SIZE
  );
  const storedHmacTag = encryptedData.subarray(
    MAGIC_SIZE + DEFAULT_SALT_SIZE + DEFAULT_IV_SIZE,
    HEADER_SIZE
  );
  const ciphertext = encryptedData.subarray(HEADER_SIZE);

  const iterations = options?.pbkdf2Iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const cryptoApi = getCrypto();

  let aesKey: CryptoKey;
  let hmacKey: CryptoKey;
  try {
    const keys = await deriveKeys(passphrase, salt, iterations);
    aesKey = keys.aesKey;
    hmacKey = keys.hmacKey;
  } catch {
    throw new InvalidPassphraseError();
  }

  // Verify HMAC signature over salt + iv + ciphertext
  const signedData = new Uint8Array(salt.length + iv.length + ciphertext.length);
  signedData.set(salt, 0);
  signedData.set(iv, salt.length);
  signedData.set(ciphertext, salt.length + iv.length);

  const isValidHmac = await cryptoApi.subtle.verify(
    { name: 'HMAC' },
    hmacKey,
    storedHmacTag as unknown as BufferSource,
    signedData as unknown as BufferSource
  );

  if (!isValidHmac) {
    throw new InvalidPassphraseError('Invalid passphrase or tampered ciphertext');
  }

  // Decrypt ciphertext with AES-GCM-256
  try {
    const decryptedBuffer = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      aesKey,
      ciphertext as unknown as BufferSource
    );
    return new Uint8Array(decryptedBuffer);
  } catch {
    throw new InvalidPassphraseError('Failed to decrypt payload');
  }
}

export class EncryptedOPFSStorage {
  private passphrase?: string;
  private rootDirHandle?: FileSystemDirectoryHandle;
  private options: EncryptedStorageOptions;

  constructor(options: EncryptedStorageOptions = {}) {
    this.passphrase = options.passphrase;
    this.options = options;
  }

  public setPassphrase(passphrase: string): void {
    this.passphrase = passphrase;
  }

  public getPassphrase(): string | undefined {
    return this.passphrase;
  }

  public setRootDirHandle(rootDirHandle: FileSystemDirectoryHandle): void {
    this.rootDirHandle = rootDirHandle;
  }

  public async getRootDir(): Promise<FileSystemDirectoryHandle> {
    if (this.rootDirHandle) {
      return this.rootDirHandle;
    }
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
      this.rootDirHandle = await navigator.storage.getDirectory();
      return this.rootDirHandle;
    }
    throw new StorageError('OPFS is not available in the current environment');
  }

  private async resolveFileHandle(
    path: string,
    create = false
  ): Promise<{ fileHandle: FileSystemFileHandle; parentDir: FileSystemDirectoryHandle; filename: string }> {
    const root = await this.getRootDir();
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new StorageError('Invalid empty path');
    }

    const filename = parts.pop()!;
    let currentDir = root;

    for (const segment of parts) {
      try {
        currentDir = await currentDir.getDirectoryHandle(segment, { create });
      } catch (err) {
        throw new StorageError(`Failed to access directory path segment "${segment}": ${(err as Error).message}`);
      }
    }

    try {
      const fileHandle = await currentDir.getFileHandle(filename, { create });
      return { fileHandle, parentDir: currentDir, filename };
    } catch {
      throw new StorageError(`File not found or cannot be accessed: "${path}"`);
    }
  }

  public async writeFile(
    path: string,
    content: Uint8Array | ArrayBuffer | string,
    passphrase?: string
  ): Promise<void> {
    const pwd = passphrase ?? this.passphrase;
    if (!pwd) {
      throw new InvalidPassphraseError('Passphrase is required for writing encrypted files');
    }

    let inputBytes: Uint8Array;
    if (typeof content === 'string') {
      inputBytes = new TextEncoder().encode(content);
    } else if (content instanceof ArrayBuffer) {
      inputBytes = new Uint8Array(content);
    } else {
      inputBytes = content;
    }

    const encrypted = await encryptPayload(inputBytes, pwd, this.options);

    const { fileHandle } = await this.resolveFileHandle(path, true);

    if (typeof fileHandle.createWritable === 'function') {
      const writable = await fileHandle.createWritable();
      await writable.write(encrypted as unknown as BufferSource);
      await writable.close();
    } else {
      // Support mock handles or direct file write standard
      throw new StorageError('Writable stream not supported on file handle');
    }
  }

  public async readFile(path: string, passphrase?: string): Promise<Uint8Array> {
    const pwd = passphrase ?? this.passphrase;
    if (!pwd) {
      throw new InvalidPassphraseError('Passphrase is required for reading encrypted files');
    }

    const { fileHandle } = await this.resolveFileHandle(path, false);
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    const encryptedBytes = new Uint8Array(arrayBuffer);

    return decryptPayload(encryptedBytes, pwd, this.options);
  }

  public async readFileAsString(path: string, passphrase?: string): Promise<string> {
    const decryptedBytes = await this.readFile(path, passphrase);
    return new TextDecoder().decode(decryptedBytes);
  }

  public async exists(path: string): Promise<boolean> {
    try {
      await this.resolveFileHandle(path, false);
      return true;
    } catch {
      return false;
    }
  }

  public async deleteFile(path: string): Promise<void> {
    const { parentDir, filename } = await this.resolveFileHandle(path, false);
    try {
      await parentDir.removeEntry(filename);
    } catch (err) {
      throw new StorageError(`Failed to delete file "${path}": ${(err as Error).message}`);
    }
  }

  public async listFiles(dirPath = ''): Promise<string[]> {
    let targetDir = await this.getRootDir();

    if (dirPath) {
      const parts = dirPath.split('/').filter(Boolean);
      for (const segment of parts) {
        try {
          targetDir = await targetDir.getDirectoryHandle(segment, { create: false });
        } catch {
          return [];
        }
      }
    }

    const files: string[] = [];

    // Check async iterable support on FileSystemDirectoryHandle
    if (typeof (targetDir as any).values === 'function') {
      for await (const entry of (targetDir as any).values()) {
        if (entry.kind === 'file') {
          files.push(entry.name);
        }
      }
    } else if (typeof (targetDir as any).entries === 'function') {
      for await (const [name, entry] of (targetDir as any).entries()) {
        if (entry.kind === 'file') {
          files.push(name);
        }
      }
    }

    return files;
  }

  public async verifyPassphrase(path: string, passphrase?: string): Promise<boolean> {
    const pwd = passphrase ?? this.passphrase;
    if (!pwd) return false;

    try {
      await this.readFile(path, pwd);
      return true;
    } catch (err) {
      if (err instanceof InvalidPassphraseError) {
        return false;
      }
      throw err;
    }
  }
}
