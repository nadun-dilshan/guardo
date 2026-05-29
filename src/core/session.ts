// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/session.ts
//  Multi-device session management backed by StorageAdapter.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import type { StorageAdapter, Session, SessionMeta } from "../types";

const SESSION_KEY = (sessionId: string) => `session:${sessionId}`;
const USER_SESSIONS_KEY = (userId: string) => `user_sessions:${userId}:`;

export class SessionModule {
  constructor(
    private readonly store: StorageAdapter,
    /** TTL for sessions in seconds (should match refresh token TTL) */
    private readonly ttlSeconds: number = 7 * 24 * 60 * 60
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

    // Also maintain an index of session IDs per user for listing
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

  // ── Update ───────────────────────────────────────────────────

  /** Touch the `lastActiveAt` timestamp (call this on each authenticated request) */
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
