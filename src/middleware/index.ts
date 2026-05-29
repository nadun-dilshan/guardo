// ─────────────────────────────────────────────────────────────
//  guardo  ·  middleware/index.ts
//  Express & Next.js middleware factories.
// ─────────────────────────────────────────────────────────────

import type {
  ExpressRequest,
  ExpressResponse,
  NextFunction,
  User,
} from "../types";
import type { JwtModule } from "../core/jwt";
import type { SessionModule } from "../core/session";

// ── Helpers ───────────────────────────────────────────────────

function extractBearer(
  req: ExpressRequest
): string | null {
  const auth = req.headers["authorization"];
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

// ── Middleware factory ────────────────────────────────────────

export class MiddlewareModule {
  constructor(
    private readonly jwt: JwtModule,
    private readonly session: SessionModule,
    private readonly resolveUser?: (identifier: string) => Promise<User | null>
  ) {}

  // ── Express ───────────────────────────────────────────────────

  /**
   * Protect Express routes. Attaches `req.user` and `req.session`.
   *
   * @example
   * app.get('/me', auth.middleware.express(), (req, res) => res.json(req.user));
   */
  express() {
    return async (
      req: ExpressRequest,
      res: ExpressResponse,
      next: NextFunction
    ): Promise<void> => {
      const token = extractBearer(req);

      if (!token) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Missing Bearer token.",
        });
        return;
      }

      try {
        const payload = this.jwt.verifyAccessToken(token);

        // Optional: validate session is still active
        if (payload.sessionId) {
          const sessionRecord = await this.session.get(payload.sessionId as string);
          if (!sessionRecord) {
            res.status(401).json({
              error: "Unauthorized",
              message: "Session has been revoked.",
            });
            return;
          }
          req.session = sessionRecord;
          // Touch session to keep it alive
          await this.session.touch(payload.sessionId as string);
        }

        // Attach full user if resolver is provided
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
        res.status(401).json({ error: "Unauthorized", message });
      }
    };
  }

  /**
   * Role-based access control for Express.
   * Must be placed AFTER `auth.middleware.express()`.
   *
   * @example
   * app.get('/admin', auth.middleware.express(), auth.middleware.role(['admin']), handler);
   */
  role(allowedRoles: string[]) {
    return (
      req: ExpressRequest,
      res: ExpressResponse,
      next: NextFunction
    ): void => {
      const user = req.user as (User & { role?: string }) | undefined;

      if (!user) {
        res.status(401).json({ error: "Unauthorized", message: "Not authenticated." });
        return;
      }

      const userRole = user.role ?? "user";
      if (!allowedRoles.includes(userRole)) {
        res.status(403).json({
          error: "Forbidden",
          message: `This route requires one of: ${allowedRoles.join(", ")}.`,
        });
        return;
      }

      next();
    };
  }

  // ── Next.js ───────────────────────────────────────────────────

  /**
   * Next.js Edge middleware.
   * Export from your `middleware.ts` at the project root.
   *
   * @example
   * // middleware.ts
   * export const middleware = auth.middleware.nextjs();
   * export const config = { matcher: ['/api/:path*', '/dashboard/:path*'] };
   */
  nextjs() {
    const jwtModule = this.jwt;

    return async function middleware(request: {
      headers: { get(name: string): string | null };
      nextUrl: { pathname: string };
    }) {
      // Dynamically import next/server to avoid hard dep at module level
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NextResponse } = require("next/server") as {
        NextResponse: {
          next(): unknown;
          json(body: unknown, init?: { status?: number }): unknown;
        };
      };

      const authHeader = request.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

      if (!token) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Missing Bearer token." },
          { status: 401 }
        );
      }

      try {
        jwtModule.verifyAccessToken(token);
        return NextResponse.next();
      } catch {
        return NextResponse.json(
          { error: "Unauthorized", message: "Invalid or expired token." },
          { status: 401 }
        );
      }
    };
  }

  /**
   * Next.js API Route handler wrapper (App Router / Pages Router).
   *
   * @example
   * // app/api/me/route.ts
   * export const GET = auth.middleware.nextjsRoute(async (req, user) => {
   *   return Response.json({ user });
   * });
   */
  nextjsRoute(
    handler: (request: Request, user: User) => Promise<Response>
  ) {
    const jwtModule = this.jwt;
    const sessionModule = this.session;
    const resolveUser = this.resolveUser;

    return async function (request: Request): Promise<Response> {
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

      if (!token) {
        return Response.json(
          { error: "Unauthorized", message: "Missing Bearer token." },
          { status: 401 }
        );
      }

      try {
        const payload = jwtModule.verifyAccessToken(token);

        if (payload.sessionId) {
          const sessionRecord = await sessionModule.get(payload.sessionId as string);
          if (!sessionRecord) {
            return Response.json(
              { error: "Unauthorized", message: "Session has been revoked." },
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
        return Response.json({ error: "Unauthorized", message }, { status: 401 });
      }
    };
  }
}
