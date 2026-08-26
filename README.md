# LaLuxury

An ecommerce store for a Ghanaian homeware brand: storefront, back office, Paystack payments
in cedis, and an AI operations agent reachable from Slack and WhatsApp.

Built with Next.js 16 (App Router), React 19, Prisma 7 + Postgres, Tailwind 4.

---

## Quick start

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate          # create the schema
npm run db:seed             # catalog, shipping zones, discounts, owner account
npm run dev
```

Sign in at `/login` with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` from your `.env`.
**Change that password before going live.**

Generate a secret with `openssl rand -base64 32`.

---

## Deploying to Railway

1. Create a project, add a **Postgres** service. Railway sets `DATABASE_URL` for you.
2. Add a service from this repo. Railway detects Next.js and runs `npm run build` / `npm start`.
3. Set the environment variables below in the service's Variables tab.
4. Set `NEXT_PUBLIC_SITE_URL` to the public domain Railway gives you (no trailing slash).
5. Run `npm run db:migrate && npm run db:seed` once, from the Railway shell.

`postinstall` runs `prisma generate`, so the client is always built against the deployed schema.

---

## Environment

Only two variables are required. Every integration is optional and reports its own
readiness on the admin dashboard, so the store boots and runs with just a database.

| Variable | Required | What it switches on |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Everything |
| `AUTH_SECRET` | ✅ | Sessions |
| `NEXT_PUBLIC_SITE_URL` | — | Correct Paystack callbacks and webhook URLs |
| `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | — | Checkout |
| `OPENROUTER_API_KEY` | — | The AI agent |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | — | Agent in Slack |
| `WHATSAPP_*` | — | Agent on WhatsApp |
| `SMTP_*` | — | Transactional email |
| `CLOUDINARY_*` | — | Image CDN |

See `.env.example` for the full list with setup notes.

---

## Webhooks

Point each provider at these, replacing the host with your domain:

| Provider | URL |
| --- | --- |
| Paystack | `/api/webhooks/paystack` |
| Slack (Event Subscriptions) | `/api/webhooks/slack` |
| WhatsApp (Meta callback) | `/api/webhooks/whatsapp` |

Admin → AI agent shows these with copy buttons and the exact Slack scopes needed.

All three verify request signatures and are idempotent — providers retry, and a replayed
delivery must never charge, ship or discount twice.

---

## The AI agent

One agent answers in three places — the admin console, Slack, and WhatsApp — and acts with
the permissions of whoever is talking to it.

**To switch it on, add `OPENROUTER_API_KEY`.** That is genuinely all it needs for the web
console. Slack and WhatsApp need their own keys plus a webhook URL.

The model is env-driven:

```
OPENROUTER_MODEL="openrouter/ox-alpha"
OPENROUTER_FALLBACK_MODEL="anthropic/claude-sonnet-4.5"
```

> ⚠️ **Confirm the `ox-alpha` slug on openrouter.ai/models.** Alpha and stealth models are
> renamed and retired often. If the primary is unavailable OpenRouter falls through to the
> fallback automatically, so the agent keeps working either way.

### How people talk to it

- **Slack** — mention the bot in a channel, or DM it. One conversation per thread.
- **WhatsApp** — message the business number. One rolling conversation per phone number.
- **Admin** — the console at `/admin/agent`.

### Who it trusts

A Slack member ID or WhatsApp number means nothing on its own. Link it to a staff account
under Admin → AI agent → *Who the agent trusts*. Anyone unlinked gets a polite answer and
is refused any change. This is what stops a wrong number repricing the catalog.

### The approval gate

With **Ask before the AI agent changes anything** on (the default, in Settings), any
write is described and parked until someone replies *yes*:

```
I am about to:
- Set ADCETALA-IVR price to GH₵950.00

Reply yes to apply, or no to cancel.
```

Turning it off lets the agent apply changes immediately. That is a real risk on WhatsApp,
where a mistyped message becomes an instruction — the settings page says so plainly.

Every agent action is written to the audit log with `source: agent`, visible at
Admin → Activity.

### What it can do

Read: search products, low stock report, list/get orders, sales summary, find customer,
list discounts. Write: update price, adjust stock, update product, create product,
create discount, enable/disable discount, update order status.

Tools are filtered by role before being offered to the model, then re-checked at execution
time — so a Staff-level account cannot talk the agent into a price change.

---

## Architecture

```
src/
  app/
    (shop)/          storefront: home, shop, product, cart, checkout, account, tracking
    (auth)/          sign in, register
    admin/           dashboard, products, orders, inventory, customers, discounts,
                     staff, agent, activity, settings
    actions/         server actions (cart, auth, checkout, admin/*)
    api/webhooks/    paystack, slack, whatsapp
  lib/
    db, env, money, slug, utils, constants
    auth/            sessions (JWT cookie), bcrypt, RBAC
    catalog          search, filters, facets
    cart             read/write split — see note below
    discounts        validation + proportional allocation
    inventory        onHand / reserved / available ledger
    orders           creation, transitions, refunds
    paystack         init, verify, refund, signature check
    agent/           openrouter, tools, runtime, slack, whatsapp
  components/        ui/, shop/, admin/
```

### Conventions worth knowing

**The home page is data, not markup.** Every product, room tile and price on it comes from
the database; the hero, the bundle banner and the section headings come from store settings
(`/admin/settings` → Home page). Adding a product to Bedding, Living or Windows puts it in
the edit grid; the badge on a tile is the product's `bestseller` / `new` / `luxe` / `deal`
tag. Artwork lives in `public/catalog`, produced by `npm run catalog:images`.

**Two kinds of picture, two pipelines.** `public/catalog/*.webp` is the commissioned
storefront artwork — heroes, room tiles and stand-in product renders — fetched by
`npm run catalog:images`. `public/catalog/products/*.webp` is photography of the real stock,
converted from the supplier's phone JPEGs by `npm run catalog:photos`. Both write committed
output, so a deploy never depends on a source that lives on one laptop. The photo importer
takes its originals from `~/Downloads/Product` unless `PHOTO_SOURCE` says otherwise, and the
file-to-product mapping — including which frames are cropped, turned or left out — is the
`PHOTOS` table at the top of `scripts/import-product-photos.mjs`.

**Counterfeit prints are not stocked.** The supplier's bedsheet folder includes sets printed
with Gucci, Louis Vuitton, Versace, Chanel and Burberry marks. Those frames are deliberately
absent from the importer. Listing them would be trademark infringement, and it is the kind
of listing that costs a store its payment processor rather than merely earning a takedown.

**Money is integer minor units.** `12050` is GH₵120.50. Nothing holds a price as a float.
Paystack also expects subunits, so no conversion happens at that boundary. Use
`formatMoney` to display and `toMinorUnits` to parse.

**Cart reads and writes are separate.** `readCart()` is for Server Components; it never
writes. `getOrCreateCart()` creates the cart and sets a cookie, so it is only valid inside
a Server Action or Route Handler — Next forbids cookie writes during render.

**Stock has three numbers.** `onHand` is physical, `reserved` is promised to unshipped
orders, and `available = onHand - reserved` is what may be sold. Checkout reserves,
payment commits, cancellation releases, refunds restock. Reservations take a row lock
(`SELECT … FOR UPDATE`) so two shoppers cannot both take the last unit.

**Discounts allocate proportionally.** An order-level discount is spread across line items
by value, with leftover pesewas going to the largest fractional parts, so the parts always
sum back to the total and per-item refunds stay exact.

**Redemptions count on payment, not on entry.** An abandoned checkout never consumes a
limited code.

**Order numbers avoid ambiguous characters.** `LX-8FK2QW` — no `0`, `O`, `1`, `I` or `B`,
because these get read aloud over the phone.

---

## Roles

| Role | Can |
| --- | --- |
| Customer | Shop, order, review, wishlist |
| Staff | View dashboard, read products/inventory/customers, fulfil orders |
| Manager | + edit products, inventory, discounts, moderate reviews, use the agent |
| Admin | + manage staff, settings, configure the agent |
| Owner | Everything; only an owner can change an owner |

Nobody can grant a role at or above their own, or edit their own account in Staff.

---

## Commands

```bash
npm run dev          # development server
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run verify       # domain checks: money, stock, discounts, roles
npm run db:migrate   # apply migrations
npm run db:seed      # seed catalog + owner
npm run catalog:images  # re-download and resize the storefront artwork
npm run catalog:photos  # re-convert the supplier's product photographs
npm run db:studio    # browse the database
```

`npm run verify` checks the things a click-through misses: that discount allocation always
reconciles, that stock moves correctly through reserve → commit → restock, that price
ranges match their variants, and that no password is stored in plain text.

---

## Known gaps

- **One artboard is built.** The home page, header, footer and bag drawer follow
  "Efie Home Storefront v2 Light". The other artboards (admin, archive, thank-you) are
  still on the earlier visual layer, which shares the same tokens in
  `src/app/globals.css`.
- **Product images are URL-based.** Paste a hosted URL in the editor. Direct upload needs
  the Cloudinary keys and an upload widget.
- **Transactional email is wired but not sent.** SMTP config is read and reported; the
  send calls are not yet hooked into order confirmation.
- **Reviews are collected and moderated but have no submission form** on the product page yet.
