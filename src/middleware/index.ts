// ─────────────────────────────────────────────────────────────
//  guardo  ·  middleware/index.ts
//  Express, Fastify & Next.js middleware factories.
// ─────────────────────────────────────────────────────────────

import type {
  ExpressRequest,
  ExpressResponse,
  NextFunction,
  User,
  CookieOptions,
} from "../types";
import type { JwtModule } from "../core/jwt";
import type { SessionModule } from "../core/session";

const DEFAULT_ACCESS_COOKIE = "guardo_access";
const DEFAULT_REFRESH_COOKIE = "guardo_refresh";

// ── Helpers ───────────────────────────────────────────────────

function extractBearer(req: ExpressRequest): string | null {
  const auth = req.headers["authorization"];
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function extractFromCookie(
  req: ExpressRequest,
  cookieName: string
): string | null {
  return req.cookies?.[cookieName] ?? null;
}

function buildCookieAttributes(opts: CookieOptions): Record<string, unknown> {
  return {
    httpOnly: true,
    secure: opts.secure ?? true,
    sameSite: opts.sameSite ?? "lax",
    path: opts.path ?? "/",
    ...(opts.domain && { domain: opts.domain }),
  };
}

// ── Middleware factory ────────────────────────────────────────

export class MiddlewareModule {
  constructor(
    private readonly jwt: JwtModule,
    private readonly session: SessionModule,
    private readonly resolveUser?: (identifier: string) => Promise<User | null>,
    private readonly cookieOpts?: CookieOptions
  ) {}

  // ── Express ───────────────────────────────────────────────────

  /**
   * Protect Express routes. Attaches `req.user` and `req.session`.
   * Reads from Authorization Bearer header by default, or httpOnly cookies
   * if `cookies` was configured in createAuth().
   */
  express() {
    return async (
      req: ExpressRequest,
      res: ExpressResponse,
      next: NextFunction
    ): Promise<void> => {
      const token = this.cookieOpts
        ? extractFromCookie(
            req,
            this.cookieOpts.accessTokenCookie ?? DEFAULT_ACCESS_COOKIE
          )
        : extractBearer(req);

      if (!token) {
        res.status(401).json({
          error: "Unauthorized",
          code: "TOKEN_INVALID",
          message: this.cookieOpts
            ? "Missing auth cookie."
            : "Missing Bearer token.",
        });
        return;
      }

      try {
        const payload = this.jwt.verifyAccessToken(token);

        if (payload.sessionId) {
          const sessionRecord = await this.session.get(
            payload.sessionId as string
          );
          if (!sessionRecord) {
            res.status(401).json({
              error: "Unauthorized",
              code: "SESSION_REVOKED",
              message: "Session has been revoked.",
            });
            return;
          }
          req.session = sessionRecord;
          await this.session.touch(payload.sessionId as string);
        }

        if (this.resolveUser) {
          const user = await this.resolveUser(payload.sub);
          req.user = user ?? payload;
        } else {
          req.user = payload;
        }

        next();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Invalid token.";
        res
          .status(401)
          .json({ error: "Unauthorized", code: "TOKEN_INVALID", message });
      }
    };
  }

  /**
   * Role-based access control for Express.
   * Must be placed AFTER `auth.middleware.express()`.
   */
  role(allowedRoles: string[]) {
    return (
      req: ExpressRequest,
      res: ExpressResponse,
      next: NextFunction
    ): void => {
      const user = req.user as (User & { role?: string }) | undefined;

      if (!user) {
        res.status(401).json({
          error: "Unauthorized",
          code: "SESSION_NOT_FOUND",
          message: "Not authenticated.",
        });
        return;
      }

      const userRole = user.role ?? "user";
      if (!allowedRoles.includes(userRole)) {
        res.status(403).json({
          error: "Forbidden",
          code: "FORBIDDEN",
          message: `This route requires one of: ${allowedRoles.join(", ")}.`,
        });
        return;
      }

      next();
    };
  }

  /**
   * Set auth tokens as httpOnly cookies on an Express response.
   * Use this after login/refresh to send tokens via cookies.
   *
   * @example
   * const result = await auth.auth.loginWithOtp({ identifier, otp });
   * auth.middleware.setTokenCookies(res, result.accessToken, result.refreshToken);
   * res.json({ user: result.user });
   */
  setTokenCookies(
    res: ExpressResponse,
    accessToken: string,
    refreshToken: string
  ): void {
    const opts = this.cookieOpts ?? {};
    const attrs = buildCookieAttributes(opts);
    res.cookie(
      opts.accessTokenCookie ?? DEFAULT_ACCESS_COOKIE,
      accessToken,
      attrs
    );
    res.cookie(
      opts.refreshTokenCookie ?? DEFAULT_REFRESH_COOKIE,
      refreshToken,
      attrs
    );
  }

  /**
   * Clear auth cookies (call on logout).
   */
  clearTokenCookies(res: ExpressResponse): void {
    const opts = this.cookieOpts ?? {};
    const attrs = buildCookieAttributes(opts);
    res.clearCookie(opts.accessTokenCookie ?? DEFAULT_ACCESS_COOKIE, attrs);
    res.clearCookie(opts.refreshTokenCookie ?? DEFAULT_REFRESH_COOKIE, attrs);
  }

  // ── Fastify ───────────────────────────────────────────────────

  /**
   * Fastify plugin/hook for route protection.
   * Attaches `request.user` and `request.session`.
   *
   * @example
   * // Register globally:
   * fastify.addHook('preHandler', auth.middleware.fastify());
   *
   * // Or per-route:
   * fastify.get('/me', { preHandler: auth.middleware.fastify() }, handler);
   */
  fastify() {
    const self = this;
    return async function fastifyGuardoMiddleware(
      request: {
        headers: Record<string, string | string[] | undefined>;
        cookies?: Record<string, string>;
        user?: User | unknown;
        session?: unknown;
      },
      reply: {
        code(status: number): { send(body: unknown): void };
      }
    ): Promise<void> {
      const token = self.cookieOpts
        ? (request.cookies?.[
            self.cookieOpts.accessTokenCookie ?? DEFAULT_ACCESS_COOKIE
          ] ?? null)
        : (() => {
            const auth = request.headers["authorization"];
            const header = Array.isArray(auth) ? auth[0] : auth;
            if (!header?.startsWith("Bearer ")) return null;
            return header.slice(7);
          })();

      if (!token) {
        reply
          .code(401)
          .send({ error: "Unauthorized", code: "TOKEN_INVALID", message: "Missing token." });
        return;
      }

      try {
        const payload = self.jwt.verifyAccessToken(token);

        if (payload.sessionId) {
          const sessionRecord = await self.session.get(
            payload.sessionId as string
          );
          if (!sessionRecord) {
            reply.code(401).send({
              error: "Unauthorized",
              code: "SESSION_REVOKED",
              message: "Session has been revoked.",
            });
            return;
          }
          request.session = sessionRecord;
          await self.session.touch(payload.sessionId as string);
        }

        if (self.resolveUser) {
          const user = await self.resolveUser(payload.sub);
          request.user = user ?? payload;
        } else {
          request.user = payload;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid token.";
        reply
          .code(401)
          .send({ error: "Unauthorized", code: "TOKEN_INVALID", message });
      }
    };
  }

  // ── Next.js ───────────────────────────────────────────────────

  /**
   * Next.js Edge middleware.
   * Export from your `middleware.ts` at the project root.
   */
  nextjs() {
    const jwtModule = this.jwt;
    const cookieOpts = this.cookieOpts;

    return async function middleware(request: {
      headers: { get(name: string): string | null };
      cookies?: { get(name: string): { value: string } | undefined };
      nextUrl: { pathname: string };
    }) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NextResponse } = require("next/server") as {
        NextResponse: {
          next(): unknown;
          json(body: unknown, init?: { status?: number }): unknown;
        };
      };

      let token: string | null = null;
      if (cookieOpts) {
        const cookieName =
          cookieOpts.accessTokenCookie ?? DEFAULT_ACCESS_COOKIE;
        token = request.cookies?.get(cookieName)?.value ?? null;
      } else {
        const authHeader = request.headers.get("authorization");
        token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      }

      if (!token) {
        return NextResponse.json(
          { error: "Unauthorized", code: "TOKEN_INVALID", message: "Missing token." },
          { status: 401 }
        );
      }

      try {
        jwtModule.verifyAccessToken(token);
        return NextResponse.next();
      } catch {
        return NextResponse.json(
          { error: "Unauthorized", code: "TOKEN_INVALID", message: "Invalid or expired token." },
          { status: 401 }
        );
      }
    };
  }

  /**
   * Next.js App Router route handler wrapper.
   */
  nextjsRoute(handler: (request: Request, user: User) => Promise<Response>) {
    const jwtModule = this.jwt;
    const sessionModule = this.session;
    const resolveUser = this.resolveUser;
    const cookieOpts = this.cookieOpts;

    return async function (request: Request): Promise<Response> {
      let token: string | null = null;

      if (cookieOpts) {
        // Parse cookie header manually (Edge doesn't have req.cookies)
        const cookieName =
          cookieOpts.accessTokenCookie ?? DEFAULT_ACCESS_COOKIE;
        const cookieHeader = request.headers.get("cookie") ?? "";
        const match = cookieHeader
          .split(";")
          .find((c) => c.trim().startsWith(`${cookieName}=`));
        token = match ? match.split("=")[1]?.trim() ?? null : null;
      } else {
        const authHeader = request.headers.get("authorization");
        token = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;
      }

      if (!token) {
        return Response.json(
          { error: "Unauthorized", code: "TOKEN_INVALID", message: "Missing token." },
          { status: 401 }
        );
      }

      try {
        const payload = jwtModule.verifyAccessToken(token);

        if (payload.sessionId) {
          const sessionRecord = await sessionModule.get(
            payload.sessionId as string
          );
          if (!sessionRecord) {
            return Response.json(
              { error: "Unauthorized", code: "SESSION_REVOKED", message: "Session has been revoked." },
              { status: 401 }
            );
          }
          await sessionModule.touch(payload.sessionId as string);
        }

        let user: User = { id: payload.sub, ...payload };
        if (resolveUser) {
          const resolved = await resolveUser(payload.sub);
          if (resolved) user = resolved;
        }

        return handler(request, user);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid token.";
        return Response.json(
          { error: "Unauthorized", code: "TOKEN_INVALID", message },
          { status: 401 }
        );
      }
    };
  }
}
