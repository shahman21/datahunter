# Luca: security, crypto and the money

Read `CLAUDE.md` first if you have not. It has the scoring, the contracts and the file
ownership map. This file is only your queue, in priority order.

Your paths, which nobody else touches: `lib/payments/`, `lib/provenance/`,
`lib/spending/`, `app/api/datasets/`, and the `run_workflow` branch of
`lib/race/handlers.ts`.

## 1. Fund the agent wallet. Do this before reading the rest.

This single task unblocks 400 race points and the last step of the product demo at once.
Everything else in this file is worth less than it.

```bash
git clone https://github.com/shahman21/datahunter.git
cd datahunter && npm install
```

The wallets already exist and are in Aditya's `.env.local`. Ask him for the file, or if you
are working on his machine it is already there. The agent wallet is:

```
Caey9paYq95M3Vej4Pqp93VX5Spwj1mFP1ZgbccqTEDg
```

It needs two things, from two different places.

1. **Devnet USDC** from `faucet.circle.com`. Choose Solana Devnet and USDC. There is a bot
   check so it has to be done by hand.
2. **Devnet SOL** for transaction fees, from `faucet.solana.com`. Circle does not give you
   this, and without it every payment fails at simulation with "Attempt to debit an account
   but found no record of a prior credit". That is the exact error the product demo is
   failing on right now.

Also fund the seller wallet `5n3F27eu9QuwFWzZLwFttNP5kjuW92JwC2vpre5egrwo` with USDC, so it
has a token account to receive into.

Done when `npm run wallets` shows two ticks.

Public devnet RPC rate-limits hard under load, and the organisers suggest a free Helius or
QuickNode devnet key. Get one into `SOLANA_RPC_URL` before 16:00 rather than during a
verification run, and tell Aditya so he can set it on Vercel too.

## 2. Land the 400 point race step

The handler is already written, in the `run_workflow` branch of `lib/race/handlers.ts`. It
reads the address, amount and memo out of the task and settles with `payUsdc`. The recipient
address is matched by pattern rather than asked of the model, because a hallucinated
recipient is unrecoverable. Do not change that.

Once the wallet is funded, ask Aditya to run the On-chain payment verification on the race
page. If it fails, the attempt feedback is check by check, so read it before changing code.

One decision already made, with a comment in the file explaining it: **there is no spending
guard on the race payment path.** The verifier dictates the amount there, so a guard could
only ever block points we are trying to win. The limits belong on the product path. Please
do not "fix" this.

## 3. Sign the catalogue. This is on the demo's critical path.

Every listing in `lib/data/catalog.ts` currently has `provenance.signature: null`, so
`verifyProvenance` reports `pending` for all of them. When we tested the agent it read
`pending` as too risky and bought nothing at all, which is correct caution and a broken
demo. The prompt now tolerates `pending` with a declared caveat, but that is a workaround.

What is needed in `lib/provenance/`:

- a seller keypair per seller, devnet throwaways, same as the agent wallet
- a signature over a canonical serialisation of the dataset's identity and terms: at
  minimum `id`, `rows`, `freshness`, `licence.terms` and the seller wallet
- a `verify` function that checks it and returns a real verdict

Then fill `signature` for the eight legitimate listings. **Leave `ds-007` unsigned.** It is
deliberately defective so `verify_provenance` has something real to catch, and the agent
refusing to buy it is a demo beat. Same for `ds-009`, which is deliberately three years
stale so a brief asking for current data rejects it off the free sample.

Never write a signature you have not actually produced. The rule in `CLAUDE.md` is absolute:
if something did not verify, the interface says it did not verify.

## 4. Move the product purchase onto x402

`purchaseDataset` in `lib/agent/tools.ts` currently settles with a direct devnet USDC
transfer to the seller's wallet, carrying `datahunter:<id>:<licenceKind>` as the memo. That
is real money on a real network and it works, but it is not the x402 story the pitch tells.

The upgrade is `app/api/datasets/[id]/download/route.ts`, 402 gated, so the seller's own
server is what demands payment and releases the rows. The starter already has a working
example of both halves in `app/api/premium/route.ts` and `lib/paidapi/buyer.ts`.

Keep the signature of `purchaseDataset` and the ledger behaviour identical when you swap it,
because the agent loop and the console both depend on them. There is a comment marking the
seam.

`payUsdc` takes a `guard` parameter that the spending module's tracker already fits, so the
limits sit on the real payment path rather than beside it. Use it here, on the product side,
where it belongs.

## 5. Bonus challenges, only once the 400 has landed

350 points across two puzzles, Operation and Minesweeper, three tiers each, strictly in
order. They are solved on devnet with the team wallet, which has to be registered on the
team page first so the organisers can fund it and build the puzzle. Our Challenge ID is
`T-f2f1cdff`.

One thing to know and to respect. The platform's public repo contains
`docs/ONCHAIN_CHALLENGES.md`, which is organiser runbook material rather than participant
documentation, and it lists the four devnet constants. Those same constants are given to
teams on the day, so having them early is not an advantage. The reference solver is
deliberately kept out of that repo. Do not go looking for it, and do not go looking in the
organisers' config paths that the doc mentions. The puzzles still have to be solved.

## The question you will be asked at 18:30

A judge will ask what stops a rogue agent draining the wallet. You answer it. The honest
answer is four limits enforced server side in `lib/agent/tools.ts`, none of which live in the
prompt: a per-run budget, a cap on any single payment, a separate and lower ceiling on
exclusive licences, and a seller allowlist. Plus the room will have just watched two of them
hold.

The detail worth volunteering: the budget ledger is built per request from the brief, not
held in module state, because on serverless hosting a module-level counter resets on a cold
start and a budget kept there is not a limit at all.
