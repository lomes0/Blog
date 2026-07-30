import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Typed error class for API routes. Throw inside any route wrapper to return a
 * structured JSON error response with the given status code.
 *
 * @example
 * throw new ApiError(401, "Unauthorized", "Please sign in");
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly title: string;
  public readonly subtitle?: string;

  constructor(status: number, title: string, subtitle?: string) {
    super(subtitle ? `${title}: ${subtitle}` : title);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.subtitle = subtitle;
  }

  toResponse(): NextResponse {
    return NextResponse.json(
      { error: { title: this.title, subtitle: this.subtitle } },
      { status: this.status },
    );
  }
}

/** The signed-in user, as stored in the database (a full `User` row). */
export type SessionUser = Session["user"];

// ─── Session helpers ─────────────────────────────────────────────────────────

/**
 * The signed-in, enabled user — or a thrown `ApiError`.
 *
 * Prefer `userRoute`, which calls this for you. This stays exported for the few
 * non-route modules that need a user outside a request handler.
 */
export async function requireUser(subtitle?: string): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(401, "Unauthorized", subtitle ?? "Please sign in");
  }
  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }
  return user;
}

/** The signed-in user if there is one, else null. Never throws on absence. */
export async function optionalUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (session.user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }
  return session.user;
}

/**
 * Assert `user` owns `entity`, which is anything carrying an author id.
 *
 * Kept deliberately blunt: it takes the owner id rather than the entity so it
 * cannot be fooled by a row whose ownership field is spelled differently
 * (`authorId` on a Series, `author.id` on a Post). Callers pass the id they
 * actually resolved.
 *
 * For documents, prefer `requireDocument` (`src/lib/documentAccess.ts`), which
 * fetches and authorizes in one step so the row cannot be obtained without the
 * check having run.
 */
export function requireOwner(
  ownerId: string | null | undefined,
  user: SessionUser,
  subtitle: string,
): void {
  if (!ownerId || ownerId !== user.id) {
    throw new ApiError(403, "Forbidden", subtitle);
  }
}

// ─── Route wrappers ──────────────────────────────────────────────────────────

/**
 * Dynamic-segment values for a route, e.g. `{ id: string }`. Defaults to a
 * permissive record for routes with no dynamic segment, where `params` is unused.
 */
type Params = Record<string, string>;

type Handler<Ctx> = (
  request: Request,
  context: Ctx,
) => Promise<Response | NextResponse>;

/** The shape Next.js itself calls: `params` still a promise, possibly absent. */
type NextRouteHandler<P> = (
  request: Request,
  props?: { params?: Promise<P> },
) => Promise<Response | NextResponse>;

export interface RouteOptions {
  /** Label prepended to console.error output (e.g. "Error fetching notes"). */
  errorLabel?: string;
  /** Subtitle for the 401 when no user is signed in. `userRoute` only. */
  signInMessage?: string;
}

function logAndWrap(error: unknown, errorLabel?: string): NextResponse {
  if (error instanceof ApiError) {
    // Only log unexpected server errors (5xx); 4xx are expected client errors
    if (error.status >= 500) {
      if (errorLabel) console.error(`${errorLabel}:`, error);
      else console.error(error);
    }
    return error.toResponse();
  }

  // Unexpected error — always log
  if (errorLabel) console.error(`${errorLabel}:`, error);
  else console.error(error);

  return NextResponse.json(
    {
      error: {
        title: "Something went wrong",
        subtitle: "Please try again later",
      },
    },
    { status: 500 },
  );
}

type AuthMode = "public" | "user" | "optional";

/**
 * Shared body of the three wrappers below.
 *
 * Deliberately **not exported**: a route cannot be written without naming one
 * of `publicRoute` / `userRoute` / `optionalUserRoute`, so the auth decision is
 * always present in the source rather than inferred from the absence of a call.
 * The previous `withApiHandler` did the error handling but left authentication
 * to whatever each handler remembered to do, which is how routes ended up
 * authenticating without checking ownership — and how a route with no check at
 * all looked identical to a route that was meant to be public.
 */
function route<P, Ctx>(
  mode: AuthMode,
  handler: Handler<Ctx>,
  options?: RouteOptions,
): NextRouteHandler<P> {
  return async (request, props) => {
    try {
      const params = ((await props?.params) ?? {}) as P;
      const context = (
        mode === "public" ? { params } : {
          params,
          user: mode === "user"
            ? await requireUser(options?.signInMessage)
            : await optionalUser(),
        }
      ) as Ctx;
      return await handler(request, context);
    } catch (error) {
      return logAndWrap(error, options?.errorLabel);
    }
  };
}

/**
 * A route anyone may call, signed in or not.
 *
 * Every unauthenticated surface in the app is `grep -rn "publicRoute" src/app/api`
 * — that list is the point of this wrapper existing separately.
 */
export const publicRoute = <P = Params>(
  handler: Handler<{ params: P }>,
  options?: RouteOptions,
): NextRouteHandler<P> => route("public", handler, options);

/**
 * A route requiring a signed-in, enabled user, handed to the handler as
 * `context.user`. 401 when absent, 403 when the account is disabled.
 *
 * @example
 * export const DELETE = userRoute<{ id: string }>(
 *   async (request, { params, user }) => {
 *     const doc = await requireDocument(params.id, user, "own");
 *     ...
 *   },
 *   { errorLabel: "Error deleting document" },
 * );
 */
export const userRoute = <P = Params>(
  handler: Handler<{ params: P; user: SessionUser }>,
  options?: RouteOptions,
): NextRouteHandler<P> => route("user", handler, options);

/**
 * A route with both a public and a signed-in branch: `context.user` is the user
 * or `null`. A disabled account is still rejected rather than treated as
 * anonymous.
 */
export const optionalUserRoute = <P = Params>(
  handler: Handler<{ params: P; user: SessionUser | null }>,
  options?: RouteOptions,
): NextRouteHandler<P> => route("optional", handler, options);
