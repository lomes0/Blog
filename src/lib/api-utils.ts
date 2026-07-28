import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Typed error class for API routes. Throw inside any `withApiHandler`-wrapped
 * handler to return a structured JSON error response with the given status code.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler<C = any> = (
  request: Request,
  context: C,
) => Promise<Response | NextResponse>;

interface HandlerOptions {
  /** Label prepended to console.error output (e.g. "Error fetching notes") */
  context?: string;
}

/**
 * Wraps a Next.js App Router handler with consistent error handling.
 *
 * - `ApiError` instances produce a JSON response with the thrown status code.
 * - Any other error produces a generic 500 response.
 * - All errors are logged via `console.error`.
 *
 * @example
 * export const GET = withApiHandler(async (request) => {
 *   const session = await getServerSession(authOptions);
 *   if (!session) throw new ApiError(401, "Unauthorized", "Please sign in");
 *   const data = await fetchData();
 *   return NextResponse.json({ data });
 * });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withApiHandler<C = any>(
  handler: RouteHandler<C>,
  options?: HandlerOptions,
): RouteHandler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        // Only log unexpected server errors (5xx); 4xx are expected client errors
        if (error.status >= 500) {
          if (options?.context) {
            console.error(`${options.context}:`, error);
          } else {
            console.error(error);
          }
        }
        return error.toResponse();
      }

      // Unexpected error — always log
      if (options?.context) {
        console.error(`${options.context}:`, error);
      } else {
        console.error(error);
      }

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
  };
}

/** The signed-in user, as stored in the database (a full `User` row). */
export type SessionUser = Session["user"];

/**
 * The signed-in, enabled user — or a thrown `ApiError`.
 *
 * Every authenticated route repeated the same two checks by hand: reject when
 * there is no session, then reject when the account is disabled. Written out
 * ~35 times, an omission was invisible on review, which is exactly how several
 * routes ended up authenticating without ever checking ownership. Routes call
 * this instead so "did this handler check?" is answered by whether it names the
 * helper at all.
 *
 * @example
 * const user = await requireUser("Please sign in to reorder");
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
