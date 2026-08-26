import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared primitives. Deliberately small and unopinionated so the storefront
 * and the admin can share them while still looking like different products.
 */

// --- Button -----------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors " +
  "disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap rounded-(--radius-card)";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-ink-800 border border-transparent",
  secondary:
    "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--surface-sunken)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] border border-transparent",
  danger: "bg-danger text-white hover:opacity-90 border border-transparent",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2.5",
  lg: "text-sm px-6 py-3.5 tracking-wide",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// --- Badge ------------------------------------------------------------------

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  success: "bg-success/10 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  accent: "bg-clay-100 text-clay-800",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// --- Surfaces ---------------------------------------------------------------

export function Card({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-6", className)}>
      <div>
        {eyebrow ? <p className="lx-eyebrow mb-2">{eyebrow}</p> : null}
        <h2 className="text-2xl md:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-2 max-w-prose text-sm text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-(--radius-card) border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center">
      {icon ? <div className="text-[var(--text-muted)]">{icon}</div> : null}
      <p className="text-base text-[var(--text-primary)]">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

// --- Form -------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="lx-eyebrow">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const tones = {
    info: "border-info/30 bg-info/5 text-info",
    success: "border-success/30 bg-success/5 text-success",
    warning: "border-warning/30 bg-warning/5 text-warning",
    danger: "border-danger/30 bg-danger/5 text-danger",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-(--radius-card) border px-3 py-2.5 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

// --- Data -------------------------------------------------------------------

export function Stat({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  hint?: string;
}) {
  // The KPI tile from the admin artboard: label and trend on one line, the
  // number set large in the display face, then what it is measured against.
  return (
    <Card className="px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {label}
        </span>
        {delta ? (
          <span
            className={cn(
              "text-[11.5px] font-semibold tabular-nums",
              delta.positive ? "text-sage-600" : "text-[var(--accent)]",
            )}
          >
            {delta.positive ? "▲" : "▼"} {delta.value}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 font-display text-[34px] leading-none tabular-nums">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </Card>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-[var(--border-subtle)]", className)} />;
}
