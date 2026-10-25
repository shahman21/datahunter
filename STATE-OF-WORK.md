# State of work — 25 Oct 2026, 16:05

Written to hand this over cold. Everything below is verified rather than expected; where
something is unverified it says so.

## The headline

The two things that blocked us all afternoon are gone. An organiser provisioned the team on
chain and funded the wallet at about 15:42. That means:

- **The wallet holds 0.049995 devnet SOL.** Direct transfers work again, so the race's
  400-point `run_workflow` step is unblocked.
- **The team is provisioned.** `claim` and `holdings` records exist, CRED was funded with
  1,000,000 base units.
- **Both optional puzzles are solved on chain.** All six conditions are satisfied; what is
  left is pressing Run verification.

Do not send the organiser message drafted earlier. It asked for exactly these two things.

## What needs a human, right now

1. **Press Run verification on the six optional challenge tiers, in order.** Operation
   30 → 50 → 70, then Minesweeper 90 → 80 → 30. The chain work is done; the panel only has to
   read it. 350 points.
2. **Press Run verification on the on-chain payment step.** 400 points. Verified working
   locally against a real devnet transfer (see below), and production runs the same handler
   with the same funded wallet.
3. **Final submission on the Submit page.** 200 points. The platform rejects synthetic clicks,
   so it has to be a real one.
4. **Deploy to production.** Needs a Vercel API token, which is not stored in the repo and I
   was not able to go looking for it:
   `npx vercel deploy --prod --yes --token <token>`.
   Production currently runs the previous commit. The x402 purchase path is in `b5f9af8` and
   needs that deploy before the console demo settles in production. **No new environment
   variables are required.**

## Evidence for the on-chain work

| What | Evidence |
|---|---|
| Operation, all three tiers | 5313 CRED (`1000 + nonce mod 9000`) to clearance `7jPk88Uq…`, memo `3a84fd2185a0b734`, tx `5fnEH2heU9KaLzCBqwpGdPbYsgjGgrzGMta5eWwkMutJj2kdN4Yq2Nz55esFtiAZPbgwKFCfk45HiCNQcYGaEt1k` |
| Minesweeper, minted | `mint_code` tx `126hooSHf1eUa7FvBzM8PSwQKFnJe6k3w24KyPEuFsrSzj22Nj6ecp8tpDGNWEx5HyuKPkPDjjjuuQfzQ5tXzeWY`, code `5AXVs8Ch` written to the deed |
| Minesweeper, presented + fast hands | 1 CRED to the presentation account with memo `T-f2f1cdff:5AXVs8Ch`, tx `4d8b7WMTcb14BqiMEDF7ugGpLRRFGhqhV9eLPEHSqDoBph51LNaE2rEimeM6YpdSb6QZYVxoVvrww8n7TctkwRko`, **4.6 s** after the mint |
| Balances agree | clearance 5313, presentation +1, our CRED 1,000,000 → 994,686 |
| Race payment handler | `npm run race:try -- run_workflow "Pay 0.01 devnet USDC to <addr> with the memo <memo>"` → 200 in 1984 ms, signature `57cB6NGyM1enbzwcMbprmV1TDRhEHNYewt7uiiVeFyHva9iXhzFc7iCa9121TGu1PJbXXBxhGuJ5TjY1m5sNKJnL` |
| Product purchase over x402 | agent run end to end, 25 events in 22.3 s, `payment_sent` carrying a real signature with **zero SOL** needed |

## The challenge scripts, and how they were built

The program publishes no on-chain IDL, so the instruction layouts were read off devnet from
transactions other teams had already landed. `npm run challenge:recon` prints them: the
discriminator, the data, and the account list in order. That is why `mint_code` is exact rather
than guessed. Nobody went looking in the organisers' repo paths or for a reference solver.

- `npm run challenge:check` — are we provisioned, what do the records hold, what is the nonce,
  the clearance account and the registrar. Run this first after anything changes.
- `npm run challenge:recon [limit]` — the program's recent transactions, decoded.
- `npm run challenge:idl` — reports that no IDL is published (kept, so nobody re-checks by hand).
- `npm run challenge:operation [-- --send]` — simulates, then sends, the clearance transfer.
- `npm run challenge:minesweeper [-- --send]` — mints, reads the code back out of the deed, and
  presents it in one run, which is how fast hands is met without a human in the loop.

Both solvers simulate by default and only send with `--send`, so a wrong answer costs a log
line rather than an attempt.

One subtlety worth keeping: the code in the deed record is **exactly eight characters** at bytes
22–29, not "printable bytes until the first that is not". Two teams' deeds settle it — one team's
tail begins with a printable byte, so the scanning read would present a code with a junk
character on the end. `readCode` in `scripts/challenge-lib.ts` documents the reasoning.

## What changed in the product (commit `b5f9af8`)

`purchase_dataset` now settles over x402 against our own 402-gated download route instead of a
direct transfer. The facilitator pays the network fee, which is why it works with an empty SOL
balance. `DATAHUNTER_SETTLEMENT=direct` switches back to the direct rail in one env var if the
facilitator is down at 18:30; the direct rail needs SOL, which we now have, so both work.

Three routes finish the frozen contract: `GET /api/datasets` (free), `GET /api/datasets/:id/sample`
(free), `GET /api/datasets/:id/download` (402-gated, priced from the listing, so an exclusive
licence genuinely costs the seller's multiple).

Two deliberate properties, both worth saying out loud to a judge:

- The download route refuses a listing whose provenance does not hold **before** it demands
  payment — 409, no money moves. A seller who cannot prove where rows came from cannot take
  money for them. `ds-008` demonstrates it.
- The handler only returns rows on a 2xx, and a 2xx is what tells x402 to settle. Rows without a
  settled payment is not a reachable state, and neither is a settled payment without rows.

## The one claim to be careful about on stage

Seeded sellers hold real ed25519 signing keys and really sign their listings, but they have never
been funded, so they have no devnet USDC account and a transfer to them fails at simulation. The
route detects that and settles into the marketplace's own account instead — and then says so.
The console prints "Paid into the marketplace settlement account 5n3F27eu… on the seller's
behalf, not the seller's own wallet."

Say that before a judge finds it. The rail is real, the signature is real, the money really
moves; the counterparty is a stand-in because the sellers are seeded, which is the same answer as
"where does the data come from". If sellers are ever funded, the route pays them directly with no
code change — it checks per seller.

## Not done

- **Production deploy** of `b5f9af8`. Needs the token. Everything else in this file is
  independent of it.
- **A recorded fallback run** of the console for the pitch. Zachary owns this; the venue wifi is
  the reason it matters.
- The demo arc is unchanged and still verified: budget refusal first (exclusive at 0.16 refused
  against the 0.05 ceiling, re-plan, non-exclusive at 0.04 settles), then the provenance refusal
  (`ds-008` tampered, agent spends nothing). Both briefs are in `.claude` memory and in
  `npm run agent:try`.
