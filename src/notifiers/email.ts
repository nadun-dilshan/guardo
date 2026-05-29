// ─────────────────────────────────────────────────────────────
//  guardo  ·  notifiers/email.ts
//
//  Two modes:
//    1. No config  →  Ethereal (fake inbox, preview URL in console)
//    2. SmtpConfig →  Real SMTP (Gmail, Resend, SendGrid, etc.)
// ─────────────────────────────────────────────────────────────

import nodemailer, { type Transporter } from "nodemailer";
import type { Notifier, NotifyPayload } from "../types";

// ── SMTP config shape ─────────────────────────────────────────

export interface SmtpConfig {
  /** e.g. "smtp.gmail.com", "smtp.resend.com", "smtp.sendgrid.net" */
  host: string;
  port?: number;        // default 587
  secure?: boolean;     // true = port 465 TLS, false = STARTTLS (default)
  user: string;         // SMTP username / email
  pass: string;         // SMTP password / API key
}

export interface EmailNotifierOptions {
  /** SMTP credentials. Omit to use Ethereal (dev/test). */
  smtp?: SmtpConfig;

  /** The "From" address shown to recipients.
   *  Falls back to smtp.user, then a generic Ethereal address. */
  from?: string;

  /** Email subject line. Default: "Your verification code" */
  subject?: string;

  /**
   * Custom HTML builder. Receives the OTP code and expiry seconds.
   * Return an HTML string. If omitted, the built-in template is used.
   */
  buildHtml?: (code: string, expiresInSeconds?: number) => string;

  /**
   * Custom plain-text builder (used as email fallback).
   * If omitted, a simple text version is generated automatically.
   */
  buildText?: (code: string, expiresInSeconds?: number) => string;
}

// ── Notifier class ────────────────────────────────────────────

export class NodemailerNotifier implements Notifier {
  private transporterPromise: Promise<Transporter | null>;
  private fromAddress?: string;
  private readonly subject: string;
  private readonly buildHtml: (code: string, exp?: number) => string;
  private readonly buildText: (code: string, exp?: number) => string;

  constructor(options: EmailNotifierOptions = {}) {
    this.subject = options.subject ?? "Your verification code";
    this.fromAddress = options.from;
    this.buildHtml = options.buildHtml ?? defaultHtml;
    this.buildText = options.buildText ?? defaultText;

    this.transporterPromise = options.smtp
      ? Promise.resolve(createSmtpTransport(options.smtp))
      : createEtherealTransport()
          .then(({ transporter, user, pass }) => {
            console.log("\n┌─────────────────────────────────────────────┐");
            console.log("│  📬  Ethereal test inbox created              │");
            console.log(`│  User : ${user.padEnd(37)}│`);
            console.log(`│  Pass : ${pass.padEnd(37)}│`);
            console.log("│  Preview emails at https://ethereal.email     │");
            console.log("└─────────────────────────────────────────────┘\n");
            this.fromAddress ??= `"Auth Flow Kit" <${user}>`;
            return transporter;
          })
          .catch(() => {
            // Ethereal unreachable (no internet / sandbox) — fall back silently
            console.log(
              "[guardo] Ethereal unavailable — OTPs will be printed to console instead.\n" +
              "                Pass smtp config to send real emails."
            );
            return null; // signals sendOTP to use console fallback
          });
  }

  async sendOTP(payload: NotifyPayload): Promise<void> {
    const transporter = await this.transporterPromise;

    // No transporter = Ethereal failed → console fallback
    if (!transporter) {
      const expiry = payload.expiresInSeconds ? ` (expires in ${payload.expiresInSeconds}s)` : "";
      console.log(
        `\n┌── OTP CODE ──────────────────────────────────┐\n` +
        `│  To      : ${payload.to.padEnd(36)}│\n` +
        `│  Code    : ${payload.code.padEnd(36)}│\n` +
        `│  Channel : ${payload.channel.padEnd(36)}│\n` +
        `└──────────────────────────────────────────────┘\n`
      );
      return;
    }

    const html = this.buildHtml(payload.code, payload.expiresInSeconds);
    const text = this.buildText(payload.code, payload.expiresInSeconds);

    const info = await transporter.sendMail({
      from: this.fromAddress ?? `"Auth" <noreply@example.com>`,
      to: payload.to,
      subject: this.subject,
      html,
      text,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`\n📧  OTP email preview  →  ${previewUrl}\n`);
    }
  }
}

// ── Transport factories ───────────────────────────────────────

function createSmtpTransport(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port ?? 587,
    secure: cfg.secure ?? false,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

async function createEtherealTransport(): Promise<{
  transporter: Transporter;
  user: string;
  pass: string;
}> {
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  return { transporter, user: testAccount.user, pass: testAccount.pass };
}

// ── Default email templates ───────────────────────────────────

function expiryLine(exp?: number): string {
  if (!exp) return "";
  const mins = Math.round(exp / 60);
  return mins > 0 ? `${mins} minute${mins !== 1 ? "s" : ""}` : `${exp} seconds`;
}

function defaultText(code: string, expiresInSeconds?: number): string {
  const expiry = expiryLine(expiresInSeconds);
  return [
    `Your verification code is: ${code}`,
    expiry ? `This code expires in ${expiry}.` : "",
    "",
    "If you didn't request this, you can safely ignore this email.",
  ]
    .filter(Boolean)
    .join("\n");
}

function defaultHtml(code: string, expiresInSeconds?: number): string {
  const expiry = expiryLine(expiresInSeconds);
  const digits = code.split("").map(
    (d) => `
    <td style="
      display:inline-block;
      width:44px; height:56px;
      line-height:56px;
      text-align:center;
      font-size:28px;
      font-weight:700;
      color:#1a1a2e;
      background:#f0f4ff;
      border:2px solid #c7d2fe;
      border-radius:8px;
      margin:0 4px;
      font-family:'Courier New',monospace;
    ">${d}</td>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">

      <table width="480" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;max-width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🔐</div>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
              Verification Code
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 32px;text-align:center;">
            <p style="margin:0 0 8px;color:#64748b;font-size:15px;">
              Use this code to verify your identity
            </p>

            <!-- OTP digits -->
            <table align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;">
              <tr>${digits}</tr>
            </table>

            ${expiry ? `
            <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
              ⏱ Expires in <strong style="color:#64748b;">${expiry}</strong>
            </p>` : ""}

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">

            <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
              If you didn't request this code, you can safely ignore this email.<br>
              Never share this code with anyone.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#cbd5e1;font-size:12px;">
              Sent by guardo · This is an automated message
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
