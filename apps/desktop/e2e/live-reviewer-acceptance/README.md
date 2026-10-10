# Live editor acceptance

Use the normal Hermes → OpenRouter streaming path. No custom spending proxy,
request admission, SDK interception, socket boundary or spending ledger.
The provider's existing key limit controls allowance; small in-flight overages
remain possible. Never change the limit automatically or claim exact guarantees.

Current selected model: `openai/gpt-6-luna`, high reasoning, 16 normal iterations,
4,096 completion tokens per request. No model retry/session retry. Single standard
OpenAI provider route, alternate provider variants excluded, no model fallback.
The disposable process disables auxiliary inference; product configuration and
timeline/review/memory safety are unchanged. Clarifications resolve naturally
in the same session; only the 20-minute overall session deadline terminates it.

From the repository root:

1. `npm run build:e2e`
2. `node_modules/.bin/playwright test --config apps/desktop/playwright.config.ts hermes-streaming-offline.spec.ts --project serial --retries 0`
3. Bundle `preflight.ts` with esbuild for Electron (`platform: node`, `format: cjs`,
   `external: ['electron']`), then run it with the normal Electron binary. It only
   reads authenticated key/catalog metadata and checks native configuration.
4. With explicit user spending authorization, run:
   `SCLIP_PHASE4B3_PAID_OPT_IN=1 node_modules/.bin/playwright test --config apps/desktop/playwright.config.ts live-reviewer-acceptance.spec.ts --project serial --retries 0`
5. Independently inspect the project diff, actual export, relevant audio/frames,
   reviewer feedback, and verification. Do not feed QA back into Hermes or retry.

The current approved input is the preserved 89.9-second regression draft with
the natural brief in the spec. Copy it into a disposable workspace; its assembly
is fixture work, not model work. `SCLIP_LIVE_ACCEPTANCE_DIR` selects a new artifact
directory; existing results are never overwritten. Metadata before/after plus
native session usage report actual spending without intercepting primary calls.
Future media/brief selection requires fresh authorization and an explicit test
fixture change; never reuse exposed footage for an unseen holdout claim.

The offline test mocks only its provider HTTP transport and invokes the installed
Hermes stream accumulator/tool dispatcher against actual local Sclip MCP. Its
mock is never imported by the live entrypoint. Real inference stays opt-in.
