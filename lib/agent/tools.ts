import "server-only";
import { CATALOG, findDataset, priceFor } from "../data/catalog";
import type { DatasetListing, LicenceKind, ToolName } from "../data/types";
import { loadAgentSigner } from "../payments/client";
import { signatureHolds } from "../provenance/verify";
import { payUsdc } from "../payments/transfer";
import { purchaseOverX402, type DatasetPurchase } from "../paidapi/dataset";
import { applyDecision, MAX_OFFERS, openNegotiation, sellerDecide, type NegotiationState, type SellerDecision } from "./negotiation";
import { signQuote } from "./quote";
import { sellerMessage } from "./seller";

// The product agent's tools. These run in process against the seeded catalogue; only
// purchase_dataset touches the chain.
//
// purchase_dataset settles over x402 against our own 402-gated /api/datasets/:id/download, so
// the seller's server is what demands payment and releases the rows, and the facilitator pays
// the network fee. DATAHUNTER_SETTLEMENT=direct switches to a direct devnet USDC transfer to
// the seller's wallet instead, which is the same money on the same network but needs devnet SOL
// in our wallet for the fee. Both rails return a real signature or an honest failure.

// ---------------------------------------------------------------------------
// The four limits, enforced here and never by the model
// ---------------------------------------------------------------------------

export interface RunLedger {
  /** Total the agent may spend on this run. Comes from the request, not from the process. */
  budgetUsdc: number;
  spentUsdc: number;
  /** Largest single payment allowed. */
  maxPaymentUsdc: number;
  /** Separate and lower ceiling for an exclusive licence, where one call can burn the budget. */
  maxExclusiveUsdc: number;
  /** Seller wallets the agent may pay. Empty means any seller that passes provenance. */
  allowedSellers: string[];
  purchased: { datasetId: string; licenceKind: LicenceKind; amountUsdc: number; signature: string }[];
  /** Open negotiations, keyed by `${datasetId}:${licenceKind}`. Holds the seller's floor: never print it. */
  negotiations: Record<string, NegotiationState>;
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * A fresh ledger per run. Deliberately not module state: on serverless hosting a cold start
 * would reset a module-level counter, so a budget kept there is not a limit at all.
 */
export function newLedger(budgetUsdc: number): RunLedger {
  return {
    budgetUsdc,
    spentUsdc: 0,
    maxPaymentUsdc: envNumber("MAX_PAYMENT_USD", 0.1),
    maxExclusiveUsdc: envNumber("MAX_EXCLUSIVE_USD", 0.05),
    allowedSellers: (process.env.ALLOWED_SELLERS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    purchased: [],
    negotiations: {},
  };
}

export type ProvenanceStatus = "verified" | "pending" | "tampered" | "unsigned";

/**
 * Honest about what we actually know. `verified` means an ed25519 signature by the seller's
 * own wallet was checked against this listing and held. `pending` means the seller is named
 * but has issued no signature yet. `tampered` means a signature exists and does not match
 * the listing being offered, so something changed after the seller signed it. `unsigned`
 * means the listing claims no seller identity at all.
 *
 * Only `verified` is safe to buy, and that judgement lives here rather than in the prompt so
 * the model cannot talk its way past it.
 */
export function provenanceOf(dataset: DatasetListing): { status: ProvenanceStatus; detail: string } {
  if (!dataset.provenance.signedBy) {
    return { status: "unsigned", detail: "No seller identity and no signature. Origin of the rows is unstated." };
  }
  if (!dataset.provenance.signature) {
    return { status: "pending", detail: `Seller ${dataset.provenance.signedBy} is named but has issued no signature yet.` };
  }
  if (!signatureHolds(dataset)) {
    return {
      status: "tampered",
      detail: `${dataset.provenance.signedBy} signed this listing, but the signature does not match what is being offered. The listing was changed after it was signed.`,
    };
  }
  return { status: "verified", detail: `Signature from ${dataset.provenance.signedBy} checks out against the listing.` };
}

export interface BudgetVerdict {
  allowed: boolean;
  reason: string;
  priceUsdc: number;
}

/**
 * Checks a price against the four limits. Without `priceUsdc` it checks the price agreed with the
 * seller, or the list price if nothing is agreed yet. Offers go through this too, so the buyer can
 * never offer more than it would be allowed to pay.
 */
export function checkBudget(ledger: RunLedger, datasetId: string, licenceKind: LicenceKind, priceUsdc?: number): BudgetVerdict {
  const dataset = findDataset(datasetId);
  if (!dataset) return { allowed: false, reason: `No dataset with id ${datasetId}.`, priceUsdc: 0 };

  priceUsdc ??= agreedPrice(ledger, datasetId, licenceKind) ?? priceFor(dataset, licenceKind);
  const remaining = ledger.budgetUsdc - ledger.spentUsdc;

  if (licenceKind === "exclusive" && priceUsdc > ledger.maxExclusiveUsdc) {
    return {
      allowed: false,
      priceUsdc,
      reason: `An exclusive licence at ${priceUsdc} USDC is over the ${ledger.maxExclusiveUsdc} ceiling for exclusive purchases. A non-exclusive licence for this dataset costs ${dataset.priceUsdc}.`,
    };
  }
  if (priceUsdc > ledger.maxPaymentUsdc) {
    return { allowed: false, priceUsdc, reason: `${priceUsdc} USDC is over the ${ledger.maxPaymentUsdc} limit on any single payment.` };
  }
  if (priceUsdc > remaining) {
    return { allowed: false, priceUsdc, reason: `${priceUsdc} USDC is more than the ${remaining.toFixed(3)} left of this run's budget.` };
  }
  if (ledger.allowedSellers.length > 0 && !ledger.allowedSellers.includes(dataset.seller.wallet)) {
    return { allowed: false, priceUsdc, reason: `${dataset.seller.name} is not on the seller allowlist for this run.` };
  }
  const provenance = provenanceOf(dataset);
  if (provenance.status !== "verified") {
    return { allowed: false, priceUsdc, reason: `Provenance check failed. ${provenance.detail}` };
  }
  return { allowed: true, priceUsdc, reason: `Within all four limits. ${provenance.detail}` };
}

// ---------------------------------------------------------------------------
// Negotiation: every purchase needs a price agreed with the seller's agent first
// ---------------------------------------------------------------------------

const negotiationKey = (datasetId: string, licenceKind: LicenceKind) => `${datasetId}:${licenceKind}`;

export function agreedPrice(ledger: RunLedger, datasetId: string, licenceKind: LicenceKind): number | null {
  return ledger.negotiations[negotiationKey(datasetId, licenceKind)]?.agreedUsdc ?? null;
}

/** The verdict a purchase is held to: an agreed price must exist, and that price must clear the limits. */
export function purchaseVerdict(ledger: RunLedger, datasetId: string, licenceKind: LicenceKind): BudgetVerdict {
  const dataset = findDataset(datasetId);
  if (!dataset) return { allowed: false, reason: `No dataset with id ${datasetId}.`, priceUsdc: 0 };
  const agreed = agreedPrice(ledger, datasetId, licenceKind);
  if (agreed === null) {
    return {
      allowed: false,
      priceUsdc: priceFor(dataset, licenceKind),
      reason: `No price agreed with ${dataset.seller.name} for a ${licenceKind} licence yet. Negotiate with negotiate_price first.`,
    };
  }
  return checkBudget(ledger, datasetId, licenceKind, agreed);
}

export type NegotiationResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      seller: string;
      listPriceUsdc: number;
      offerUsdc: number;
      round: number;
      offersLeft: number;
      decision: SellerDecision;
      sellerMessage: string;
    };

/**
 * One round: the buyer's offer goes to the seller agent, which accepts, counters or holds.
 * The offer is checked against the spending limits before it is sent, and the seller's price
 * comes from negotiation.ts, so neither side's model can move the money.
 */
export async function negotiatePrice(
  ledger: RunLedger,
  datasetId: string,
  licenceKind: LicenceKind,
  offerUsdc: number,
  buyerMessage: string,
): Promise<NegotiationResult> {
  const dataset = findDataset(datasetId);
  if (!dataset) return { ok: false, reason: `No dataset with id ${datasetId}.` };
  if (!Number.isFinite(offerUsdc) || offerUsdc <= 0) return { ok: false, reason: "An offer must be a positive USDC amount." };

  const key = negotiationKey(datasetId, licenceKind);
  const listPriceUsdc = priceFor(dataset, licenceKind);
  const state = ledger.negotiations[key] ?? openNegotiation(datasetId, listPriceUsdc);
  if (state.agreedUsdc !== null) {
    return { ok: false, reason: `A ${licenceKind} price of ${state.agreedUsdc} USDC is already agreed for ${datasetId}. Buy it with purchase_dataset.` };
  }

  const verdict = checkBudget(ledger, datasetId, licenceKind, offerUsdc);
  if (!verdict.allowed) return { ok: false, reason: `Offer not sent. ${verdict.reason}` };

  const decision = sellerDecide(state, offerUsdc);
  const next = applyDecision(state, decision);
  ledger.negotiations[key] = next;

  return {
    ok: true,
    seller: dataset.seller.name,
    listPriceUsdc,
    offerUsdc,
    round: next.offers,
    offersLeft: Math.max(0, MAX_OFFERS - next.offers),
    decision,
    sellerMessage: await sellerMessage(dataset, licenceKind, listPriceUsdc, decision, buyerMessage),
  };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function publicView(d: DatasetListing) {
  const { status } = provenanceOf(d);
  return {
    id: d.id,
    title: d.title,
    seller: d.seller.name,
    domain: d.domain,
    rows: d.rows,
    priceUsdc: d.priceUsdc,
    exclusivePriceUsdc: d.licence.exclusivePriceUsdc,
    licenceTerms: d.licence.terms,
    freshness: d.freshness,
    sampleFields: d.sampleFields,
    provenance: status,
  };
}

export function searchCatalog(query: string, maxPriceUsdc?: number) {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const scored = CATALOG.map((d) => {
    const haystack = `${d.title} ${d.domain} ${d.sampleFields.join(" ")} ${d.licence.terms}`.toLowerCase();
    const score = terms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
    return { d, score };
  })
    .filter(({ d, score }) => score > 0 && (maxPriceUsdc === undefined || d.priceUsdc <= maxPriceUsdc))
    .sort((a, b) => b.score - a.score);

  // An empty result is a real answer, not a reason to widen the search silently.
  return (scored.length > 0 ? scored : CATALOG.map((d) => ({ d, score: 0 })).filter(({ d }) => maxPriceUsdc === undefined || d.priceUsdc <= maxPriceUsdc))
    .slice(0, 6)
    .map(({ d }) => publicView(d));
}

/** Free, so the agent can judge quality and freshness before it spends anything. */
export function getSample(datasetId: string) {
  const dataset = findDataset(datasetId);
  if (!dataset) return { error: `No dataset with id ${datasetId}.` };
  const rows = Array.from({ length: 20 }, (_, i) =>
    Object.fromEntries(dataset.sampleFields.map((f) => [f, `${f}:redacted:${i + 1}`])),
  );
  return {
    datasetId: dataset.id,
    freshness: dataset.freshness,
    rowsShown: rows.length,
    totalRows: dataset.rows,
    fields: dataset.sampleFields,
    rows,
    note: "Values are redacted in the free sample. Field names, freshness and row count are real.",
  };
}

export function verifyProvenance(datasetId: string) {
  const dataset = findDataset(datasetId);
  if (!dataset) return { error: `No dataset with id ${datasetId}.` };
  const { status, detail } = provenanceOf(dataset);
  return { datasetId: dataset.id, seller: dataset.seller.name, status, detail, safeToBuy: status !== "unsigned" };
}

export interface PurchaseResult {
  ok: boolean;
  datasetId: string;
  licenceKind: LicenceKind;
  amountUsdc: number;
  signature?: string;
  explorerUrl?: string;
  rows?: number;
  reason?: string;
  /** Which rail settled this, so the console can say so rather than implying one. */
  rail?: SettlementRail;
  /** The address the money landed in, and whether that is the seller's own wallet. */
  paidTo?: string;
  paidToIsSeller?: boolean;
}

export type SettlementRail = "x402" | "direct";

/** x402 unless told otherwise, because it settles without devnet SOL in our wallet. */
export function settlementRail(): SettlementRail {
  return process.env.DATAHUNTER_SETTLEMENT?.trim() === "direct" ? "direct" : "x402";
}

/** The direct rail: we sign the transfer ourselves and pay the network fee, so it needs SOL. */
async function settleDirect(dataset: DatasetListing, licenceKind: LicenceKind, amountUsdc: number): Promise<DatasetPurchase> {
  const { signature } = await payUsdc(await loadAgentSigner(), {
    to: dataset.seller.wallet,
    amountUsdc,
    memo: `datahunter:${dataset.id}:${licenceKind}:${amountUsdc}`,
  });
  return { ok: true, amountUsdc, signature, rows: dataset.rows, paidTo: dataset.seller.wallet, paidToIsSeller: true };
}

/**
 * Settles a purchase and returns the rows. Never returns rows without a real signature,
 * and never invents one: a failed settlement comes back as ok: false with the reason.
 */
export async function purchaseDataset(ledger: RunLedger, datasetId: string, licenceKind: LicenceKind): Promise<PurchaseResult> {
  const dataset = findDataset(datasetId);
  if (!dataset) return { ok: false, datasetId, licenceKind, amountUsdc: 0, reason: `No dataset with id ${datasetId}.` };

  const verdict = purchaseVerdict(ledger, datasetId, licenceKind);
  if (!verdict.allowed) {
    return { ok: false, datasetId, licenceKind, amountUsdc: verdict.priceUsdc, reason: verdict.reason };
  }

  const rail = settlementRail();
  try {
    const settled = rail === "direct"
      ? await settleDirect(dataset, licenceKind, verdict.priceUsdc)
      : await purchaseOverX402({
          datasetId: dataset.id,
          licenceKind,
          priceUsdc: verdict.priceUsdc,
          remainingUsdc: ledger.budgetUsdc - ledger.spentUsdc,
          quote: signQuote({ datasetId: dataset.id, licenceKind, priceUsdc: verdict.priceUsdc }),
        });

    if (!settled.ok || !settled.signature) {
      return { ok: false, datasetId: dataset.id, licenceKind, amountUsdc: verdict.priceUsdc, rail, reason: settled.reason ?? "Payment did not settle." };
    }

    ledger.spentUsdc += verdict.priceUsdc;
    ledger.purchased.push({ datasetId: dataset.id, licenceKind, amountUsdc: verdict.priceUsdc, signature: settled.signature });
    return {
      ok: true,
      datasetId: dataset.id,
      licenceKind,
      amountUsdc: verdict.priceUsdc,
      signature: settled.signature,
      explorerUrl: `https://explorer.solana.com/tx/${settled.signature}?cluster=devnet`,
      rows: settled.rows ?? dataset.rows,
      rail,
      paidTo: settled.paidTo,
      paidToIsSeller: settled.paidToIsSeller,
    };
  } catch (err) {
    return {
      ok: false,
      datasetId: dataset.id,
      licenceKind,
      amountUsdc: verdict.priceUsdc,
      rail,
      reason: `Settlement failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** What the model is told it can do. Descriptions are the prompt, so they matter. */
export const TOOL_CATALOGUE: { name: ToolName; description: string; args: string }[] = [
  { name: "search_catalog", description: "Find candidate datasets by topic. Returns price, licence terms, freshness and provenance status.", args: '{ "query": string, "maxPriceUsdc"?: number }' },
  { name: "get_sample", description: "Free preview of 20 redacted rows, with real field names, freshness and row count. Use it before paying.", args: '{ "datasetId": string }' },
  { name: "verify_provenance", description: "Check whether the seller's identity and signature hold up. Never buy a dataset this reports as unsigned.", args: '{ "datasetId": string }' },
  { name: "check_budget", description: "Ask the spending limits whether a purchase is permitted. Cheaper than being refused mid-payment.", args: '{ "datasetId": string, "licenceKind": "non-exclusive" | "exclusive" }' },
  { name: "negotiate_price", description: "Make the seller's agent an offer for a dataset and licence. It accepts, counters or holds. An accepted offer is binding and becomes the price purchase_dataset pays. Offers are checked against your spending limits before they are sent.", args: '{ "datasetId": string, "licenceKind": "non-exclusive" | "exclusive", "offerUsdc": number, "message": string }' },
  { name: "purchase_dataset", description: "Pay the agreed price for a dataset in devnet USDC and receive the rows. Refused until a price is agreed with negotiate_price. An exclusive licence costs several times more and locks every other buyer out.", args: '{ "datasetId": string, "licenceKind": "non-exclusive" | "exclusive" }' },
];
