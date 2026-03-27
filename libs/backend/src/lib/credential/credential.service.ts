import { Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class CredentialService {
  private credentialsPath = '';
  private safeStorage: typeof import('electron').safeStorage | null = null;

  open(userDataPath: string): void {
    this.credentialsPath = join(userDataPath, 'credentials.json');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.safeStorage = require('electron').safeStorage;
    } catch {
      console.warn('[CredentialService] safeStorage not available — credentials will not be encrypted');
    }
  }

  isEncryptionAvailable(): boolean {
    return this.safeStorage?.isEncryptionAvailable() ?? false;
  }

  setCredential(provider: string, key: string): void {
    const store = this.loadStore();
    if (this.safeStorage?.isEncryptionAvailable()) {
      const encrypted = this.safeStorage.encryptString(key);
      store[provider] = encrypted.toString('latin1');
    } else {
      // Fallback: base64 encode (not truly secure, but functional)
      store[provider] = Buffer.from(key).toString('base64');
    }
    this.saveStore(store);
  }

  getCredential(provider: string): string | null {
    const store = this.loadStore();
    const raw = store[provider];
    if (!raw) return null;

    if (this.safeStorage?.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(raw, 'latin1');
        return this.safeStorage.decryptString(buffer);
      } catch {
        console.error(`[CredentialService] Failed to decrypt credential for ${provider}`);
        return null;
      }
    } else {
      return Buffer.from(raw, 'base64').toString('utf-8');
    }
  }

  hasCredential(provider: string): boolean {
    const store = this.loadStore();
    return !!store[provider];
  }

  deleteCredential(provider: string): void {
    const store = this.loadStore();
    delete store[provider];
    this.saveStore(store);
  }

  private loadStore(): Record<string, string> {
    if (!this.credentialsPath || !existsSync(this.credentialsPath)) {
      return {};
    }
    try {
      return JSON.parse(readFileSync(this.credentialsPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private saveStore(store: Record<string, string>): void {
    writeFileSync(this.credentialsPath, JSON.stringify(store, null, 2), 'utf-8');
  }
}
