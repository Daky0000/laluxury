import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "./session";
import { can, isStaff, type Permission } from "./rbac";
import type { Role, User } from "@/generated/prisma";

export * from "./rbac";
export * from "./session";
export * from "./password";

/**
 * Loads the signed-in user. Deduped per request by React cache so a page and
 * its nested layouts share one query.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) return null;
  return user;
});

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Any signed-in user (customer included).
 *
 * Being signed out is not an error, it is a redirect: pages and layouts render
 * in parallel, so a layout-level redirect does not stop a page guard from
 * running, and throwing here would surface an error screen instead of the
 * sign-in form.
 */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Any back-office user. A signed-in customer is sent to their own account. */
export async function requireStaff(): Promise<User> {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect("/account");
  return user;
}

/** A back-office user holding a specific permission. */
export async function requirePermission(permission: Permission): Promise<User> {
  const user = await requireStaff();
  if (!can(user.role, permission)) {
    throw new AuthError(`Your role cannot ${permission.replace(":", " ")}.`, 403);
  }
  return user;
}

export function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

export type { Role, Permission };
