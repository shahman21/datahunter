# Trust-policy integration

The evaluator and frontend assessments are implemented. The changes in
`BACKEND-INTEGRATION.patch` have NOT been applied to teammates' files. They are
prepared for Aditya/Luca or explicit user authorization under CLAUDE.md ownership.
Live initiation in the new console is paused until the integration is complete.
Existing direct API endpoints are not yet governed by this new trust policy.

## Gate locations

- `lib/agent/tools.ts`: check before getSample materialises rows and in checkBudget,
  which purchaseDataset calls again before either x402 or direct settlement. Make
  verifyProvenance.safeToBuy mean the entire procurement policy passed.
- `app/api/datasets/[id]/sample/route.ts`: distinguish a policy refusal (403) from
  a missing listing (404).
- `app/api/datasets/[id]/download/route.ts`: refuse BEFORE paywalled(), facilitator
  configuration, wallet lookup or settlement, including direct calls to the route.
- `app/api/datasets/route.ts`: return the same assessment used by the UI and gate.
- `lib/agent/loop.ts`: remove the obsolete permission to buy pending provenance;
  expose a sample-policy refusal as a blocked event as well as a tool result.

The patch passes `git apply --check`. After applying it, add no-network integration
checks proving denied samples contain no rows and denied downloads never return
402 or enter the payment path. Only then set TRUST_ENFORCEMENT_READY to true.
Do not change the race adapter or on-chain challenge paths.

## Evidence and its limits

REVIEWED_EVIDENCE is deliberately empty. The current catalogue has signed listings,
but no operator-reviewed identity, rights, personal-data or location records.
Consequently, no current listing passes the full policy. Do not fill missing facts
from dataset names, public availability, licence assertions or de-identification claims.
Do not copy example records into the live registry to get a green demo.

A real reviewed record must identify its evidence and reviewer, and be bound to the
current listing signature. Add document version/expiry and periodic re-review before
production deployment. The current signature covers listing metadata, not proof of
ownership or a cryptographic digest of all delivered bytes.

The fixed MVP policy is non-personal data for commercial model training, with UK
hosting, processing AND access. Location restrictions are buyer procurement choices,
not a universal statement that other transfers are illegal. Unknown locations require
review. Record AI/cloud providers where they process or access the relevant data.

The examples demonstrate a signed but training-prohibited candidate being blocked,
followed by an alternative with simulated reviewed evidence. All example assessments
and payments remain labelled as simulated, without fabricated transaction signatures.

Reference guidance reviewed 25 October 2026:
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-brief-guide-to-international-transfers/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/are-we-making-a-restricted-transfer/
- https://www.edpb.europa.eu/sme/be-compliant/international-data-transfers_en
