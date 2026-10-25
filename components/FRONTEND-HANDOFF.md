# Frontend handoff

## Current functionality

- Root and /console use a dark, brief-led data-hunt workspace with an initially collapsed
  sidebar. Each hunt owns its events, budget, mode, results and status.
- Browser-local history survives refresh. A running live connection is marked interrupted
  on reload; it is not silently restarted. Older preview snapshots are not given new trust
  badges or silently upgraded into a new workflow.
- The request and colour-coded metrics stay above an independently scrolling activity panel.
  Reading older activity pauses following; Jump to latest restores it.
- Every frozen AgentEvent has a display. Quotes, settled spending and delivered data remain
  distinct. Only actual live signatures generate explorer links.
- Preview examples use no API calls, fabricated signatures or wallet keys. Negotiation shows
  expandable topic excerpts and a full conversation, clearly labelled as an example.
- Catalogue shows every listing's seller, rows, exact freshness date, stale-data indicator,
  standard and exclusive pricing, terms, signature state and expandable trust assessment.
- Shared theme rules are scoped so unrelated utility/race pages are not redesigned.

## Trust boundary / remaining integration

The policy evaluator and UI are complete. Backend integration is prepared but NOT applied,
because CLAUDE.md reserves those files for Aditya and Luca and user approval is pending.
New live initiation is deliberately paused by TRUST_ENFORCEMENT_READY=false. The original
API endpoints do not yet enforce the new trust policy. Do not describe this as completed
server-side trust enforcement or as legal certification.

See components/trust/BACKEND-HANDOFF.md and BACKEND-INTEGRATION.patch. The real evidence
registry is empty, so signed catalogue entries still require review. Do not seed fake
reviewed records merely to make a live purchase succeed.

After the backend owners apply the gates and no-network integration tests pass, enable
TRUST_ENFORCEMENT_READY. The live client already POSTs the frozen brief/budget contract,
reads split NDJSON, routes events to the correct hunt, and handles HTTP and stream failures.

The feat/negotiation branch is integrated locally at 87d287d. The parser and renderer
accept its offer/deal events and negotiate_price tool. Conversation summaries are derived
from received events, with exact messages and separate agreement/payment states. No backend settings
controls have been added; the user explicitly deferred them.

## Checks

```sh
npm run typecheck
npm run build
node --import tsx --conditions=react-server --test components/negotiation-stream.test.ts scripts/test-negotiation.ts components/search-history.test.ts components/negotiation-preview.test.ts components/trust/policy.test.ts components/trust/catalogue.test.ts scripts/test-console.ts scripts/test-race.ts scripts/test-transfer.ts scripts/test-spending.ts scripts/test-spending-x402.ts
```

Browser checks cover preview forms/history, independent progress, fixed dashboard scrolling,
text focus without a bright highlight, narrow layouts, negotiation expansion, honest
catalogue assessments, trust examples, and zero API calls. Real model execution and real
settlement have not been run in this session, as requested. A real-run fallback recording
for the pitch still requires a funded/configured demo environment and authorization.

## Git scope

Frontend changes: app/console/, app/market/, components/, app/globals.css. The original
scripts/test-console.ts is in the shared scripts directory. README.md had a pre-existing
user change; do not include it accidentally in the frontend commit. No changes are pushed.
The earlier backup stash remains available. Local main includes negotiation commit 87d287d; the remote main branch remains at c922e41. Nothing is pushed.

## Design reference

Custom dark neutral/slate surfaces, restrained muted green controls, and blue/violet/teal
metric cards. The visual structure follows Radix Themes' spacing, surface hierarchy,
semantic colours and medium radii; the Radix component library is not installed.
https://www.radix-ui.com/themes/docs/theme/overview
