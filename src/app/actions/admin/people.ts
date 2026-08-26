"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, hashPassword, passwordProblems } from "@/lib/auth";
import { outranks, ROLE_LABELS } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/audit";
import type { Role, InteractionType } from "@/generated/prisma";
import type { AdminState } from "./products";

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export async function addCustomerNoteAction(
  userId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("customers:write");

  const body = String(formData.get("body") || "").trim();
  if (!body) return { ok: false, message: "Write something first." };

  await db.customerInteraction.create({
    data: {
      userId,
      type: (String(formData.get("type") || "NOTE") as InteractionType) ?? "NOTE",
      subject: String(formData.get("subject") || "").trim() || null,
      body,
      actorId: actor.id,
    },
  });

  revalidatePath(`/admin/customers/${userId}`);
  return { ok: true, message: "Logged." };
}

export async function setCustomerTagsAction(
  userId: string,
  tagIds: string[],
): Promise<AdminState> {
  await requirePermission("customers:write");

  await db.$transaction(async (tx) => {
    await tx.customerTagOnUser.deleteMany({ where: { userId } });
    if (tagIds.length) {
      await tx.customerTagOnUser.createMany({
        data: tagIds.map((tagId) => ({ userId, tagId })),
      });
    }
  });

  revalidatePath(`/admin/customers/${userId}`);
  revalidatePath("/admin/customers");
  return { ok: true, message: "Tags updated." };
}

export async function createTagAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  await requirePermission("customers:write");

  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, message: "Name the tag." };

  const existing = await db.customerTag.findUnique({ where: { name } });
  if (existing) return { ok: false, message: "That tag already exists." };

  await db.customerTag.create({
    data: { name, color: String(formData.get("color") || "#8B7355") },
  });

  revalidatePath("/admin/customers");
  return { ok: true, message: "Tag created." };
}

export async function updateCustomerAction(
  userId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("customers:write");

  await db.user.update({
    where: { id: userId },
    data: {
      firstName: String(formData.get("firstName") || "").trim() || null,
      lastName: String(formData.get("lastName") || "").trim() || null,
      phone: String(formData.get("phone") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
      acceptsMarketing: formData.get("acceptsMarketing") === "on",
    },
  });

  await recordAudit({
    actorId: actor.id,
    action: "customer.update",
    entity: "User",
    entityId: userId,
  });

  revalidatePath(`/admin/customers/${userId}`);
  return { ok: true, message: "Saved." };
}

/**
 * Adds a customer by hand — for someone who ordered over WhatsApp or walked
 * into the showroom and should exist here before their first online order.
 *
 * No password is set, so the account cannot be signed into until they reset it
 * themselves. That keeps a staff-created record from becoming a way in.
 */
export async function createCustomerAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("customers:write");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") || "").trim();

  if (!email || !email.includes("@")) return { ok: false, message: "Enter a valid email address." };
  if (!firstName) return { ok: false, message: "Enter a first name." };

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { ok: false, message: "Someone already has that email address." };
  }

  const customer = await db.user.create({
    data: {
      email,
      firstName,
      lastName: String(formData.get("lastName") || "").trim() || null,
      phone: String(formData.get("phone") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
      acceptsMarketing: formData.get("acceptsMarketing") === "on",
      role: "CUSTOMER",
    },
  });

  await recordAudit({
    actorId: actor.id,
    action: "customer.create",
    entity: "User",
    entityId: customer.id,
    after: { email },
  });

  revalidatePath("/admin/customers");
  return { ok: true, message: `Added ${firstName}.` };
}

/**
 * Removes a customer. Anyone with order history is deactivated instead, so the
 * orders keep the name and email they were placed under.
 */
export async function deleteCustomerAction(userId: string): Promise<AdminState> {
  const actor = await requirePermission("customers:write");

  const customer = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, _count: { select: { orders: true } } },
  });

  if (!customer) return { ok: false, message: "That customer no longer exists." };
  if (customer.role !== "CUSTOMER") {
    return { ok: false, message: "That is a staff account — manage it under Staff." };
  }

  if (customer._count.orders > 0) {
    await db.user.update({ where: { id: userId }, data: { isActive: false } });
    await recordAudit({
      actorId: actor.id,
      action: "customer.deactivate",
      entity: "User",
      entityId: userId,
      after: { reason: `${customer._count.orders} orders` },
    });
    revalidatePath("/admin/customers");
    return {
      ok: true,
      message: `${customer._count.orders} order${customer._count.orders === 1 ? "" : "s"} belong to this customer, so the account was switched off rather than deleted.`,
    };
  }

  await db.user.delete({ where: { id: userId } });
  await recordAudit({
    actorId: actor.id,
    action: "customer.delete",
    entity: "User",
    entityId: userId,
    after: { email: customer.email },
  });

  revalidatePath("/admin/customers");
  return { ok: true, message: "Customer removed." };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

const staffSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  firstName: z.string().min(1, "Enter a first name."),
  lastName: z.string().min(1, "Enter a last name."),
  role: z.enum(["STAFF", "MANAGER", "ADMIN", "OWNER"]),
  password: z.string().min(8, "Use at least 8 characters."),
});

export async function createStaffAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("users:manage");

  const parsed = staffSchema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  // Nobody may mint an account at or above their own level.
  if (!outranks(actor.role, parsed.data.role) && actor.role !== "OWNER") {
    return {
      ok: false,
      message: `As ${ROLE_LABELS[actor.role]} you cannot create a ${ROLE_LABELS[parsed.data.role]} account.`,
    };
  }

  const problems = passwordProblems(parsed.data.password);
  if (problems.length) return { ok: false, message: problems[0] };

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email } });

  if (existing) {
    // Promote an existing customer rather than refusing outright.
    if (existing.role !== "CUSTOMER") {
      return { ok: false, message: "That person already has a staff account." };
    }
    await db.user.update({
      where: { id: existing.id },
      data: {
        role: parsed.data.role,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        passwordHash: await hashPassword(parsed.data.password),
      },
    });
    await recordAudit({
      actorId: actor.id,
      action: "user.promote",
      entity: "User",
      entityId: existing.id,
      before: { role: "CUSTOMER" },
      after: { role: parsed.data.role },
    });
    revalidatePath("/admin/users");
    return { ok: true, message: `${email} promoted to ${ROLE_LABELS[parsed.data.role]}.` };
  }

  const created = await db.user.create({
    data: {
      email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
      emailVerified: new Date(),
    },
  });

  await recordAudit({
    actorId: actor.id,
    action: "user.create",
    entity: "User",
    entityId: created.id,
    after: { email, role: parsed.data.role },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: `${email} added as ${ROLE_LABELS[parsed.data.role]}.` };
}

export async function updateStaffRoleAction(
  userId: string,
  role: Role,
): Promise<AdminState> {
  const actor = await requirePermission("users:manage");

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: "That account no longer exists." };

  if (target.id === actor.id) {
    return { ok: false, message: "You cannot change your own role." };
  }
  if (target.role === "OWNER" && actor.role !== "OWNER") {
    return { ok: false, message: "Only an owner can change an owner." };
  }
  if (!outranks(actor.role, role) && actor.role !== "OWNER") {
    return { ok: false, message: `You cannot grant the ${ROLE_LABELS[role]} role.` };
  }

  await db.user.update({ where: { id: userId }, data: { role } });
  await recordAudit({
    actorId: actor.id,
    action: "user.role_change",
    entity: "User",
    entityId: userId,
    before: { role: target.role },
    after: { role },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: `${target.email} is now ${ROLE_LABELS[role]}.` };
}

export async function setUserActiveAction(
  userId: string,
  isActive: boolean,
): Promise<AdminState> {
  const actor = await requirePermission("users:manage");

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: "That account no longer exists." };

  if (target.id === actor.id) {
    return { ok: false, message: "You cannot disable your own account." };
  }
  if (target.role === "OWNER" && actor.role !== "OWNER") {
    return { ok: false, message: "Only an owner can disable an owner." };
  }

  await db.user.update({ where: { id: userId }, data: { isActive } });
  await recordAudit({
    actorId: actor.id,
    action: isActive ? "user.enable" : "user.disable",
    entity: "User",
    entityId: userId,
  });

  revalidatePath("/admin/users");
  return { ok: true, message: isActive ? "Account enabled." : "Account disabled." };
}

export async function resetStaffPasswordAction(
  userId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("users:manage");

  const password = String(formData.get("password") || "");
  const problems = passwordProblems(password);
  if (problems.length) return { ok: false, message: problems[0] };

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: "That account no longer exists." };
  if (target.role === "OWNER" && actor.role !== "OWNER") {
    return { ok: false, message: "Only an owner can reset an owner password." };
  }

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });

  await recordAudit({
    actorId: actor.id,
    action: "user.password_reset",
    entity: "User",
    entityId: userId,
  });

  return { ok: true, message: "Password reset. Share it with them securely." };
}
