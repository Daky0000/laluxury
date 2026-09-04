"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Check, X, Eye, EyeOff } from "lucide-react";
import {
  saveIntegrationsAction,
  testIntegrationAction,
  clearIntegrationAction,
} from "@/app/actions/admin/integrations";
import type { AdminState } from "@/app/actions/admin/products";
import type { IntegrationGroup, Integrations } from "@/lib/integrations";
import { Card, Badge, Alert } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Integration credentials, pasted rather than deployed.
 *
 * Secret fields render empty with the stored value shown beside them as a
 * masked hint. Leaving one blank keeps what is already saved, so the owner can
 * change a single key without retyping the rest — and no secret is ever sent
 * back to the browser.
 */
export function IntegrationsForm({ groups }: { groups: IntegrationGroup[] }) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    saveIntegrationsAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4.5">
      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <p className="text-sm text-[var(--text-secondary)]">
        Paste a key and save — it takes effect on the next request, with no redeploy. Anything left
        blank keeps the value already stored. Values set on the host are used until you enter
        something here.
      </p>

      {groups.map((group) => (
        <GroupCard key={group.key} group={group} />
      ))}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm tracking-[0.04em] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save changes
        </button>
      </div>
    </form>
  );
}

function GroupCard({ group }: { group: IntegrationGroup }) {
  const [testing, startTesting] = useTransition();
  const [result, setResult] = useState<AdminState | null>(null);

  function test() {
    setResult(null);
    startTesting(async () => {
      setResult(await testIntegrationAction(group.key as keyof Integrations));
    });
  }

  return (
    <Card className="flex flex-col gap-4 px-6 py-5.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2.5 text-sm font-semibold">
            {group.label}
            <Badge tone={group.ready ? "success" : "neutral"}>
              {group.ready ? "live" : "not set"}
            </Badge>
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{group.description}</p>
        </div>

        <button
          type="button"
          onClick={test}
          disabled={testing}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] px-3.5 py-2 text-xs transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Test connection
        </button>
      </div>

      {result ? (
        <p
          role="status"
          className={cn(
            "flex items-start gap-2 text-sm",
            result.ok ? "text-sage-600" : "text-danger",
          )}
        >
          {result.ok ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {result.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map((field) =>
          field.name === "provider" ? (
            <ProviderField key={field.name} value={field.display} />
          ) : field.name === "mode" ? (
            <PaystackModeField key={field.name} value={field.display} />
          ) : (
            <FieldRow
              key={field.name}
              group={group.key}
              name={field.name}
              label={field.label}
              hint={field.hint}
              secret={field.secret}
              display={field.display}
            />
          ),
        )}
      </div>
    </Card>
  );
}

/**
 * Live or test. Both key pairs are kept, so switching back to live never means
 * retyping the real keys.
 */
function PaystackModeField({ value }: { value: string }) {
  const [mode, setMode] = useState(value === "test" ? "test" : "live");

  return (
    <label className="flex flex-col gap-1.5 text-xs text-[var(--text-muted)] sm:col-span-2">
      Mode
      <select
        name="paystack.mode"
        value={mode}
        onChange={(event) => setMode(event.target.value)}
        className={cn(
          "lx-field cursor-pointer rounded-lg",
          mode === "test" && "border-warning text-warning",
        )}
      >
        <option value="live">Live — real money</option>
        <option value="test">Test — nothing is charged</option>
      </select>
      <span className={cn("text-sm", mode === "test" && "text-warning")}>
        {mode === "test"
          ? "Checkout will use the test keys below. Orders complete, but no money moves."
          : "Checkout will use the live keys below."}
      </span>
    </label>
  );
}

/** The AI provider is a choice, not a string to be typed. */
function ProviderField({ value }: { value: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-[var(--text-muted)] sm:col-span-2">
      Provider
      <select
        name="ai.provider"
        defaultValue={value === "openrouter" ? "openrouter" : "anthropic"}
        className="lx-field cursor-pointer rounded-lg"
      >
        <option value="anthropic">Claude — direct from Anthropic</option>
        <option value="openrouter">OpenRouter — any model, including Ox Alpha</option>
      </select>
      <span className="text-sm">
        Whichever you pick, fill in that provider&rsquo;s key below. The other can stay set as a
        spare.
      </span>
    </label>
  );
}

function FieldRow({
  group,
  name,
  label,
  hint,
  secret,
  display,
}: {
  group: string;
  name: string;
  label: string;
  hint?: string;
  secret: boolean;
  display: string;
}) {
  const [reveal, setReveal] = useState(false);
  const [clearing, startClearing] = useTransition();
  const [cleared, setCleared] = useState(false);

  const hasStored = display.length > 0;

  return (
    <label className="flex flex-col gap-1.5 text-xs text-[var(--text-muted)]">
      <span className="flex items-center justify-between gap-2">
        {label}
        {secret && hasStored && !cleared ? (
          <button
            type="button"
            disabled={clearing}
            onClick={() =>
              startClearing(async () => {
                const result = await clearIntegrationAction(group, name);
                if (result.ok) setCleared(true);
              })
            }
            className="text-sm text-[var(--accent)] underline underline-offset-2 disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </span>

      <span className="relative flex">
        <input
          name={`${group}.${name}`}
          type={secret && !reveal ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          defaultValue={secret ? "" : display}
          placeholder={
            secret
              ? cleared
                ? "Not set"
                : hasStored
                  ? `Saved: ${display}`
                  : "Not set"
              : undefined
          }
          className="lx-field rounded-lg pr-10 font-mono text-sm"
        />
        {secret ? (
          <button
            type="button"
            onClick={() => setReveal((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)]"
            aria-label={reveal ? "Hide what you typed" : "Show what you typed"}
          >
            {reveal ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        ) : null}
      </span>

      {hint ? <span className="text-sm">{hint}</span> : null}
    </label>
  );
}
