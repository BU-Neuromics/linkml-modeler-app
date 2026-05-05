/**
 * Credential storage using Electron's built-in safeStorage API.
 *
 * Encrypted values are written to `userData/credentials.json` as base64 blobs.
 * Falls back to an in-memory map when safeStorage encryption is unavailable
 * (e.g. headless CI, missing keychain daemon).
 */
import path from 'path';
import { app, safeStorage } from 'electron';

const CREDENTIALS_FILE = 'credentials.json';

/** Returns the absolute path to the credentials JSON file in userData. */
function credentialsPath(): string {
  return path.join(app.getPath('userData'), CREDENTIALS_FILE);
}

// In-memory fallback used when safeStorage is unavailable.
const memoryStore = new Map<string, string>();

async function readStore(): Promise<Record<string, string>> {
  try {
    const { promises: fs } = await import('fs');
    const raw = await fs.readFile(credentialsPath(), 'utf8');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeStore(store: Record<string, string>): Promise<void> {
  const { promises: fs } = await import('fs');
  await fs.writeFile(credentialsPath(), JSON.stringify(store, null, 2), 'utf8');
}

export async function storeCredential(key: string, value: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    memoryStore.set(key, value);
    return;
  }
  const encrypted = safeStorage.encryptString(value);
  const store = await readStore();
  store[key] = encrypted.toString('base64');
  await writeStore(store);
}

export async function getCredential(key: string): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) {
    return memoryStore.get(key) ?? null;
  }
  const store = await readStore();
  const encoded = store[key];
  if (!encoded) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch {
    return null;
  }
}

export async function deleteCredential(key: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    memoryStore.delete(key);
    return;
  }
  const store = await readStore();
  delete store[key];
  await writeStore(store);
}
