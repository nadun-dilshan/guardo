/**
 * Express OTP login - a complete, minimal flow.
 *
 *   npm install guardo express
 *   ts-node examples/express-otp-login.ts
 *
 * In dev (no SMTP config) the OTP is delivered to an Ethereal test inbox and a
 * preview URL is printed to the console.
 */
import express from "express";
import { createAuth } from "guardo";

const app = express();
app.use(express.json());

const auth = createAuth({
  jwt: { secret: process.env.JWT_SECRET ?? "dev-secret-at-least-16-chars" },
  // Resolve your real user record here; omitted = identifier becomes the user.
  resolveUser: async (identifier) => ({ id: identifier, email: identifier }),
});

// 1. Request a code
app.post("/auth/otp", async (req, res) => {
  await auth.otp.send({ identifier: req.body.email, ip: req.ip });
  res.json({ ok: true });
});

// 2. Verify the code and issue tokens
app.post("/auth/login", async (req, res) => {
  try {
    const result = await auth.auth.loginWithOtp({
      identifier: req.body.email,
      otp: req.body.otp,
      meta: { ip: req.ip, userAgent: req.headers["user-agent"] },
    });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});

// 3. Protect a route
app.get("/me", auth.middleware.express(), (req, res) => {
  res.json((req as express.Request & { user: unknown }).user);
});

app.listen(3000, () => console.log("→ http://localhost:3000"));
