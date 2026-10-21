# 0080: Paid beta keeps owner inference behind a free-tier gateway

Status: implemented locally; cloud activation and live integration verification pending.

## Decision

Use Cloudflare Workers Free for account/billing/inference routing, Supabase Free for Auth and an atomic SQL billing ledger, and Stripe Checkout/Customer Portal for paid subscriptions. No cloud media storage, rendering or GPU service is introduced.

The initial prices are $5/month for existing personal Hermes connections and $19/month for managed inference with $12 of provider usage per paid billing period. There is no free funded AI trial, rollover, loyalty discount or automatic overage. The managed default is `z-ai/glm-5.3-flash`. Personal connection choices remain available on both paid plans.

Only a verified paid invoice grants an entitlement and allowance. The desktop checks paid access before starting/submitting an assistant session; every owner-funded request is independently checked and reserved on the server. This protects owner funds without pretending a modifiable local application can enforce a perfect DRM boundary around a customer's own credentials.

Owner inference/stock/Stripe/service-role secrets live only in the gateway. The desktop contains its public gateway origin and an OS-encrypted account session in a separate vault. A bearer-protected loopback adapter supplies the existing Hermes custom-provider protocol while refreshing cloud sessions in main. No refresh token is handed to Hermes or a renderer.

Managed requests reserve conservative bounded costs in integer micro USD. Actual receipts settle against the original paid period. Ambiguous failures/cancellations retain a visible hold until a trusted receipt is reconciled. Price/model/output limits, per-account concurrency/rates, and a shared daily spending cap bound owner exposure. Jev follows the managed funding route when selected; it does not silently bill a personal key.

Managed sales and shared stock are disabled by default. Activation requires funded provider access, provider approval as applicable, real SQL/concurrency/payment tests, and a configured release origin. Packaged builds without account configuration refuse new AI use but retain manual editing and exports. Source development without a cloud origin stays explicit and independent.

## Consequences

The small-beta backend can stay within free allowances; this is not a promise of permanently free operations, immediate Stripe payouts or zero deployment costs. Free-tier uptime/CPU/quotas require live verification. Unknown usage needs operator reconciliation. Subscription plan switching/proration, remote managed media payloads, arbitrary hosted paid tools and a custom admin console are deferred.

Deployment and remaining live checks: [`services/beta-gateway/README.md`](../../services/beta-gateway/README.md).
