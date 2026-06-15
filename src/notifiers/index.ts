// ─────────────────────────────────────────────────────────────
//  guardo  ·  notifiers/index.ts
//  Built-in notifiers + base class for custom ones.
// ─────────────────────────────────────────────────────────────

import type { Notifier, NotifyPayload, OtpChannel } from "../types";
export { NodemailerNotifier } from "./email";
export type { SmtpConfig, EmailNotifierOptions } from "./email";

// ── Console Notifier ──────────────────────────────────────────
// Default for development - logs OTPs to stdout instead of
// actually sending them.

export class ConsoleNotifier implements Notifier {
  async sendOTP(payload: NotifyPayload): Promise<void> {
    const expiry = payload.expiresInSeconds
      ? ` (expires in ${payload.expiresInSeconds}s)`
      : "";
    console.log(
      `[guardo] OTP for ${payload.to} via ${payload.channel}: ${payload.code}${expiry}`
    );
  }
}

// ── Base Notifier ─────────────────────────────────────────────
// Extend this to build a custom notifier quickly.

export abstract class BaseNotifier implements Notifier {
  abstract sendOTP(payload: NotifyPayload): Promise<void>;

  /** Helper: render a human-friendly message string */
  protected formatMessage(code: string, expiresInSeconds?: number): string {
    const expiry = expiresInSeconds
      ? ` It expires in ${Math.round(expiresInSeconds / 60)} minutes.`
      : "";
    return `Your verification code is: ${code}.${expiry}`;
  }
}

// ── Functional factory ────────────────────────────────────────
// Quick way to build a notifier from a plain function.

export function createNotifier(
  fn: (payload: NotifyPayload) => Promise<void>
): Notifier {
  return { sendOTP: fn };
}

// ── Multi-channel notifier ────────────────────────────────────
// Route email and SMS to separate handlers.

export class MultiChannelNotifier implements Notifier {
  constructor(
    private readonly handlers: Partial<Record<OtpChannel, Notifier>>
  ) {}

  async sendOTP(payload: NotifyPayload): Promise<void> {
    const handler = this.handlers[payload.channel];
    if (!handler) {
      throw new Error(
        `[guardo] No notifier registered for channel: ${payload.channel}`
      );
    }
    await handler.sendOTP(payload);
  }
}
