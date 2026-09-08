import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Forgotten password", robots: { index: false } };

export default async function ForgotPasswordPage() {
  const user = await currentUser();
  if (user) redirect("/account");

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl">Forgotten your password?</h1>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        Enter the phone number you signed up with and we will text you a code. Staff accounts
        can use their email instead.
      </p>

      <div className="mt-8">
        <ForgotPasswordForm />
      </div>

      <p className="mt-6 text-sm text-[var(--text-secondary)]">
        Remembered it?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
