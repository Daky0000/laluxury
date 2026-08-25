import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const user = await currentUser();
  if (user) redirect("/account");

  return (
    <div className="w-full max-w-md">
      <h1 className="text-3xl">Create an account</h1>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        Save your details, track orders and keep a wishlist.
      </p>

      <div className="mt-8">
        <RegisterForm />
      </div>

      <p className="mt-6 text-sm text-[var(--text-secondary)]">
        Already have one?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
