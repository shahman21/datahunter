# Preview demo walkthrough

Status: UI preview is verified. Live trust enforcement and real negotiation integration
are not complete. No model calls or payments are needed for this walkthrough.

## Before presenting

1. Run `npm run dev` and open `/console/preview`.
2. Use a 1280-wide window at 100% zoom. Choose the light or dark theme for the room.
3. Click New data hunt if a saved dashboard is open. Leave the sidebar collapsed.
4. Click Full demo. This loads the complete example immediately, without API keys.

## The story, about 90 seconds

- The buyer supplies a brief and a budget. The request and metrics remain visible.
- A candidate has a valid signature but forbids model training. Expand its trust assessment
  and Training and usage rights. Explain that signatures establish integrity, not permission.
- An alternative passes the example policy checks. Expand the personal-data and locations
  evidence. Say explicitly that these review records are simulated, not real seller audits.
- The exclusive licence exceeds the spending ceiling. Show the persistent refusal and the
  non-exclusive alternative. A policy refusal is not the same as a broken application.
- Expand the negotiation price section, then Full conversation. Preview messages are simulated, but they use the same offer/deal event contract as
  the integrated negotiation backend. Live conversations render through this same component.
- Finish with the simulated payment/delivery and the final budget. No transaction receipt
  is fabricated. The real catalogue separately shows missing evidence as Needs review.

## Useful secondary checks

- Theme selection survives refresh and navigation to Catalogue.
- Open the sidebar, create another preview, and switch between hunts.
- Activity preview demonstrates incremental updates; Payment failure demonstrates an
  interrupted outcome without reporting a successful payment or delivery.
- Refresh retains the current-version preview and its brief. An earlier-version running
  preview is marked interrupted rather than silently upgraded into new trust results.

## Claims to make accurately

The implemented UI has evidence-linked assessment states and a tested policy evaluator.
The integration patch for real sample/payment enforcement is prepared, not applied.
New live hunts are paused in this UI until that integration is authorized and verified.
Existing direct backend endpoints are not yet governed by the new trust policy.
This is a procurement-policy check, not legal certification or a universal transfer-law engine.

A real model/payment demo and its fallback recording still require the team environment
and an explicitly authorized run. Do not present the preview as that recording.
