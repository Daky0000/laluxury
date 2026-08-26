"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Plus, KeyRound } from "lucide-react";
import {
  createStaffAction,
  updateStaffRoleAction,
  setUserActiveAction,
  resetStaffPasswordAction,
} from "@/app/actions/admin/people";
import type { AdminState } from "@/app/actions/admin/products";
import { Card, Field, Alert, Badge } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/utils";
import type { Role } from "@/generated/prisma";

const ROLES: Role[] = ["STAFF", "MANAGER", "ADMIN", "OWNER"];

const LABELS: Record<Role, string> = {
  CUSTOMER: "Customer",
  STAFF: "Staff",
  MANAGER: "Manager",
  ADMIN: "Admin",
  OWNER: "Owner",
};

const RANK: Record<Role, number> = {
  CUSTOMER: 0,
  STAFF: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

type StaffMember = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export function StaffManager({
  actorId,
  actorRole,
  staff,
}: {
  actorId: string;
  actorRole: Role;
  staff: StaffMember[];
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    createStaffAction,
    null,
  );
  const [adding, setAdding] = useState(false);
  const [busy, startBusy] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const isOwner = actorRole === "OWNER";

  /** Roles this actor is allowed to hand out. */
  const grantable = ROLES.filter((r) => isOwner || RANK[actorRole] > RANK[r]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add a staff member
        </button>
      </div>

      {message ? <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert> : null}

      {adding ? (
        <Card className="p-5">
          <h2 className="mb-4 font-display text-xl">New staff account</h2>

          <form action={action} className="flex flex-col gap-4">
            {state?.message ? (
              <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="firstName" required>
                <input id="firstName" name="firstName" required className="lx-field" />
              </Field>
              <Field label="Last name" htmlFor="lastName" required>
                <input id="lastName" name="lastName" required className="lx-field" />
              </Field>
            </div>

            <Field
              label="Email"
              htmlFor="email"
              required
              hint="If they already shop with you, this promotes that account."
            >
              <input id="email" name="email" type="email" required className="lx-field" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" htmlFor="role" required>
                <select id="role" name="role" defaultValue="STAFF" className="lx-field">
                  {grantable.map((role) => (
                    <option key={role} value={role}>
                      {LABELS[role]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Temporary password"
                htmlFor="password"
                required
                hint="8+ chars, a number and a capital."
              >
                <input
                  id="password"
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  className="lx-field font-mono"
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="flex items-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-5 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Create account
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Last seen</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {staff.map((member) => {
                const isSelf = member.id === actorId;
                const canEdit =
                  !isSelf && (isOwner || RANK[actorRole] > RANK[member.role]);

                return (
                  <tr key={member.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-4 py-3">
                      <span className="block font-medium">
                        {member.name}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-[var(--text-muted)]">you</span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">{member.email}</span>
                    </td>

                    <td className="px-4 py-3">
                      {canEdit ? (
                        <>
                          <label htmlFor={`role-${member.id}`} className="sr-only">
                            Role for {member.name}
                          </label>
                          <select
                            id={`role-${member.id}`}
                            defaultValue={member.role}
                            disabled={busy}
                            onChange={(event) =>
                              startBusy(async () => {
                                const result = await updateStaffRoleAction(
                                  member.id,
                                  event.target.value as Role,
                                );
                                setMessage({ ok: result.ok, text: result.message ?? "" });
                              })
                            }
                            className="lx-field w-32 py-1.5 text-xs"
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {LABELS[role]}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <Badge tone={member.role === "OWNER" ? "accent" : "neutral"}>
                          {LABELS[member.role]}
                        </Badge>
                      )}
                    </td>

                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {member.lastLoginAt ? relativeTime(member.lastLoginAt) : "Never"}
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={member.isActive ? "success" : "danger"}>
                        {member.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      {canEdit ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              startBusy(async () => {
                                const result = await setUserActiveAction(
                                  member.id,
                                  !member.isActive,
                                );
                                setMessage({ ok: result.ok, text: result.message ?? "" });
                              })
                            }
                            className="text-xs text-[var(--text-secondary)] underline-offset-4 hover:underline"
                          >
                            {member.isActive ? "Disable" : "Enable"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setResetting(resetting === member.id ? null : member.id)
                            }
                            className="flex items-center gap-1 text-xs text-[var(--text-secondary)] underline-offset-4 hover:underline"
                          >
                            <KeyRound className="h-3 w-3" aria-hidden />
                            Reset password
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">
                          {isSelf ? "Cannot edit yourself" : "Outranks you"}
                        </span>
                      )}

                      {resetting === member.id ? (
                        <PasswordReset userId={member.id} onDone={() => setResetting(null)} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        Accounts created between {formatDate(staff[staff.length - 1]?.createdAt ?? new Date())} and{" "}
        {formatDate(staff[0]?.createdAt ?? new Date())}.
      </p>
    </div>
  );
}

function PasswordReset({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    resetStaffPasswordAction.bind(null, userId),
    null,
  );

  return (
    <form action={action} className="mt-2 flex flex-col gap-2">
      <label htmlFor={`pw-${userId}`} className="sr-only">
        New password
      </label>
      <input
        id={`pw-${userId}`}
        name="password"
        type="text"
        required
        minLength={8}
        placeholder="New password"
        className="lx-field w-44 py-1.5 font-mono text-xs"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-(--radius-card) bg-[var(--accent)] px-3 py-1 text-xs text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {pending ? "Setting…" : "Set"}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-[var(--text-secondary)]">
          Cancel
        </button>
      </div>
      {state?.message ? (
        <p className={state.ok ? "text-xs text-success" : "text-xs text-danger"}>{state.message}</p>
      ) : null}
    </form>
  );
}
