# DataHunter

An agent-to-agent data marketplace. Buyer agents acting for a company go out, find the
datasets that company needs, check the licence and the provenance, pay for them per
download, and bring the rows back. Seller agents list data, price it, and get paid the
moment it is delivered. The point is that a company training a model can send an agent
out with a budget and a brief instead of spending six weeks on procurement.

The payment is not a feature bolted on to win points. Paying per dataset is the product.
That is the whole pitch and every judging answer should come back to it.

What we are not building is an agent that buys a thing. The Agent Studio Playground already
simulates that, so a demo of a successful purchase looks like the sample app with a skin on
it. The interesting half is an agent with a wallet being told no: provenance that fails
verification, a budget cap that holds, a seller that is not on the allowlist, an exclusive
licence that costs more than the brief justifies. Build the refusals as carefully as the
purchases.

## Context for anyone picking this up cold

Oxford and Cambridge AI Race, King's College Cambridge, Sunday 25 October 2026. Build
sprint runs to 18:30, pitches and judging from 18:30 to 19:45. Three of us: Aditya, Luca,
Zachary. Work started around 13:00, so treat every deadline below as real.

Two things are being judged separately and neither affects the other.

1. The Build Track, submitted through the Agent Studio site between 11:30 and 18:30.
2. The AI Race, a live points leaderboard at https://superteam-agent-studio.vercel.app/race

Leaving the race does not affect the track submission. Nobody is eliminated. Steps can be
cleared in any order and points land as soon as a check passes.

## The scoreboard, and what clears each line

Read this twice, because it is counter-intuitive. The race does not look at our product.
It calls two endpoints on our public URL and grades the replies. Points come from the
adapter described in the next section, not from the marketplace. 1300 from the build
stages, 350 more from optional challenges.

| Step | Points | What actually clears it | Owner |
|---|---|---|---|
| Idea locked in | 50 | Read from the platform. Submit draft has a title and a problem statement | Aditya |
| App live | 150 | `GET /agent-studio/v1/health` answers at our public URL with our verifier token | Aditya |
| AI feature working | 200 | `respond` tasks answered correctly, fresh questions, nonce echoed | Aditya |
| Agent uses tools | 300 | `use_tools`, with calls the platform's tool service recorded, answer computed from their results | Aditya |
| On-chain payment | 400 | `run_workflow`. Real devnet USDC transfer of at least the amount, to the address, with the memo from the task. Return `{ "signature" }` | Luca |
| Submitted | 200 | Read from the platform. Final submission on the Submit page | Aditya |
| Operation: found it, exact, verified | 30, 50, 70 | Optional, devnet, strictly in order | Luca, only once the 400 has landed |
| Minesweeper: minted, presented, fast hands | 90, 80, 30 | Optional, devnet, strictly in order | Luca, only once the 400 has landed |

Note what is not on this list. Nothing requires our own tools, our own 402 route, our
catalog or a single pixel of interface. Zachary's work and Luca's x402 work earn no race
points at all. They win the Build Track, which is judged separately. Do not let anyone
conflate the two or we will spend the afternoon polishing a screen no verifier will load.

As of 12:26 one team, Hyrix, had cleared all six build stages, and only six teams had
entered. Clearing 1300 is table stakes. The pitch is what wins the room.

## The race adapter, which is where the points live

Protocol is ASRP/1. Our app exposes two endpoints, both requiring
`Authorization: Bearer <verifier token>` from our team page, and both returning 401 without
it. The URL must be public `https://`, final with no redirects, no private or local
addresses. Vercel satisfies this.

```
GET  /agent-studio/v1/health   200 { "protocol": "asrp/1", "status": "ready", "name": "datahunter" }
POST /agent-studio/v1/tasks    the envelope below
```

Request carries `nonce`, `attempt`, and a `task` with `type`, `input`, and depending on
type `schema`, `sessionId`, `tools`, `source`, `challengeToken` and `limits`.

Success, HTTP 200:

```json
{ "protocol": "asrp/1", "nonce": "<echoed>", "status": "ok",
  "output": { "text": "...", "data": {}, "toolResults": [{ "tool": "...", "result": {} }] },
  "meta": { "model": "gemini-..." } }
```

Error, HTTP 4xx or 5xx:

```json
{ "protocol": "asrp/1", "nonce": "<echoed>", "status": "error",
  "error": { "code": "invalid_input", "message": "..." } }
```

Codes and statuses: `invalid_input` 400, `unauthorized` 401, `upstream_unavailable` 503,
`upstream_timeout` 504, `limit_exceeded` 403 or 422, `internal` 500. Responses stay under
256 KB and must land within the layer's limit, usually 20 to 60 seconds.

Only three task types matter for the points race, so ignore `extract`, `converse` and
`answer_from_source` unless the organisers add those layers. That also means we need no
Redis, which saves an hour.

**`respond`** is the 200. Call Claude, answer the question, echo the nonce. Verified locally
against a fresh question in 1.5 seconds, with the nonce echoed.

**`use_tools`** is the 300. Call each `task.tools[].url` by POST with
`Authorization: Bearer <task.challengeToken>` and the tool input as JSON. The data behind
those tools is fresh per attempt and only the tools know it, and the service logs every
call. Its log is the evidence, not our `toolResults`, so a fabricated result fails
outright. A 503 means retry with short backoff. Respect `limits.maxToolCalls`.

**`run_workflow`** is the 400. Read the address, amount and memo out of the task, send at
least that much devnet USDC with that memo, return the signature. The starter's `payUsdc`
already does this. The agent wallet needs devnet SOL for fees as well as USDC.

If the platform's tool service is slow during a failed attempt, that attempt is retried
automatically and does not count against us.

## Stack, with versions pinned to what the platform has verified

Pull the starter from https://superteam-agent-studio.vercel.app/build?fw=next with Gemini,
Payments, Spending Controls and Paid API switched on. Paid API requires the other two and
the builder turns them on for you.

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4
- Node 24 is installed locally, the starter needs 20.9 or newer
- Claude for the model calls, through `@anthropic-ai/sdk` 1.3.0, on Aditya's own API credit.
  `claude-opus-5-5` for anything the verifier grades, `claude-haiku-5-5` for mechanical steps
  (reshaping to a JSON Schema, pulling fields out of an instruction). Effort stays `low`, and
  `medium` only for tool planning, because every layer has a 20 to 60 second window and
  `use_tools` chains several model calls into one request. `lib/ai/claude.ts` is the only
  place the model is named, so switching is one line. Gemini is still wired to the starter's
  own /chat demo page and needs no key for the race.
- x402 V2 2.28.0 on Solana devnet, `@x402/express` 2.28.0 if a separate service appears
- Payments are USDC on Solana devnet only, atomic amounts, scheme `exact`
- Deployed to Vercel at **https://datahunter-silk.vercel.app** (project
  `shahman21s-projects/datahunter`). Verified in production: health 200 with the token, 401
  without, 0 redirects, and a `respond` task answered correctly in 2.1 seconds. All eleven
  environment variables are set for production, preview and development. Redeploy with
  `npx vercel deploy --prod --yes --token <token>`.
- The cloudflared tunnel was the first public URL and is now the fallback, not the primary

Next.js and Node are the only two frameworks whose payment templates the platform has
verified. Python and Expo are provisional. Do not switch frameworks today.

## How the money works, in two different ways

These are not the same mechanism and confusing them has already cost us one wrong plan.

**For the race, a direct transfer.** A `run_workflow` task names an address, an amount and
a memo. We transfer devnet USDC and return the signature. No 402, no handshake, no
facilitator.

**For the product, x402.** A three step HTTP handshake the starter already implements, and
the thing judges actually watch.

1. The agent requests a paid resource and gets back `PAYMENT-REQUIRED` with the price,
   the Solana devnet CAIP-2 network id and a USDC atomic amount.
2. The agent signs and returns `PAYMENT-SIGNATURE`.
3. The facilitator at x402.org settles, pays the network fee and the server answers with
   the data plus `PAYMENT-RESPONSE`.

Rules that are not negotiable. Devnet only, never mainnet. Never fabricate a signature, a
receipt or a transaction id, not even as placeholder text in the UI: if a payment did not
settle, the UI says it did not settle. Every settled payment shows a real devnet explorer
link. `.env.local` never gets committed, only `.env.example` with empty placeholders.

## Repo layout and who owns what

Three people in one repo for five hours means collisions are the main risk, not
difficulty. Stay inside your own paths. If you need something to change in someone
else's path, ask them in person, do not edit it.

```
There is no src/ directory. The starter is flat: app/, lib/, components/, scripts/.

app/
  agent-studio/v1/      Aditya owns health, tasks and the respond and use_tools solvers.
                        Luca owns the run_workflow payment branch in lib/race/handlers.ts.
                        This is the entire scoreboard. Nobody else touches it.
  api/agent/            Aditya. POST, streams AgentEvent objects back.
  api/datasets/         Luca. The catalog route, the free sample, the 402 gated download.
  api/{premium,buy}/    Starter's x402 example. Luca may change it, nobody else.
  market/, console/     Zachary. The two screens that are the demo.
components/             Zachary. Every component, plus app/globals.css.
lib/
  data/types.ts         Aditya. The frozen contracts. Import types from here, never redeclare.
  data/catalog.ts       Aditya. Seeded listings, so Zachary is never blocked.
  agent/tools.ts        Aditya. Tool schemas and handlers for the product agent.
  agent/loop.ts         Aditya. Plan, call tools, re-plan when blocked, stop.
  ai/claude.ts          Aditya. The only file that names a model.
  race/                 Aditya, except the run_workflow branch. See above.
  payments/             Luca. x402 wiring, wallets, facilitator, settlement.
  provenance/           Luca. Seller signing and signature verification.
  spending/             Luca. The four limits, enforced server side.
scripts/                Shared. keygen, wallets, pay, test-race.
```

Commits: `feat(agent): ...`, `feat(ui): ...`, `feat(pay): ...`. Small and often. Push to
`main` directly, there is no time for review branches, but never push something that does
not build.

## The contracts, so all three of us can work at once

These two shapes are frozen as of the moment they are written. Zachary builds the whole
interface against mock data that matches them while Luca makes the payments real, and
nothing has to be rewritten when they meet.

```ts
type LicenceKind = 'non-exclusive' | 'exclusive'

type DatasetListing = {
  id: string
  title: string
  seller: { name: string; wallet: string }
  domain: string            // "uk-planning-applications", "clinical-notes", "satellite-ndvi"
  rows: number
  priceUsdc: number         // non-exclusive full download
  licence: {
    kind: 'non-exclusive' | 'exclusive'  // exclusive locks every other buyer out
    terms: string                        // plain words, shown in the UI before purchase
    exclusivePriceUsdc: number           // 3x to 5x priceUsdc, seller's price to lock it down
  }
  freshness: string         // ISO date of the newest row
  sampleFields: string[]
  provenance: { signedBy: string; signature: string | null }
}

type AgentEvent =
  | { type: 'thought';           text: string }
  | { type: 'tool_call';         name: ToolName; args: unknown }
  | { type: 'tool_result';       name: ToolName; summary: string }
  | { type: 'payment_required';  datasetId: string; priceUsdc: number; licenceKind: LicenceKind; network: 'solana-devnet' }
  | { type: 'payment_sent';      datasetId: string; signature: string; amountUsdc: number }
  | { type: 'data_delivered';    datasetId: string; rows: number; licenceKind: LicenceKind }
  | { type: 'blocked';           reason: string }
  | { type: 'done';              summary: string }
```

Routes.

- `GET /api/datasets` returns `DatasetListing[]`. Free.
- `GET /api/datasets/:id/sample` returns 20 redacted rows. Free, so the agent can judge
  quality before it spends anything.
- `GET /api/datasets/:id/download` is 402 gated. Returns the full rows after settlement.
- `POST /api/agent` takes `{ goal: string, budgetUsdc: number }` and streams `AgentEvent`.

Tools the agent is given. It must choose between them, because a hardcoded sequence will
not clear the 300 point step.

- `search_catalog(query, maxPriceUsdc)` finds candidate datasets
- `get_sample(datasetId)` pulls the free preview
- `check_budget(datasetId)` asks the spending controls whether this purchase is allowed
- `purchase_dataset(datasetId, licenceKind)` triggers the x402 flow and returns the rows.
  Choosing `exclusive` pays `exclusivePriceUsdc` instead and locks every other buyer out,
  so the agent has to argue that the brief is worth the multiple.
- `verify_provenance(datasetId)` checks the seller signature

## Spending controls, which are also the best moment in the demo

Four limits, enforced server side by Luca, never by the model: a per-run budget, a maximum
price for any single dataset, a seller allowlist, and a separate and lower ceiling on
exclusive purchases, because that is where an agent can burn a budget in one call.

The agent should hit one of these on stage. It tries to buy the expensive dataset, gets
told no by `check_budget`, says so out loud in the event stream, and goes and buys two
cheaper ones that together cover the brief. An agent with a wallet and no limits is the
thing everyone in that room is quietly worried about, and showing the limit holding is
worth more than showing a bigger number of purchases.

## Build order against the clock

Points first, polish second. Run the race verification the moment each step is plausibly
done rather than waiting for it to be tidy.

| By | What | Who |
|---|---|---|
| 13:10 | Team created on the platform, verifier token copied out of the team page | Aditya |
| 13:10 | Submit draft saved with title and problem statement, run the check, 50 points | Aditya |
| 13:25 | Starter downloaded, `npm install`, `cp .env.example .env.local`, repo pushed | Aditya |
| 13:30 | `npm run keygen -- --pay-to` then `npm run keygen`, both funded at faucet.circle.com, plus devnet SOL, `npm run wallets` showing two ticks | Luca |
| 13:45 | Health endpoint deployed to Vercel, team URL set, run the check, 150 points | Aditya |
| 14:15 | `respond` branch live on Gemini, run the check, 200 points | Aditya |
| 15:00 | `use_tools` branch calling the platform tool service for real, run the check, 300 points | Aditya |
| 15:45 | `run_workflow` transferring devnet USDC with the memo, run the check, 400 points | Luca |
| 16:00 | Final submission, run the check, 200 points. Scoreboard done at 1300 | Aditya |
| 14:00 to 17:30 | DataHunter itself, in parallel and independent of all of the above | Zachary and Luca |
| 17:30 | Interface good enough to project on a wall, recorded fallback run saved | Zachary |
| 18:00 | Pitch rehearsed out loud twice, on the real deployed app | All three |

Get all 1300 on the board before 16:00. It is a known, specified, finite job, so treat it
as plumbing and do not let it drift into the evening. Only touch the optional challenges
once the 400 has landed, and only if the product demo is already safe.

Nothing in the adapter needs the marketplace to exist, and nothing in the marketplace needs
the adapter. That is why Zachary can work the whole afternoon without ever being blocked.

## The three jobs

**Luca, security and crypto.** Two jobs and the first one is worth 400 points: the
`run_workflow` payment branch of the adapter, which reads an address, an amount and a memo
off the task and returns a real devnet signature. Get the wallets made and funded the
moment you sit down, because an unfunded wallet is the single most likely reason we finish
on 900. Then the product side: the x402 route, the facilitator, settlement, the spending
controls, and seller provenance signing and verification. You are also the person who answers the
judge who asks what stops a rogue agent draining the wallet, so build the limits in a way
you would be happy to defend.

**Zachary, interface and front end.** You own every pixel. Two screens matter. The
marketplace, where listings show price, licence, freshness and whether provenance checks
out. And the agent console, which streams `AgentEvent` live so the room watches the agent
think, get refused by the budget, pay, and come back with rows. Build against mocked
`AgentEvent` arrays from minute one and do not wait for the backend. The console is the
demo, so give it most of your time. It has to read from the back of a lecture hall, so
large type and high contrast.

**Aditya, adapter and submission.** You own the ASRP adapter, which is the scoreboard: the
two endpoints, the token check, the nonce echo, the `respond` solver and the `use_tools`
solver. You also own the seed catalog, the product agent loop, every verification run, the
submission and the pitch, and you are the one watching the clock and calling cuts. Build
the adapter first and the product second, however much the product is the more interesting
problem.

## The pitch at 18:30

Four minutes, on the deployed app, no slides until the demo has worked. Lead on the
governance of an agent that can spend, not on the marketplace. Everyone in that room can
picture a marketplace. What they cannot picture, and are quietly worried about, is handing a
wallet to a model.

1. One sentence on the problem. Training data procurement takes weeks of legal and
   commercial work, and an agent could do it in seconds if it could pay and if you could
   trust it with the money.
2. Type a real brief into the box with a real budget.
3. Let the room watch the stream. Search, free sample, provenance verified, one dataset
   refused on provenance, one exclusive licence refused as not worth the multiple, re-plan,
   payment, devnet explorer link, rows delivered.
4. Land it on the two things the refusals prove. The spend is bounded by limits the model
   cannot talk its way past, and every purchase leaves an audit trail with a verified seller
   and a licence attached.
5. Why this needs a chain at all. Machine speed settlement, per call amounts far below a
   card minimum, no invoice, no human in the loop, and a seller who does not have to trust
   the buyer.

Have a recorded run saved locally as a fallback. The venue wifi will be under load from
every other team and a live failure at 18:30 costs more than it saves.

## The three questions a judge will ask, and the answers

**If anyone can buy it, how is it a moat?** It is not, at non-exclusive prices, and that is
why exclusivity is priced separately. The moat is either an exclusive licence the agent
decided was worth the multiple, or the particular combination of datasets it assembled and
verified. Do not claim a moat for rows anyone can buy on Monday.

**Where does the data actually come from?** Seeded sellers, and say so without being
prompted. Supply is not the claim. The claim is the settlement and verification rail
underneath it, and a seeded catalog exercises that rail exactly as a real one would.

**What stops a rogue agent draining the wallet?** The four server side limits, none of which
live in the prompt, plus the fact that the room just watched two of them hold. Luca answers
this one.

## Non-goals for today

No real datasets, no mainnet, no accounts or auth, no seller onboarding flow, no
persistence beyond what the demo needs, no mobile layout. A believable seeded catalog
beats a real but empty one. If someone suggests scope beyond this list, the answer is
after the pitch.
