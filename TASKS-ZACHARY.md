# Zachary: interface and front end

Read `CLAUDE.md` first if you have not. It has the scoring, the contracts and the file
ownership map. This file is only your queue.

Your paths, which nobody else touches: `app/market/`, `app/console/`, `components/` and
`app/globals.css`.

```bash
git clone https://github.com/shahman21/datahunter.git
cd datahunter && npm install && npm run dev
```

You need no API key and no wallet. The backend is live and returns real data.

## The one thing that matters

**The agent console is the demo.** At 18:30 the room watches a stream of events go past and
either understands the product in forty seconds or does not. The marketplace page is
supporting cast. If you only finish one thing, finish the console.

It has to read from the back of Keynes Hall on a projector. Large type, high contrast, no
thin grey text on white, nothing that needs leaning in to read. Assume the resolution is
worse than your laptop and the room is bright.

## Screen 1: the console, at `app/console/`

A box for the brief, a box for the budget, a Run button, and a live feed underneath.

`POST /api/agent` with `{ goal, budgetUsdc }` streams newline-delimited JSON. One
`AgentEvent` per line, exactly as `lib/data/types.ts` declares. Import the type from there
and never redeclare it.

```ts
import type { AgentEvent } from "@/lib/data/types";

async function run(goal: string, budgetUsdc: number, onEvent: (e: AgentEvent) => void) {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ goal, budgetUsdc }),
  });
  if (!res.body) throw new Error("no stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";            // keep the partial line for the next chunk
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as AgentEvent);
    }
  }
}
```

The partial-line handling is the bit people get wrong. A chunk can arrive split mid-JSON, so
always hold the last fragment back.

The nine event types and how each should look:

| `type` | What it means | Treatment |
|---|---|---|
| `thought` | A status line from the agent | Plain line, muted |
| `tool_call` | It is about to call a tool | Show the tool name prominently and the args small |
| `tool_result` | What came back | The `summary` string is written to be read aloud, so show it in full |
| `payment_required` | A price has been quoted | Start of a payment, visually distinct |
| `payment_sent` | Settled, with a real signature | **Link the signature** to `https://explorer.solana.com/tx/<sig>?cluster=devnet` |
| `data_delivered` | Rows handed over | Show the row count and the licence kind |
| `blocked` | A limit refused it | **This is the most important event on the screen.** See below |
| `done` | Finished | The `summary` is long and worth reading, give it room |

## Make `blocked` the loudest thing on the page

Everyone in that room can picture a marketplace. What they cannot picture, and are quietly
worried about, is handing a wallet to a model. The beat that wins it is the agent asking to
spend and being told no.

A real run right now produces this, in order:

1. searches, finds three candidates
2. pulls the free sample on `ds-001`
3. checks provenance
4. asks for the exclusive licence the brief wanted, at 0.16 USDC
5. **`blocked`: over the 0.05 ceiling for exclusive purchases**
6. accepts it, re-checks, is allowed at 0.04
7. pays

Step 5 should be impossible to miss. Not a red toast that fades. Something that stays on
screen and is still readable when the judge looks back at it thirty seconds later.

Try it yourself with this brief, which is the one we will demo:

> We need current UK planning application text to train a land-use model, and we want an
> exclusive licence on the best source so competitors cannot buy it.

Budget `0.2`.

Note: the final payment currently fails with a settlement error, because Luca has not funded
the devnet wallet yet. That is expected and honest. Build the `payment_sent` and
`data_delivered` states anyway, and show the failure truthfully in the meantime. **Never
render a fake signature or a fake receipt, not even as placeholder text.** That rule is
absolute and it is in `CLAUDE.md`.

## Screen 2: the marketplace, at `app/market/`

`GET /api/datasets` does not exist yet, it is on Luca's queue. Until then import the
catalogue directly, which is simpler and works now:

```ts
import { CATALOG } from "@/lib/data/catalog";
```

Nine listings. Each card should show the title, the seller, the row count, the price, the
**exclusive price next to it** so the multiple is visible, the licence terms in plain words,
the freshness date, and the provenance state.

Provenance has three states and they must look different, because the distinction is the
product:

- `verified`, a signature was checked and holds
- `pending`, the seller is named but has not signed yet. Every legitimate listing is here
  until Luca's signing lands
- `unsigned`, no seller identity at all. `ds-007` is deliberately like this. It should look
  wrong on the page

Use `provenanceOf` from `lib/agent/tools.ts` to get the state rather than working it out from
the raw fields.

`ds-009` is deliberately three years stale. Showing freshness clearly is what makes a judge
notice the agent was right to reject it.

## Done looks like

- the console runs the demo brief and streams it legibly on a projector
- `blocked` is unmissable
- a settled payment links to the real devnet explorer
- the marketplace shows nine cards with price, exclusive price, licence, freshness and
  provenance state
- it works at 1280 wide, which is what the projector will be

No mobile layout, no auth, no dark mode toggle, no animation that delays information
appearing. Those are explicitly non-goals in `CLAUDE.md`.

## By 17:30

Record a run of the console as a video and keep it locally. The venue wifi will be carrying
154 people at 18:30 and a live failure then costs more than the recording saves.
