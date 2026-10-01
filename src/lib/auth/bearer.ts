import { headers } from "next/headers";
import { verifySession, type SessionPayload } from "./session";
import { db } from "@/lib/db";
import { can, isStaff, type Permission } from "./rbac";
import type { User } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Bearer-token authentication for the mobile app API
//
// The web admin reads the JWT from a cookie; the mobile app sends it as
// `Authorization: Bearer <token>`. Both use the same session format and the
// same RBAC rules, so an API key and a console session are interchangeable.
// ---------------------------------------------------------------------------

export class ApiAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

/** Extracts the JWT from the `Authorization: Bearer <token>` header. */
async function getBearerToken(): Promise<string | null> {
  const h = await headers();
  const auth = h.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/** Verifies the bearer token and returns the session payload, or null. */
export async function getBearerSession(): Promise<SessionPayload | null> {
  const token = await getBearerToken();
  if (!token) return null;
  return verifySession(token);
}

/** Requires a valid bearer token. Returns the active user or throws. */
export async function requireBearerUser(): Promise<User> {
  const session = await getBearerSession();
  if (!session) throw new ApiAuthError("Authentication required.", 401);

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) {
    throw new ApiAuthError("Account not found or disabled.", 401);
  }
  return user;
}

/** Requires a staff user with a specific permission. */
export async function requireBearerPermission(permission: Permission): Promise<User> {
  const user = await requireBearerUser();
  if (!isStaff(user.role)) {
    throw new ApiAuthError("Staff access required.", 403);
  }
  if (!can(user.role, permission)) {
    throw new ApiAuthError(`Permission denied: ${permission}.`, 403);
  }
  return user;
}

/**
 * Catches `ApiAuthError` from a handler and returns the right HTTP response.
 *
 * Wrap every route handler with this so auth failures produce a tidy JSON
 * error rather than an unhandled 500.
 */
export function withApiAuth<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiAuthError) {
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
  };
}
