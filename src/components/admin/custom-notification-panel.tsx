"use client";

import { useState, useTransition } from "react";
import { Send, Smartphone, Volume2, Loader2, Sparkles } from "lucide-react";
import { Card, Alert } from "@/components/ui";
import { sendCustomSmsAction, updateStoreAnnouncementAction, type NotificationActionState } from "@/app/actions/admin/notifications";

export function CustomNotificationPanel({ storeName }: { storeName: string }) {
  const [channel, setChannel] = useState<"sms" | "announcement">("sms");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<NotificationActionState | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    const formData = new FormData();
    if (channel === "sms") {
      formData.set("phone", phone);
      formData.set("title", title);
      formData.set("message", message);
      startTransition(async () => {
        const res = await sendCustomSmsAction(null, formData);
        setResult(res);
        if (res.ok) {
          setMessage("");
          setTitle("");
          setPhone("");
        }
      });
    } else {
      formData.set("announcement", title ? `${title.toUpperCase()}: ${message}` : message);
      startTransition(async () => {
        const res = await updateStoreAnnouncementAction(null, formData);
        setResult(res);
        if (res.ok) {
          setMessage("");
          setTitle("");
        }
      });
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              Direct Communication
            </span>
          </div>
          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            Send Custom Notification &amp; SMS
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Deliver bespoke SMS text updates directly to a customer, or broadcast store announcements to all web &amp; mobile shoppers.
          </p>
        </div>

        {/* Channel Selector */}
        <div className="flex items-center bg-[var(--surface-sunken)] p-1 rounded-lg border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => { setChannel("sms"); setResult(null); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              channel === "sms"
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Direct SMS
          </button>
          <button
            type="button"
            onClick={() => { setChannel("announcement"); setResult(null); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              channel === "announcement"
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Volume2 className="h-3.5 w-3.5" />
            Store Announcement
          </button>
        </div>
      </div>

      {result && (
        <div className="mb-4">
          <Alert tone={result.ok ? "success" : "danger"}>
            {result.message}
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        {channel === "sms" ? (
          <div>
            <label htmlFor="notif-phone" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Recipient Phone Number (Ghana or International) *
            </label>
            <input
              id="notif-phone"
              type="tel"
              required
              placeholder="e.g. +233 24 123 4567 or 0241234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
        ) : (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-300">
            <strong>Storewide Marquee:</strong> This immediately updates the announcement bar shown across both the website header and mobile application.
          </div>
        )}

        <div>
          <label htmlFor="notif-title" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Notification Title / Topic (Optional)
          </label>
          <input
            id="notif-title"
            type="text"
            placeholder={channel === "sms" ? "e.g. Order Ready for Delivery" : "e.g. WEEKEND PROMO"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="notif-message" className="block text-xs font-medium text-[var(--text-secondary)]">
              Message Content *
            </label>
            <span className="text-[11px] text-[var(--text-muted)]">
              {message.length} characters {channel === "sms" && `(approx. ${Math.ceil(message.length / 160) || 1} SMS page)`}
            </span>
          </div>
          <textarea
            id="notif-message"
            required
            rows={3}
            placeholder={
              channel === "sms"
                ? `e.g. Hello, your custom sofa order from ${storeName} has been crafted and is being dispatched today.`
                : "e.g. Free nationwide station delivery on all orders over GH₵1,000 this week."
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending || !message.trim() || (channel === "sms" && !phone.trim())}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Dispatching...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {channel === "sms" ? "Dispatch SMS Now" : "Update Announcement"}
              </>
            )}
          </button>
        </div>
      </form>
    </Card>
  );
}
