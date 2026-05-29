// ─────────────────────────────────────────────────────────────
//  guardo  ·  adapters/memory.ts
//  Simple in-memory store — great for development & tests.
//  NOT suitable for production (data is lost on restart).
// ─────────────────────────────────────────────────────────────

import type { StorageAdapter } from "../types";

interface Entry {
  value: string;
  expiresAt: number | null; // ms timestamp, null = no expiry
}

export class MemoryStore implements StorageAdapter {
  private store = new Map<string, Entry>();

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(prefix: string): Promise<string[]> {
    const now = Date.now();
    const result: string[] = [];
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (key.startsWith(prefix)) result.push(key);
    }
    return result;
  }

  /** Convenience: wipe everything (useful in tests) */
  clear(): void {
    this.store.clear();
  }
}
