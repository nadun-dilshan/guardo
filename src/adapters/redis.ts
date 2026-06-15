// ─────────────────────────────────────────────────────────────
//  guardo  ·  adapters/redis.ts
//  Redis-backed store for production use.
//  Requires `ioredis` as a peer dependency.
// ─────────────────────────────────────────────────────────────

import type { StorageAdapter } from "../types";

/** Minimal interface so we don't hard-depend on ioredis types */
interface RedisClient {
  set(key: string, value: string, ex: "EX", ttl: number): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

export class RedisStore implements StorageAdapter {
  constructor(private readonly client: RedisClient) {}

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, "EX", ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async keys(prefix: string): Promise<string[]> {
    // KEYS is O(N) - acceptable for moderate datasets.
    // For high-traffic apps consider SCAN instead.
    return this.client.keys(`${prefix}*`);
  }
}
