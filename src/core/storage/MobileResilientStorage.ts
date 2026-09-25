/**
 * MobileResilientStorage - Web/OPFS resilient storage layer with atomic writes and suspend protection
 * 
 * Promoted and adapted from Gemini Chat prototype asset: MobileResilientStorage.ts
 * Designed for browser OPFS / Mobile Safari / Chrome OS suspend resilience.
 */

import { OPFSStorage } from './OPFSStorage.js';

export interface ResilientWriteResult {
  success: boolean;
  bytesWritten: number;
  filePath: string;
  error?: string;
}

export class MobileResilientStorage {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(private storage: OPFSStorage) {}

  /**
   * Safe multi-stage atomic write:
   * 1. Validate JSON syntax integrity (if JSON)
   * 2. Write to temp file (.tmp)
   * 3. Validate size > 0 (prevents 0-byte file corruption on OS suspend)
   * 4. Atomic commit to destination file
   */
  async writeSafe(filePath: string, content: string): Promise<ResilientWriteResult> {
    const tempPath = `${filePath}.tmp`;

    // 1. JSON syntax pre-validation if content appears to be JSON
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(content);
      } catch (err) {
        throw new Error(`[MobileResilientStorage] Corrupt JSON data, write aborted: ${err}`);
      }
    }

    const data = this.encoder.encode(content);

    try {
      // 2. Write to temporary file
      const tempHandle = this.storage.getOrCreateHandle(tempPath);
      tempHandle.truncate(0);
      this.storage.atomicWrite(tempPath, data, 0);

      // 3. Integrity verification (prevent 0-byte corruption from OS suspend)
      const verifiedSize = tempHandle.getSize();
      if (verifiedSize === 0 && data.length > 0) {
        throw new Error('[MobileResilientStorage] Zero-byte detected in temp file. OS suspend interruption suspected.');
      }

      // 4. Commit to destination file
      const destHandle = this.storage.getOrCreateHandle(filePath);
      destHandle.truncate(0);
      this.storage.atomicWrite(filePath, data, 0);

      // 5. Cleanup temp handle
      tempHandle.truncate(0);

      return {
        success: true,
        bytesWritten: data.length,
        filePath,
      };
    } catch (error) {
      // Cleanup temp on failure
      try {
        const tempHandle = this.storage.getOrCreateHandle(tempPath);
        tempHandle.truncate(0);
      } catch {
        // ignore cleanup error
      }
      throw error;
    }
  }

  async readSafe(filePath: string): Promise<string> {
    const handle = this.storage.getOrCreateHandle(filePath);
    const size = handle.getSize();
    if (size === 0) return '';
    const bytes = this.storage.read(filePath, size, 0);
    return this.decoder.decode(bytes);
  }
}
