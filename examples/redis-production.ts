/**
 * Production wiring - Redis storage, real SMTP delivery, and lifecycle events.
 *
 *   npm install guardo ioredis
 */
import Redis from "ioredis";
import {
  createAuth,
  RedisStore,
  NodemailerNotifier,
  RateLimitError,
} from "guardo";

const auth = createAuth({
  jwt: {
    secret: process.env.JWT_SECRET!,
    accessTokenTTL: "15m",
    refreshTokenTTL: "30d",
  },

  // Shared, multi-instance storage
  store: new RedisStore(new Redis(process.env.REDIS_URL!)),

  // Real email delivery
  notifier: new NodemailerNotifier({
    smtp: {
      host: process.env.SMTP_HOST!,
      port: 587,
      secure: false,
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    from: "noreply@myapp.com",
    subject: "Your login code",
  }),

  // Audit + security hooks
  events: {
    "login.success": ({ user }) => console.log("login", user.id),
    "token.reuse_detected": ({ userId }) =>
      console.warn("⚠ refresh-token reuse for", userId),
  },
});

export async function sendCode(email: string, ip: string) {
  try {
    await auth.otp.send({ identifier: email, ip });
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw new Error(`Slow down - retry in ${err.retryAfterSeconds}s`);
    }
    throw err;
  }
}
