"use client";

import { useRef, useState } from "react";
import type { AgentEvent, NegotiationAction } from "@/lib/data/types";

// Reads the newline-delimited AgentEvent stream from POST /api/agent and shows it as it
// arrives. Nothing here invents an event: every row on screen came off the wire, and a
// payment only ever shows a signature the server actually settled.

const EXPLORER = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

const LABELS: Record<AgentEvent["type"], string> = {
  thought: "Thinking",
  tool_call: "Calling",
  tool_result: "Result",
  payment_required: "Payment required",
  payment_sent: "Paid",
  data_delivered: "Delivered",
  offer: "Offer",
  deal: "Deal",
  blocked: "Refused",
  done: "Done",
};

function eventBody(event: AgentEvent) {
  switch (event.type) {
    case "thought":
      return event.text;
    case "tool_call":
      return `${event.name}(${JSON.stringify(event.args)})`;
    case "tool_result":
      return `${event.name} → ${event.summary}`;
    case "payment_required":
      return `${event.datasetId} · ${event.priceUsdc} USDC · ${event.licenceKind} · ${event.network}`;
    case "payment_sent":
      return `${event.amountUsdc} USDC for ${event.datasetId}`;
    case "data_delivered":
      return `${event.datasetId} · ${event.rows.toLocaleString("en-GB")} rows · ${event.licenceKind}`;
    case "offer":
      return event.message;
    case "deal":
      return `${event.priceUsdc} USDC with ${event.seller} for ${event.datasetId} · ${event.licenceKind} · list ${event.listPriceUsdc}${savedPercent(event.priceUsdc, event.listPriceUsdc)}`;
    case "blocked":
      return event.reason;
    case "done":
      return event.summary;
  }
}

const ACTION_LABELS: Record<NegotiationAction, string> = {
  offer: "Offers",
  counter: "Counters",
  accept: "Accepts",
  reject: "Holds",
};

function savedPercent(price: number, list: number): string {
  const saved = Math.round((1 - price / list) * 100);
  return saved > 0 ? ` · ${saved}% below list` : "";
}

/** The negotiate_price call and result are shown as the offer thread instead, so the raw rows are hidden. */
function shownInFeed(event: AgentEvent): boolean {
  return !((event.type === "tool_call" || event.type === "tool_result") && event.name === "negotiate_price");
}

function OfferBubble({ event }: { event: Extract<AgentEvent, { type: "offer" }> }) {
  return (
    <article className={`feed-row feed-row--offer feed-row--offer-${event.from}`}>
      <div className={`bubble bubble--${event.from} bubble--${event.action}`}>
        <span className="feed-label">
          {event.speaker} · {ACTION_LABELS[event.action]} · round {event.round}
        </span>
        <p className="bubble-price">
          <strong>{event.priceUsdc} USDC</strong>
          {event.priceUsdc !== event.listPriceUsdc ? <s>{event.listPriceUsdc}</s> : null}
          <span className="bubble-meta">
            {event.datasetId} · {event.licenceKind}
          </span>
        </p>
        <p className="feed-body">{event.message}</p>
      </div>
    </article>
  );
}

export default function Console() {
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("0.20");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  async function run() {
    const budgetUsdc = Number(budget);
    if (!goal.trim() || !Number.isFinite(budgetUsdc) || budgetUsdc <= 0) return;

    setRunning(true);
    setError(null);
    setEvents([]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: goal.trim(), budgetUsdc }),
      });

      if (!res.ok || !res.body) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `The agent could not be started (HTTP ${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // The stream is one JSON object per line. Keep the trailing partial line in the
      // buffer until its newline arrives, or a split chunk would be dropped.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as AgentEvent;
            setEvents((prev) => [...prev, event]);
            queueMicrotask(() => feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }));
          } catch {
            // A half-written line is not an error worth showing; the next chunk completes it.
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const finished = events.some((e) => e.type === "done");
  const status = running ? "Running" : finished ? "Finished" : events.length ? "Stopped" : "Not started";

  return (
    <div className="workspace">
      <header className="workspace-heading">
        <h1>Find the data you need.</h1>
        <p>Give your agent a brief and a budget.</p>
      </header>

      <section className="brief-panel" aria-label="Agent brief">
        <label htmlFor="goal">What are you looking for?</label>
        <textarea
          id="goal"
          name="goal"
          rows={5}
          placeholder="Describe the data you need and how you plan to use it…"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          disabled={running}
        />
        <div className="brief-controls">
          <div className="budget-field">
            <label htmlFor="budget">Budget</label>
            <div className="budget-input">
              <input
                id="budget"
                name="budget"
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                disabled={running}
                aria-describedby="budget-unit"
              />
              <span id="budget-unit">USDC</span>
            </div>
          </div>
          <button
            className="btn btn--primary"
            type="button"
            onClick={run}
            disabled={running || !goal.trim()}
          >
            {running ? "Running…" : "Run agent"} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </section>

      {error ? (
        <p className="run-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="activity-panel" aria-labelledby="activity-title">
        <div className="activity-heading">
          <h2 id="activity-title">Activity</h2>
          <span>{status}</span>
        </div>

        {events.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-symbol" aria-hidden="true">↳</span>
            <p>Your agent’s progress will appear here.</p>
          </div>
        ) : (
          <div className="feed" ref={feedRef} aria-live="polite">
            {events.map((event, i) =>
              !shownInFeed(event) ? null : event.type === "offer" ? (
                <OfferBubble event={event} key={i} />
              ) : (
                <article className={`feed-row feed-row--${event.type}`} key={i}>
                  <span className="feed-label">{LABELS[event.type]}</span>
                  <p className="feed-body">{eventBody(event)}</p>
                  {event.type === "payment_sent" ? (
                    <a className="feed-link" href={EXPLORER(event.signature)} target="_blank" rel="noreferrer">
                      View on Solana devnet explorer ↗
                    </a>
                  ) : null}
                </article>
              ),
            )}
            {running ? <p className="feed-waiting">Working…</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
