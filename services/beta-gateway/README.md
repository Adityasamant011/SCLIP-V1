# Sclip paid beta on free infrastructure

This is the deployable source for Cloudflare Workers Free, Supabase Free, and Stripe pay-as-you-go. No cloud resources have been created, no real payment has been taken, and no managed model call has been made by these tests.

The desktop integration is in `apps/desktop/src/main/sclip/cloudAccount.ts` and `apps/desktop/src/renderer/settings/AccountSection.tsx`. All existing Hermes connections and personal stock key fields remain. Rendering and local models stay on the user's computer.

## Your part: account setup

1. **Cloudflare:** create a free account and enable Workers. Keep the Workers subscription on **Free**. The default `workers.dev` address avoids needing a new domain for the gateway. Do not enable paid Workers, R2 storage or automatic paid upgrades for this beta.
2. **Supabase:** create one **Free** project. Save its project URL and legacy anon/public key. The service-role key is a server-only secret. In SQL Editor run `supabase/001_billing.sql` once. Enable email/password authentication and email confirmation. Configure a production email sender (a free SMTP allowance can be used with an existing verified domain). The default test sender cannot serve general customers reliably. Add your gateway's `/account/recovery` URL to Auth's redirect allowlist, and set the site URL to the gateway's `/billing/return`. Never disable email confirmation as a workaround.
3. **Stripe:** complete your business/payment eligibility setup. Start in **test mode**. Create two recurring **monthly USD** prices: **Bring your AI, $5** and **Sclip AI, $19**. No trial, coupons, annual option or loyalty reduction. Save the two price IDs. Configure Customer Portal for payment-method updates, invoices and cancellation at period end; disable mid-cycle price/quantity changes for this initial beta. Plan switching/proration is intentionally not offered until a paid-invoice migration has been tested. Decide the appropriate tax configuration for your business before live checkout; this code does not register or remit taxes for you.
4. **OpenRouter:** only needed to activate the managed plan. Use a separate funded inference key for Sclip, with a provider-side spending limit as a second boundary. It must not be a management/provisioning key. Paying Stripe does not instantly fund OpenRouter; allow for payout delays. You can launch BYOK with managed sales disabled.
5. **Pexels/Pixabay:** personal user keys already work independently. For shared stock, obtain owner keys and confirm the shared desktop integration meets each provider's terms/approval requirements. Keep shared stock disabled until then. No owner key is ever shipped in the app. Search attribution and imported asset provenance remain in the existing editor.

Never paste secrets into chat. Store server secrets using Wrangler's hidden `secret put` prompts or Cloudflare's dashboard. Only the gateway URL goes into the desktop release.

## Deploy after account setup

Use a reviewed/current Wrangler CLI compatible with your installed Node version. From this directory, authenticate with `wrangler login`. Verify the selected account is yours. `wrangler deploy --dry-run` bundles without publishing; then `wrangler deploy` publishes the Worker. The configuration does not select a paid plan. Check the account dashboard still says Free.

Set these server secrets with `wrangler secret put NAME` (one at a time):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (test key first)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_BYOK_PRICE_ID`
- `STRIPE_MANAGED_PRICE_ID`
- `PUBLIC_ORIGIN` (your exact HTTPS Worker origin, no path)

Optional server secrets: `OPENROUTER_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`. `.dev.vars.example` lists the shape; keep actual `.dev.vars` private and ignored. Do not run paid services or install scheduled paid jobs.

In Stripe create a webhook endpoint at `https://YOUR-WORKER/v1/stripe/webhook`, API version **2025-06-30.basil**, listening to `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`. Save that endpoint's signing secret in the Worker. Test and live signing secrets/price IDs must never be mixed. The raw signature is checked before billing mutation. Grants come only from re-fetched, fully paid monthly invoices matching approved prices. Checkout redirects do not grant access.

## Connect the app

Copy `apps/desktop/resources/cloud/sclip-cloud.example.json` to `apps/desktop/resources/cloud/sclip-cloud.json` and put the deployed HTTPS Worker origin into `gatewayUrl`. This file is gitignored and contains **no secret**. The packager places it beside the app's resources. Development builds can use `SCLIP_CLOUD_URL=https://YOUR-WORKER` instead. Existing provider/model selections are preserved; only a fresh, configured profile starts on Sclip AI / GLM 5.3 Flash.

Rebuild and package the desktop app after connecting the origin. Do not replace the currently installed app with an unconfigured billing build: packaged AI fails closed without an account service; manual editing/export remain available. The installed app has not been updated by this source change.

## Enable managed AI only after testing/funding

Defaults in `wrangler.jsonc` are intentional:

- `MANAGED_AI_ENABLED=false`: managed checkout and inference both refuse service.
- `MANAGED_DAILY_CAP_MICRO_USD=0`: there is no authorized shared AI spending.
- `SHARED_STOCK_ENABLED=false`: personal stock keys remain the fallback.

After testing with your funded owner account, explicitly set a modest daily cap in **micro USD** (1,000,000 = $1) and enable managed AI. The cap applies to reservations plus settled usage across customers, not just to one account. Insufficient balance or a reached cap blocks requests instead of charging overages. Reaching a cap can interrupt a paying customer's work: select a funded cap appropriate for the actual beta size and disclose beta limits.

Managed allowance is $12 of provider inference per fully paid $19 billing period, no rollover. Actual inference, including routed Jev requests, is debited. OpenRouter purchase fees, Stripe fees and taxes are outside the customer's inference allowance and reduce your margin. BYOK users fund their own providers directly; free models remain subject to provider quotas. Background reviewer/model follow-up calls follow the same managed gateway or the selected personal connection.

The managed completion endpoint accepts text evidence and function tools, not remote audio/image payloads or native paid web tools. Use Sclip's local visual/audio tools for footage. Managed Jev accepts bounded Noul questions only after checking its published tariff; it fails closed if pricing cannot be verified. Other arbitrary paid endpoints are unavailable.

## Usage reconciliation and operations

Each request atomically reserves a conservative maximum in a SQL transaction. Actual receipts release the unused reservation. Output is streamed to Hermes, and the worker consumes receipts in parallel. Cancellation and missing/failed receipts do **not** refund an unknown charge. The UI shows those holds; no automatic retry subsidy is created.

Inspect held usage in Supabase. An operator can run `node scripts/reconcile.mjs` to preview old holds and `node scripts/reconcile.mjs --apply` to settle verifiable OpenRouter generation receipts using private environment credentials. Rows without a trustworthy provider ID stay held for manual investigation. No background paid server is required. Reconciliation is not yet scheduled or live-tested. Do not refund all held rows on a timer.

Free limits need monitoring. Supabase may pause inactive projects; free plans do not promise production uptime/backups. Back up billing data before migrations and keep an external secure ledger export. Inspect unresolved usage daily while managed beta is open. Shared stock caches successful searches for 24 hours and caps global provider cache misses plus per-account misses. Pexels limit increases must not be assumed. Keep media downloads direct to the client, not through Worker/storage.

## Required activation checks

Local tests are useful but do not certify real Stripe, SQL or provider integrations. Before live mode:

- Apply SQL to the disposable/test Supabase project; verify anonymous/authenticated clients cannot read or mutate billing tables/functions.
- Confirm signup, email verification, login, password recovery, token refresh and logout on another Mac/profile.
- Pay with a Stripe test card; confirm exactly one allowance grant for duplicate/reordered webhook delivery, and no grant for a failed invoice, client redirect, underpayment, proration or unknown price.
- Run concurrent real database reservations at near-zero credit and near the shared cap. Verify no overspend and no cross-account leakage.
- Test a funded GLM 5.3 Flash tool call/stream and Jev receipt with a deliberately small separately authorized spend; check actual provider cost against ledger settlement.
- Disconnect/cancel mid-stream, reconcile its receipt, and verify allowance recovery; never reset an uncertain charge without evidence.
- Test renewal, period-end cancellation, refund, dispute, and deletion; verify manual editor/export still work.
- Enable shared stock only after approval; test attribution, image/video import, quotas and 24-hour cache behavior with owner and personal keys.
- Confirm clean install, signed/notarized release, your business/support/privacy details, Stripe tax settings and the actual free-tier dashboards before public distribution.

## Local verification

`node --test test/*.test.mjs` runs gateway/policy tests with network boundaries mocked. Desktop Vitest tests cover actual loopback routing with upstream requests mocked, secure session handling and GUI interaction. `npm run typecheck` and `npm run build` run from the editor root. No real database/payment/provider result should be claimed from these local tests alone.
