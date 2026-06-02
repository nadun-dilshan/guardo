// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/session.ts
//  Multi-device session management backed by StorageAdapter.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import type { StorageAdapter, Session, SessionMeta } from "../types";
import type { GuardoEventEmitter } from "./events";

const SESSION_KEY = (sessionId: string) => `session:${sessionId}`;
const USER_SESSIONS_KEY = (userId: string) => `user_sessions:${userId}:`;
const ALL_SESSIONS_PREFIX = "session:";

export class SessionModule {
  constructor(
    private readonly store: StorageAdapter,
    private readonly ttlSeconds: number = 7 * 24 * 60 * 60,
    private readonly events?: GuardoEventEmitter
  ) {}

  // ── Create ───────────────────────────────────────────────────

  async create(userId: string, meta?: SessionMeta): Promise<Session> {
    const sessionId = `sess_${crypto.randomBytes(16).toString("hex")}`;
    const now = new Date().toISOString();

    const session: Session = {
      sessionId,
      userId,
      device: meta?.device,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      createdAt: now,
      lastActiveAt: now,
    };

    await this.store.set(
      SESSION_KEY(sessionId),
      JSON.stringify(session),
      this.ttlSeconds
    );

    await this.store.set(
      `${USER_SESSIONS_KEY(userId)}${sessionId}`,
      sessionId,
      this.ttlSeconds
    );

    return session;
  }

  // ── Read ─────────────────────────────────────────────────────

  async get(sessionId: string): Promise<Session | null> {
    const raw = await this.store.get(SESSION_KEY(sessionId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  async list(userId: string): Promise<Session[]> {
    const indexKeys = await this.store.keys(USER_SESSIONS_KEY(userId));
    const sessions: Session[] = [];

    for (const indexKey of indexKeys) {
      const sessionId = await this.store.get(indexKey);
      if (!sessionId) continue;

      const session = await this.get(sessionId);
      if (session) sessions.push(session);
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  }

  /**
   * List all sessions across all users.
   * Useful for admin dashboards and monitoring.
   * @param opts.limit  Max sessions to return (default: 100)
   * @param opts.offset Cursor offset for pagination (default: 0)
   */
  async listAll(opts: { limit?: number; offset?: number } = {}): Promise<{
    sessions: Session[];
    total: number;
    hasMore: boolean;
  }> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    const allKeys = await this.store.keys(ALL_SESSIONS_PREFIX);
    const sessions: Session[] = [];

    for (const key of allKeys) {
      // Only process direct session keys, not the user-index keys
      if (key.startsWith("session:sess_")) {
        const raw = await this.store.get(key);
        if (raw) {
          try {
            sessions.push(JSON.parse(raw) as Session);
          } catch {
            // skip corrupted
          }
        }
      }
    }

    sessions.sort(
      (a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );

    const total = sessions.length;
    const paginated = sessions.slice(offset, offset + limit);

    return {
      sessions: paginated,
      total,
      hasMore: offset + paginated.length < total,
    };
  }

  // ── Update ───────────────────────────────────────────────────

  async touch(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;

    session.lastActiveAt = new Date().toISOString();
    await this.store.set(
      SESSION_KEY(sessionId),
      JSON.stringify(session),
      this.ttlSeconds
    );
  }

  // ── Revoke ───────────────────────────────────────────────────

  async revoke(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;

    await this.store.delete(SESSION_KEY(sessionId));
    await this.store.delete(
      `${USER_SESSIONS_KEY(session.userId)}${sessionId}`
    );

    this.events?.emit("session.revoked", {
      sessionId,
      userId: session.userId,
    });
  }

  async revokeAll(userId: string): Promise<number> {
    const indexKeys = await this.store.keys(USER_SESSIONS_KEY(userId));
    let count = 0;

    for (const indexKey of indexKeys) {
      const sessionId = await this.store.get(indexKey);
      if (sessionId) {
        await this.store.delete(SESSION_KEY(sessionId));
        count++;
      }
      await this.store.delete(indexKey);
    }

    return count;
  }

  // ── Validate ─────────────────────────────────────────────────

  async isValid(sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId);
    return session !== null;
  }
}
