"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Copy,
  Loader2,
  Mail,
  MessageSquare,
  RotateCcw,
  Send,
  Smartphone,
  Sparkles,
} from "lucide-react";

import {
  updateMessageTemplatesAction,
  resetMessageTemplateAction,
  testMessageTemplateAction,
  type AdminState,
} from "@/app/actions/admin/messages";
import type {
  MessageTemplate,
  MessageTemplateKey,
  MessageTemplatesConfig,
} from "@/lib/message-templates";
import { Alert, Badge, Card } from "@/components/ui";

export function MessageTemplatesEditor({
  initialTemplates,
  storeName,
}: {
  initialTemplates: MessageTemplatesConfig;
  storeName: string;
}) {
  const [templates, setTemplates] = useState<MessageTemplatesConfig>(initialTemplates);
  const [activeKey, setActiveKey] = useState<MessageTemplateKey>("purchase_made");
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [saving, startSave] = useTransition();
  const [resetting, startReset] = useTransition();
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<AdminState | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const current = templates[activeKey];

  const updateCurrent = (patch: Partial<MessageTemplate>) => {
    setTemplates((prev) => ({
      ...prev,
      [activeKey]: { ...prev[activeKey], ...patch },
    }));
  };

  const handleSave = () => {
    setSavedBanner(null);
    setErrorBanner(null);
    startSave(async () => {
      const res = await updateMessageTemplatesAction({
        [activeKey]: {
          smsEnabled: current.smsEnabled,
          smsTemplate: current.smsTemplate,
          emailEnabled: current.emailEnabled,
          emailSubject: current.emailSubject,
          emailBody: current.emailBody,
        },
      });
      if (res.ok) {
        setSavedBanner(`"${current.label}" template saved.`);
        setTimeout(() => setSavedBanner(null), 3500);
      } else {
        setErrorBanner(res.message || "Failed to save template.");
      }
    });
  };

  const handleReset = () => {
    if (!confirm(`Reset "${current.label}" back to its default draft wording?`)) return;
    setSavedBanner(null);
    setErrorBanner(null);
    startReset(async () => {
      const res = await resetMessageTemplateAction(activeKey);
      if (res.ok) {
        window.location.reload();
      } else {
        setErrorBanner(res.message || "Failed to reset template.");
      }
    });
  };

  const handleTestSend = (e: React.FormEvent) => {
    e.preventDefault();
    setTestResult(null);
    startTest(async () => {
      const res = await testMessageTemplateAction({
        key: activeKey,
        phone: testPhone.trim() || undefined,
        email: testEmail.trim() || undefined,
      });
      setTestResult(res);
    });
  };

  // Sample data to render live preview
  const sampleVars: Record<string, string> = {
    "{store_name}": storeName,
    "{customer_name}": "Ama Serwaa",
    "{order_number}": "LX-982K5P",
    "{order_date}": new Date().toLocaleDateString("en-GB"),
    "{products}": "1x Adinkra Table Lamp (Ivory), 2x Linen Pillow",
    "{products_detailed}":
      "• Adinkra Ceramic Lamp (Ivory) × 1 — ₵890.00\n• Linen Pillow (Natural) × 2 — ₵300.00",
    "{total}": "₵1,190.00",
    "{subtotal}": "₵1,190.00",
    "{shipping}": "Free Delivery",
    "{discount_line}": "Courtesy Discount (5%): -₵59.50\n",
    "{payment_method}": "Mobile Money (MTN)",
    "{payment_reference}": "pay_9a87d6f5e",
    "{track_url}": "https://laluxurys.com/orders/track?order=LX-982K5P",
    "{receipt_url}": "https://laluxurys.com/print/orders/sample",
    "{checkout_url}": "https://laluxurys.com/checkout",
    "{site_url}": "https://laluxurys.com",
    "{contact_url}": "https://laluxurys.com/contact",
    "{carrier_info}": "Accra Courier Express (Rider: Kojo)",
    "{delivery_estimate}": "1-2 business days",
    "{delivery_address}": "Plot 18, Airport Residential, Accra",
    "{reason_text}": " Item out of stock.",
    "{reason_line}": "Reason: Item out of stock.\n\n",
    "{refund_amount}": "₵1,190.00",
    "{custom_text}": "Your custom fabric order has arrived at our Airport Residential showroom.",
  };

  const renderPreview = (text: string) => {
    let out = text;
    for (const [k, v] of Object.entries(sampleVars)) {
      out = out.split(k).join(v);
    }
    return out;
  };

  const smsLength = current.smsTemplate.length;
  const smsSegments = Math.ceil(smsLength / 160) || 1;

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1800);
  };

  const keys = Object.keys(templates) as MessageTemplateKey[];

  return (
    <div className="flex flex-col gap-6">
      {savedBanner ? <Alert tone="success">{savedBanner}</Alert> : null}
      {errorBanner ? <Alert tone="danger">{errorBanner}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Navigation / List of Templates */}
        <div className="lg:col-span-4 flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-1 mb-1">
            Message Triggers &amp; Templates
          </div>

          <div className="flex flex-col gap-1.5">
            {keys.map((k) => {
              const item = templates[k];
              const isActive = activeKey === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setActiveKey(k);
                    setTestResult(null);
                  }}
                  className={`flex flex-col text-left rounded-lg p-3 transition-colors border ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                      : "border-transparent bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {item.label}
                    </span>
                    <Badge tone={item.category === "Orders" ? "accent" : "neutral"} className="text-[10px]">
                      {item.category}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                    {item.description}
                  </span>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1">
                      <Smartphone className={`h-3 w-3 ${item.smsEnabled ? "text-emerald-600" : "text-[var(--text-muted)]"}`} />
                      {item.smsEnabled ? "SMS On" : "SMS Off"}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Mail className={`h-3 w-3 ${item.emailEnabled ? "text-emerald-600" : "text-[var(--text-muted)]"}`} />
                      {item.emailEnabled ? "Email On" : "Email Off"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Template Detail & Live Editor */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <Card className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    {current.label}
                  </h2>
                  <Badge tone="accent">{current.category}</Badge>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {current.description}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={resetting}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-danger hover:border-danger/40 transition-colors"
                  title="Reset to default draft"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset draft</span>
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save Template
                </button>
              </div>
            </div>

            {/* Available Tags Helper */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] mb-2">
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Available Dynamic Tags (Click to copy)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {current.tags.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => copyTag(t.tag)}
                    className="inline-flex items-center gap-1 rounded bg-[var(--surface-raised)] border border-[var(--border-subtle)] px-2 py-0.5 text-xs font-mono text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    title={t.description}
                  >
                    <span>{t.tag}</span>
                    {copiedTag === t.tag ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-2.5 w-2.5 text-[var(--text-muted)]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* SMS Template Section */}
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] p-4 bg-[var(--surface-raised)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-[var(--accent)]" />
                  <span className="text-sm font-semibold">SMS Message</span>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={current.smsEnabled}
                    onChange={(e) => updateCurrent({ smsEnabled: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span>Send SMS for this action</span>
                </label>
              </div>

              {current.smsEnabled ? (
                <>
                  <textarea
                    rows={3}
                    value={current.smsTemplate}
                    onChange={(e) => updateCurrent({ smsTemplate: e.target.value })}
                    className="lx-field font-sans text-xs resize-y"
                    placeholder="Enter SMS wording..."
                  />

                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono tabular-nums">{smsLength} characters</span>
                      <span>·</span>
                      <span className={smsSegments > 1 ? "text-amber-600 font-medium" : ""}>
                        {smsSegments} SMS page{smsSegments > 1 ? "s" : ""}
                      </span>
                    </span>
                    <span>Standard GSM 160 chars / page</span>
                  </div>

                  {/* SMS Live Preview Handset */}
                  <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3.5">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-2.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-[var(--accent)]" />
                        <span>Live SMS Handset Preview</span>
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] lowercase">
                        sample customer view
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 max-w-lg">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] pl-1">
                        <Smartphone className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                        <span>{storeName} (SMS)</span>
                      </div>
                      <div className="rounded-2xl rounded-tl-xs bg-[#064e3b] text-[#ffffff] px-4 py-3 text-xs sm:text-[13px] leading-relaxed shadow-sm font-sans select-all">
                        <p className="text-[#ffffff] font-normal whitespace-pre-wrap leading-relaxed">
                          {renderPreview(current.smsTemplate)}
                        </p>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] pl-1">
                        Delivered · Standard SMS
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">
                  SMS notifications are turned off for this action.
                </p>
              )}
            </div>

            {/* Email Template Section */}
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] p-4 bg-[var(--surface-raised)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[var(--accent)]" />
                  <span className="text-sm font-semibold">Email Notification</span>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={current.emailEnabled}
                    onChange={(e) => updateCurrent({ emailEnabled: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span>Send Email for this action</span>
                </label>
              </div>

              {current.emailEnabled ? (
                <>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] font-medium mb-1 block">
                      Email Subject
                    </label>
                    <input
                      value={current.emailSubject}
                      onChange={(e) => updateCurrent({ emailSubject: e.target.value })}
                      className="lx-field text-xs w-full"
                      placeholder="Email subject..."
                    />
                  </div>

                  <div>
                    <label className="text-xs text-[var(--text-secondary)] font-medium mb-1 block">
                      Email Body
                    </label>
                    <textarea
                      rows={9}
                      value={current.emailBody}
                      onChange={(e) => updateCurrent({ emailBody: e.target.value })}
                      className="lx-field font-sans text-xs resize-y leading-relaxed"
                      placeholder="Email body text..."
                    />
                  </div>

                  {/* Email Live Preview */}
                  <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3.5">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-2.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-[var(--accent)]" />
                        <span>Live Email Preview</span>
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        From: {storeName} &lt;concierge@laluxurys.com&gt;
                      </span>
                    </div>

                    <div className="rounded-xl border border-[var(--border-strong)] bg-white dark:bg-[#18181b] p-4 text-xs flex flex-col gap-3 shadow-xs">
                      <div className="border-b border-[var(--border-subtle)] pb-2.5">
                        <span className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Subject:</span>
                        <h4 className="font-semibold text-sm text-[var(--text-primary)]">
                          {renderPreview(current.emailSubject)}
                        </h4>
                      </div>
                      <div className="text-[var(--text-primary)] whitespace-pre-wrap font-sans text-xs leading-relaxed">
                        {renderPreview(current.emailBody)}
                      </div>
                    </div>
                  </div>

                </>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">
                  Email notifications are turned off for this action.
                </p>
              )}
            </div>

            {/* Test Send Box */}
            <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 bg-[var(--surface-sunken)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Test Delivery of This Template</span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                Send a real test message to your own phone number or email using your active SMS/SMTP gateway keys.
              </p>

              <form onSubmit={handleTestSend} className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                    Phone (e.g. +233 24 000 0000)
                  </label>
                  <input
                    type="tel"
                    placeholder="+233..."
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="lx-field py-1 text-xs w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    placeholder="you@domain.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="lx-field py-1 text-xs w-full"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={testing || (!testPhone && !testEmail)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-base)] disabled:opacity-40"
                  >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send Test Now
                  </button>
                  {testResult?.message ? (
                    <span className={`text-xs ${testResult.ok ? "text-emerald-600 font-medium" : "text-danger"}`}>
                      {testResult.message}
                    </span>
                  ) : null}
                </div>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
