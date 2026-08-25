import type { Role } from "@/generated/prisma";

export const PERMISSIONS = [
  "dashboard:view",
  "orders:read",
  "orders:write",
  "products:read",
  "products:write",
  "inventory:read",
  "inventory:write",
  "discounts:read",
  "discounts:write",
  "customers:read",
  "customers:write",
  "reviews:moderate",
  "users:manage",
  "settings:manage",
  "agent:use",
  "agent:configure",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF: Permission[] = [
  "dashboard:view",
  "orders:read",
  "orders:write",
  "products:read",
  "inventory:read",
  "customers:read",
];

const MANAGER: Permission[] = [
  ...STAFF,
  "products:write",
  "inventory:write",
  "discounts:read",
  "discounts:write",
  "customers:write",
  "reviews:moderate",
  "agent:use",
];

const ADMIN: Permission[] = [...MANAGER, "users:manage", "settings:manage", "agent:configure"];

const OWNER: Permission[] = [...ADMIN];

const MATRIX: Record<Role, Permission[]> = {
  CUSTOMER: [],
  STAFF,
  MANAGER,
  ADMIN,
  OWNER,
};

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

export function can(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

/** Anyone who should see the admin area at all. */
export function isStaff(role: Role): boolean {
  return role !== "CUSTOMER";
}

/** Ranking used to stop staff editing accounts at or above their own level. */
const RANK: Record<Role, number> = {
  CUSTOMER: 0,
  STAFF: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function outranks(actor: Role, target: Role): boolean {
  return RANK[actor] > RANK[target];
}

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: "Customer",
  STAFF: "Staff",
  MANAGER: "Manager",
  ADMIN: "Admin",
  OWNER: "Owner",
};
