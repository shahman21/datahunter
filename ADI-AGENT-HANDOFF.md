# Handoff for Adi's agent

Read this first, then `CLAUDE.md`, `AGENTS.md`, and `STATE-OF-WORK.md`.
This handoff supersedes older frontend notes where their status differs.

## Current state

Zachary's UI is implemented and verified for a **simulated demo**. The real negotiation
backend from `origin/feat/negotiation` was fast-forwarded into local main at `87d287d`.
This push includes that backend commit plus the frontend work and this handoff.

The only integration conflicts were `components/Console.tsx` and `app/globals.css`.
They were resolved by retaining the new workspace UI and incoming styles, then explicitly
adding support for the new frozen `offer`/`deal` events and `negotiate_price` tool.
Do not restore the older console from the negotiation branch over the current component.

**Not complete:** server-side enforcement of the NEW non-personal-data trust policy.
The existing backend has provenance checks, spending controls, negotiation and settlement;
that does not mean it already enforces the new rights/privacy/location evidence policy.
No real model request or payment was made while verifying this UI.

## User requirements and boundaries

- Dark by default, with a persistent light/dark toggle. Keep both themes readable.
- Mature, minimal workspace; no ChatGPT imitation, neon effects or bright textbox focus rings.
- Call a task a **data hunt**, not a search.
- Initially collapsed history sidebar; each hunt has its own request, events and metrics.
- Request and metrics stay fixed; only the activity panel scrolls.
- Colour-coded spend/budget/delivery cards; persistent, prominent refusals.
- Negotiation summaries expand to exact received messages and the complete transcript.
- Never count an agreement or a quote as settled spending. Delivery is a separate event.
- Never fabricate transaction signatures or explorer links. Preview payments have no receipt.
- All preview evidence, conversations and payments must remain clearly labelled simulated.
- The user deferred the optional task-settings questionnaire. **Do not add it yet.**
- The user asked not to execute real model/payment tests at this stage. Get authorization
  before an end-to-end live run; prefer no-network tests and intercepted browser responses.
- Respect file ownership in CLAUDE.md. Zachary changed frontend paths and shared test scripts.
  Changes to Aditya/Luca-owned files for the new trust gate were prepared, not applied.

## Main files

| File | Responsibility |
| --- | --- |
| `components/Console.tsx` | Landing composer, sidebar, selected hunt, live client, preview controls |
| `components/search-history.ts` | Validated browser-local persistence and preview progression |
| `components/agent-stream.ts` | Validates and reads NDJSON, including split chunks and final lines |
| `components/Activity.tsx` | Rendering for every frozen AgentEvent, including offers and deals |
| `components/negotiation-threads.ts` | Groups actual conversation events by dataset and licence |
| `components/Negotiation.tsx` | Expandable summaries and exact complete conversation |
| `components/preview-scenarios.ts` | Deterministic, explicitly simulated example events |
| `components/ThemeToggle.tsx` | Saved theme preference and cross-tab synchronization |
| `app/globals.css` | Shared `--dh-*` semantic palettes and scoped component styles |
| `app/market/page.tsx` | Prices, licence, seller, freshness, signature and trust assessments |
| `components/trust/` | Policy evaluator, empty live evidence registry, examples, tests and handoff |

Root and `/console` use the same workspace. `/console/preview` is preview-only.
The root workspace also has a live client, but new live initiation is intentionally paused
by `TRUST_ENFORCEMENT_READY = false` in `components/trust/integration-status.ts`.
A saved live hunt can still be inspected. A live connection interrupted by reload is marked
interrupted; it is not silently restarted or recharged.

History key: `datahunter.searches.v1`. Theme key: `datahunter.theme`.
The current preview workflow version is 3. Historical previews do not receive new trust
badges retroactively; older running previews stop with an explanatory message.
Very small preview budgets produce a refusal instead of invalid zero-price offers.

## Highest-priority next work: integrate the trust gate

Read `components/trust/BACKEND-HANDOFF.md`. An exact, currently applicable patch is at:

`components/trust/BACKEND-INTEGRATION.patch`

This patch is **not applied**. Review it against your current backend and coordinate with
Luca. `git apply --check components/trust/BACKEND-INTEGRATION.patch` currently succeeds.

The required gates are:

1. Before `getSample` materialises or exposes any rows.
2. In `checkBudget`, which also guards negotiation offers, and again on the purchase path.
3. Before the download route enters its x402 paywall, RPC lookup or settlement path.
4. Report the same assessment through catalogue/provenance results and honest refusals.
5. Remove the outdated model prompt saying pending provenance may be purchased.

Do not apply this policy to the race adapter or on-chain challenge solvers.

Policy: non-personal data only, documented seller identity and training/licensing rights,
with reviewed UK hosting, processing and remote-access locations. This is a deliberately
narrow procurement policy, not a universal interpretation of international transfer law.
A signature proves listing integrity, not rights, anonymisation or legal compliance.
Missing evidence means **Needs review**. Contradictory evidence means **Blocked**.

`REVIEWED_EVIDENCE` is deliberately empty: no rights, identity, personal-data or location
documents were actually reviewed for the seeded sellers. Consequently, all real listings
need review or are blocked. **Do not copy mock evidence into the live registry to pass a demo.**
A reviewed record must identify its source/reviewer and match the current listing signature.
The positive examples live in a separate demo-only module and have no fabricated signatures.

After integrating gates, add no-network backend tests proving refused samples contain no
rows and refused downloads never demand payment. Only enable `TRUST_ENFORCEMENT_READY`
when those checks pass. Missing evidence will still prevent purchases until genuine review
records exist; do not remove the gate merely because the seeded catalogue cannot pass.

## Verification

Latest completed verification before this handoff: production build, TypeScript,
62 offline tests, and Chrome integration checks. Re-run after changes:

```sh
npm run typecheck
npm run build
node --import tsx --conditions=react-server --test components/negotiation-stream.test.ts components/trust/policy.test.ts components/trust/catalogue.test.ts components/negotiation-preview.test.ts components/search-history.test.ts scripts/test-console.ts scripts/test-race.ts scripts/test-transfer.ts scripts/test-spending.ts scripts/test-spending-x402.ts scripts/test-negotiation.ts
```

Using `node --import tsx` avoids the tsx CLI's local IPC socket restriction in some sandboxes.
The negotiation test suite removes ANTHROPIC_API_KEY within its own test process and uses
an explicit test quote secret, so it does not contact the model.

Chrome checks covered both themes, normal-text contrast (4.5:1) and large-text contrast
(3:1), expanded trust/conversation panels, form focus, fixed dashboard scrolling,
sidebar interactions, mobile layout, saved history, exact negotiation messages, and the
fact that agreements do not create settled spend or receipts. Browser API calls were
intercepted/blocked. Browser fixtures were isolated; no real user history was modified.
Temporary browser scripts/screenshots were under `/tmp` and are not portable repo assets.

## Demo

See `components/DEMO-CHECKLIST.md` for a 90-second walkthrough.

```sh
npm install
npm run dev
```

Open `/console/preview`, choose a theme, click **Full demo**. No environment keys are
required for the preview. It shows a signed-but-training-prohibited candidate being
rejected, an example alternative, an exclusive-price refusal, negotiation from 0.04 to
0.03 USDC, and simulated payment/delivery. Use **Activity preview** for incremental
updates and **Payment failure** to show an agreement without a successful payment.

A real demo additionally requires the team's Anthropic key and funded devnet setup as
specified in `.env.example`, plus the trust integration and genuine reviewed evidence.
DATAHUNTER_QUOTE_SECRET is optional if AGENT_PRIVATE_KEY is configured; the negotiation
backend derives its quote-signing key from the agent key otherwise. Never put keys in
client components, NEXT_PUBLIC variables, commits or this handoff.
A genuine live-run fallback video has not been recorded in this UI session.

## Git and deployment

The user explicitly requested committing and pushing all current code to main, including
this handoff. The earlier README whitespace-only change was normalized. Local backup
stashes remain on Zachary's laptop and are not part of the remote repository.
No Vercel deployment is implied by this push. Use the team's deployment workflow separately.
