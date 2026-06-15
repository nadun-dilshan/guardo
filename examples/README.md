# Examples

Runnable snippets showing common guardo setups. These are illustrative - they
aren't compiled as part of the package build or published to npm.

| File | What it shows |
|------|---------------|
| [`express-otp-login.ts`](./express-otp-login.ts) | A complete Express OTP login flow: send → verify → protect. |
| [`redis-production.ts`](./redis-production.ts) | Production wiring with Redis storage, real SMTP, and lifecycle events. |

Run one with [`ts-node`](https://typestrong.org/ts-node/) (or `tsx`) after
installing the relevant peer dependencies, e.g.:

```bash
npm install guardo express
npx ts-node examples/express-otp-login.ts
```

See the [full documentation](https://guardo.nadun.me) for everything else.
