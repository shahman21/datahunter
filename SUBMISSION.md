# Build Track submission, ready to paste

Copy each block into the matching field on https://superteam-agent-studio.vercel.app/submit
under BUILD TRACK, then save the draft. The race's "Idea locked in" step only checks the
first two, but every field marked \* is required for the submission itself.

---

## Project title \*

DataHunter

---

## Problem solved \*

Any company training a model needs data it does not already own, and acquiring it takes weeks of legal and commercial work for every single source. The buyer cannot verify where the rows came from or whether the seller had the right to sell them. The seller cannot get paid without an invoice and an existing relationship. Neither side can transact at the per-request amounts that machine-scale acquisition actually calls for. The people with this problem are small teams who need a defensible data position and cannot afford a procurement function, and the data holders who have sellable rows and no way to sell them.

---

## Project description \*

DataHunter is an agent-to-agent data marketplace. You give a buyer agent a brief and a budget. It searches a catalogue of datasets, pulls a free redacted sample to judge quality and freshness, verifies the seller's provenance signature, asks the spending limits whether a purchase is permitted, haggles with the seller's own agent over the price, and pays per download in USDC on Solana devnet. Every step streams live to an operator console, so the room watches it search, get refused by a limit, re-plan, negotiate and settle. Sellers list data with a non-exclusive price and a higher exclusive price, run their own agent that accepts, counters or holds, and are paid on delivery. The interesting half is not the buying. It is the refusing: an agent holding a wallet being told no by limits it cannot argue with.

---

## Code repository \*

https://github.com/shahman21/datahunter

---

## Demo link (optional)

https://datahunter-silk.vercel.app

---

## Technical architecture \*

Next.js 16 App Router on Vercel, React 19, TypeScript strict. Claude via the Anthropic SDK: claude-opus-5-5 for planning and anything graded, claude-haiku-5-5 for mechanical steps such as reshaping output to a schema, named in one file so switching is a one-line change.

Purchases settle over x402 V2 on Solana devnet against our own 402-gated GET /api/datasets/:id/download, so the seller's server is what demands payment and releases the rows, and the x402.org facilitator pays the network fee. The route only returns rows on a 2xx and a 2xx is what tells x402 to settle, so rows without a settled payment is not a reachable state. A negotiated price travels to the paywall as an HMAC-signed, expiring quote, so a buyer cannot present the paywall a cheaper price than the one the seller's agent actually agreed, and the paywall never charges above list. A direct USDC transfer path remains behind one environment variable as a fallback.

Four spending limits are enforced server side and never in the prompt: a per-run budget built from the request rather than module state, a cap on any single payment, a separate and lower ceiling on exclusive licences, and a seller allowlist. The per-run ledger matters because a module-level counter resets on a serverless cold start, so a budget kept there is not a limit at all. Offers made during a negotiation are put through the same limits before they are sent, so the agent can never offer more than it would be allowed to pay, and the seller's floor and counter-prices are computed in code rather than produced by a model, so neither side's language model can move the money.

Provenance is an ed25519 seller signature over the dataset identity and terms, verified synchronously before settlement rather than after; a listing whose signature does not hold is refused with a 409 before a payment is ever demanded. The agent streams newline-delimited events over POST /api/agent. The ASRP/1 race adapter sits at /agent-studio/v1/health and /agent-studio/v1/tasks.

---

## AI capabilities \*

The agent plans and acts one tool call at a time across six tools: search_catalog, get_sample, verify_provenance, check_budget, negotiate_price and purchase_dataset. It is given no listing data in its prompt, so it has to discover the market through the tools, and it re-plans when a limit refuses it. How we checked it: a real run against the brief "current UK planning application text, with an exclusive licence so competitors cannot buy it" searched the catalogue, sampled the best candidate, checked provenance, requested the exclusive licence at 0.16 USDC, was refused against the 0.05 exclusive ceiling, accepted the refusal, opened a non-exclusive negotiation at 0.03 against a 0.04 list price, was countered at 0.035 by the seller's agent, accepted, and settled at exactly 0.035 on devnet with a real signature. A second brief, for freedom of information responses, finds only a listing whose signature does not match what is being offered, refuses it, searches twice more for a sound alternative, finds none, and stops having spent nothing. The race adapter is verified separately: respond answers fresh questions correctly in about two seconds with the nonce echoed, returns 401 without the verifier token, and 400 invalid_input on a malformed task or an empty input.
