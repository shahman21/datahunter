// Offline tests for buyer–seller negotiation. Run: npm run test:negotiation
// With no ANTHROPIC_API_KEY the seller's reply falls back to its template, so nothing here needs the network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDecision, MAX_OFFERS, openNegotiation, sellerDecide, type NegotiationState } from "../lib/agent/negotiation";
import { readQuote, signQuote } from "../lib/agent/quote";
import { checkBudget, negotiatePrice, newLedger, purchaseVerdict } from "../lib/agent/tools";

delete process.env.ANTHROPIC_API_KEY;
process.env.DATAHUNTER_QUOTE_SECRET = "test-only-secret";

function haggle(state: NegotiationState, offers: number[]) {
  const decisions = [];
  for (const offer of offers) {
    const d = sellerDecide(state, offer);
    decisions.push(d);
    state = applyDecision(state, d);
  }
  return { state, decisions };
}

test("the floor sits below list and is never undercut", () => {
  const s = openNegotiation("ds-001", 0.04);
  assert.equal(s.floorUsdc, 0.03);
  for (const offers of [[0.001, 0.001, 0.001], [0.02, 0.025, 0.029], [0.01, 0.03, 0.03]]) {
    for (const d of haggle(s, offers).decisions) {
      assert.ok(d.priceUsdc >= s.floorUsdc, `${d.action} at ${d.priceUsdc} is under the floor`);
      assert.ok(d.priceUsdc <= 0.04, `${d.action} at ${d.priceUsdc} is over list`);
    }
  }
});

test("an offer at or above the ask is accepted at the ask, never more", () => {
  const s = openNegotiation("ds-001", 0.04);
  assert.deepEqual(sellerDecide(s, 0.04), { action: "accept", priceUsdc: 0.04, final: true });
  assert.deepEqual(sellerDecide(s, 0.09), { action: "accept", priceUsdc: 0.04, final: true });
});

test("a low opening gets a counter between offer and ask", () => {
  const d = sellerDecide(openNegotiation("ds-001", 0.04), 0.02);
  assert.equal(d.action, "counter");
  assert.equal(d.priceUsdc, 0.03);
});

test("a fair offer is accepted at the offer", () => {
  const s = openNegotiation("ds-002", 0.09);
  const d = sellerDecide(s, 0.085);
  assert.deepEqual(d, { action: "accept", priceUsdc: 0.085, final: true });
});

test("the last offer below the floor gets a best and final counter at the floor, then the ask stands", () => {
  const s = openNegotiation("ds-001", 0.16);
  const { state, decisions } = haggle(s, [0.05, 0.05, 0.05]);
  const last = decisions.at(-1)!;
  assert.equal(decisions.length, MAX_OFFERS);
  assert.deepEqual(last, { action: "counter", priceUsdc: s.floorUsdc, final: true });
  assert.equal(sellerDecide(state, 0.05).action, "reject");
  assert.equal(sellerDecide(state, s.floorUsdc).action, "accept");
});

test("purchases are refused until a price is agreed", () => {
  const ledger = newLedger(0.2);
  const verdict = purchaseVerdict(ledger, "ds-001", "non-exclusive");
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /negotiate_price/);
});

test("an agreed price is what the purchase is checked and paid at", async () => {
  const ledger = newLedger(0.2);
  const r = await negotiatePrice(ledger, "ds-001", "non-exclusive", 0.037, "Fresh to last week, fits the brief.");
  assert.ok(r.ok);
  assert.equal(r.decision.action, "accept");
  assert.equal(r.sellerMessage.includes("0.037"), true);
  const verdict = purchaseVerdict(ledger, "ds-001", "non-exclusive");
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.priceUsdc, 0.037);
});

test("an offer the limits would refuse is never sent", async () => {
  const ledger = newLedger(0.2);
  const r = await negotiatePrice(ledger, "ds-001", "exclusive", 0.12, "Need it locked down.");
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /Offer not sent/);
  assert.equal(ledger.negotiations["ds-001:exclusive"], undefined);
});

test("an exclusive licence still cannot be haggled under the exclusive ceiling if its floor is above it", async () => {
  const ledger = newLedger(0.2);
  for (const offer of [0.05, 0.05, 0.05]) await negotiatePrice(ledger, "ds-001", "exclusive", offer, "");
  const ask = ledger.negotiations["ds-001:exclusive"].askUsdc;
  assert.ok(ask > ledger.maxExclusiveUsdc);
  assert.equal(checkBudget(ledger, "ds-001", "exclusive", ask).allowed, false);
  assert.equal(purchaseVerdict(ledger, "ds-001", "exclusive").allowed, false);
});

test("an unsigned seller cannot even be negotiated with", async () => {
  const r = await negotiatePrice(newLedger(0.2), "ds-007", "non-exclusive", 0.01, "");
  assert.equal(r.ok, false);
});

test("a signed quote reads back, and a forged or expired one does not", () => {
  const token = signQuote({ datasetId: "ds-001", licenceKind: "non-exclusive", priceUsdc: 0.03 }, 1_000);
  assert.equal(readQuote(token, 2_000)?.priceUsdc, 0.03);
  assert.equal(readQuote(token, 1_000 + 11 * 60_000), null);

  const [payload, mac] = token.split(".");
  const cheaper = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), priceUsdc: 0.001 })).toString("base64url");
  assert.equal(readQuote(`${cheaper}.${mac}`, 2_000), null);
  assert.equal(readQuote("not-a-quote", 2_000), null);
});
