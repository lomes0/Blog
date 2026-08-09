import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  type AgentTokenSummary,
  touchAgentToken,
  verifyAgentToken,
} from "@/lib/agentTokens";
import type { z } from "zod";

/**
 * Typed error class for API routes. Throw inside any route wrapper to return a
 * structured JSON error response with the given status code.
 *
 * @example
 * throw new ApiError(401, "Unauthorized", "Please sign in");
 */
export interface ApiErrorOptions {
  /**
   * A stable machine-readable tag on the error body, for the rare case where
   * two failures share a status and the client must act on them differently.
   *
   * Deliberately not on every error. Prose is what a user reads and what a
   * developer changes freely; a code is a contract, so it exists only where a
   * caller genuinely has to branch — approval's two 409s, where "someone saved
   * first" ends the attempt and "this changed while you were reviewing" means
   * recompute and try again. Matching on the title instead would make the
   * wording load-bearing without anything saying so.
   */
  code?: string;
  /**
   * Extra response headers. Exists for `WWW-Authenticate`, which RFC 7235 says
   * a 401 should carry and which a client cannot infer from the body.
   */
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly title: string;
  public readonly subtitle?: string;
  public readonly code?: string;
  public readonly headers?: Record<string, string>;

  constructor(
    status: number,
    title: string,
    subtitle?: string,
    options?: ApiErrorOptions,
  ) {
    super(subtitle ? `${title}: ${subtitle}` : title);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.subtitle = subtitle;
    this.code = options?.code;
    this.headers = options?.headers;
  }

  toResponse(): NextResponse {
    return NextResponse.json(
      {
        error: {
          title: this.title,
          subtitle: this.subtitle,
          // Omitted rather than sent as null, so the body of an error with no
          // code is byte-for-byte what it was before codes existed.
          ...(this.code ? { code: this.code } : {}),
        },
      },
      { status: this.status, headers: this.headers },
    );
  }
}

/** The signed-in user, as stored in the database (a full `User` row). */
export type SessionUser = Session["user"];

// ─── Session helpers ─────────────────────────────────────────────────────────

/**
 * The signed-in, enabled user — or a thrown `ApiError`.
 *
 * Module-private on purpose. `userRoute` is the only caller, and that is the
 * property the scheme rests on: a handler cannot resolve a session except by
 * declaring which wrapper it wants, so "forgot to check auth" is not a
 * reachable state. It was exported "for non-route modules that need a user",
 * but no such module exists — the export was only an unguarded way back in.
 */
async function requireUser(subtitle?: string): Promise<SessionUser> {
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

/**
 * The signed-in user if there is one, else null. Never throws on absence.
 * Module-private for the same reason as `requireUser` — reach it through
 * `optionalUserRoute`.
 */
async function optionalUser(): Promise<SessionUser | null> {
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

// ─── Agent token helpers ─────────────────────────────────────────────────────

/**
 * The bearer credential on this request — or a thrown `ApiError`.
 *
 * Module-private for the same reason as `requireUser`: reach it through
 * `tokenRoute`, so the auth requirement is stated where the handler is exported.
 *
 * **Every refusal answers the same 401.** `verifyAgentToken` distinguishes
 * malformed from unknown from revoked from expired, and that distinction is for
 * the server's log; returning it would tell anyone who asks that a given secret
 * used to be a real token. The exception is `disabled`, which is a 403 matching
 * `requireUser` — reaching it already required a valid credential, so it
 * discloses nothing the caller did not have.
 */
async function requireAgentToken(request: Request): Promise<AgentTokenSummary> {
  const [scheme, presented] = (request.headers.get("authorization") ?? "")
    .split(" ");
  const result = await verifyAgentToken(
    /^Bearer$/i.test(scheme ?? "") ? presented ?? "" : "",
  );

  if (result.ok) {
    // Throttled to once a minute inside, so this is usually no query at all.
    await touchAgentToken(result.token);
    return result.token;
  }

  if (result.reason === "disabled") {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }
  // Logged, never sent. `malformed` is noise (any stray header reaches it), so
  // it is not worth a line; the other three describe a credential that was
  // real, which is worth knowing about.
  if (result.reason !== "malformed") {
    console.error(`Agent token refused: ${result.reason}`);
  }
  throw new ApiError(
    401,
    "Unauthorized",
    "A valid agent token is required",
    { headers: { "WWW-Authenticate": "Bearer" } },
  );
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

// ─── Request bodies ──────────────────────────────────────────────────────────

/**
 * Read and validate a JSON request body, or throw a 400.
 *
 * `(await request.json()) as SomeType` is a compile-time fiction: the cast
 * describes what a well-behaved client sends, and the handler then works with a
 * value that was never checked against it. Routes that spread such a body into a
 * Prisma `data` argument are assigning whichever columns the caller named, not
 * the ones the route meant to expose.
 *
 * So parsing a body is spelled with a schema and nothing else — see the ESLint
 * rule banning bare `request.json()` under `src/app/api`. The schema is also the
 * readable answer to "what does this endpoint accept?", which a `Partial<…>`
 * type alias never was.
 *
 * Prefer `.strict()` on update schemas: an unknown key is then a 400 that names
 * the field, rather than a silently dropped one. That is what makes a field
 * deliberately *not* accepted here — `parentId` on a document PATCH, say —
 * enforceable rather than merely commented.
 *
 * @example
 * const patchSchema = z.object({ name: z.string() }).strict();
 * const body = await parseBody(request, patchSchema);
 */
export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(
      400,
      "Bad Request",
      "Request body must be valid JSON",
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");
    throw new ApiError(
      400,
      "Bad Request",
      field
        ? `${field}: ${issue.message}`
        : issue?.message ?? "Invalid request body",
    );
  }
  return parsed.data;
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

type AuthMode = "public" | "user" | "optional" | "token";

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
        mode === "public"
          ? { params }
          : mode === "token"
          ? { params, token: await requireAgentToken(request) }
          : {
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

/**
 * A route authenticated by an agent token rather than a session cookie —
 * `Authorization: Bearer blog_pat_…`. 401 on any bad credential, 403 when the
 * owning account is disabled.
 *
 * A fourth wrapper rather than a `publicRoute` with a check inside it, because
 * the value of this scheme is that `grep -rn "publicRoute" src/app/api` is the
 * *complete* list of unauthenticated surfaces. An authenticated route listed
 * among them would destroy the one thing the naming buys. It is not
 * `userRoute` either: there is no session to resolve.
 *
 * `context.token` carries `userId` and `scopes`; there is deliberately no
 * `context.user`. The one user-level rule — a disabled account — is applied
 * during verification, and fetching the whole `User` row to satisfy a type
 * would be a query per request for something no handler reads. A handler that
 * needs more can fetch it from `token.userId`.
 *
 * @example
 * export const POST = tokenRoute(async (request, { token }) => …);
 */
export const tokenRoute = <P = Params>(
  handler: Handler<{ params: P; token: AgentTokenSummary }>,
  options?: RouteOptions,
): NextRouteHandler<P> => route("token", handler, options);
