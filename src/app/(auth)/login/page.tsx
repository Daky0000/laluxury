import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isStaff } from "@/lib/auth/rbac";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(isStaff(user.role) ? "/admin" : "/account");

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl">Sign in</h1>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        Welcome back. Staff accounts land in the back office.
      </p>

      <div className="mt-8">
        <LoginForm />
      </div>

      <p className="mt-6 text-sm text-[var(--text-secondary)]">
        No account yet?{" "}
        <Link href="/register" className="underline underline-offset-4">
          Create one
        </Link>
      </p>
    </div>
  );
}
