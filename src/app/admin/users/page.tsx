import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { permissionsFor, ROLE_LABELS } from "@/lib/auth/rbac";
import { formatDate } from "@/lib/utils";
import { Card, SectionHeading } from "@/components/ui";
import { StaffManager } from "@/components/admin/staff-manager";

export const metadata: Metadata = { title: "Staff" };

export default async function AdminUsersPage() {
  const actor = await requirePermission("users:manage");

  const staff = await db.user.findMany({
    where: { role: { not: "CUSTOMER" } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Staff"
        description="Roles decide what each person sees and can change. Nobody can grant a role at or above their own, or edit their own account here."
      />

      <StaffManager
        actorId={actor.id}
        actorRole={actor.role}
        staff={staff.map((s) => ({
          id: s.id,
          email: s.email,
          name: [s.firstName, s.lastName].filter(Boolean).join(" ") || s.email,
          role: s.role,
          isActive: s.isActive,
          lastLoginAt: s.lastLoginAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        }))}
      />

      {/* Permission matrix */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-5 py-3">
          <h2 className="lx-eyebrow">What each role can do</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {(["STAFF", "MANAGER", "ADMIN", "OWNER"] as const).map((role) => (
                <tr key={role}>
                  <td className="whitespace-nowrap px-4 py-3 align-top font-medium">
                    {ROLE_LABELS[role]}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {permissionsFor(role)
                      .map((p) => p.replace(":", " "))
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        {staff.length} staff accounts. Oldest created{" "}
        {staff.length ? formatDate(staff[staff.length - 1].createdAt) : "—"}.
      </p>
    </div>
  );
}
