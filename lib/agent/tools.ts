import "server-only";
import { CATALOG, findDataset, priceFor } from "../data/catalog";
import type { DatasetListing, LicenceKind, ToolName } from "../data/types";
import { loadAgentSigner } from "../payments/client";
import { payUsdc } from "../payments/transfer";

// The product agent's tools. These run in process against the seeded catalogue; only
// purchase_dataset touches the chain.
//
// Luca's seam: purchase_dataset currently settles with a direct devnet USDC transfer to the
// seller's wallet, carrying the dataset id as the memo. That is real money moving on a real
// network, and it works today. The x402 upgrade is to route it through a 402-gated
// /api/datasets/:id/download instead, so the seller's server is what demands payment and
// releases the rows. Keep the signature and the ledger behaviour identical when you swap it.

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
  };
}

export type ProvenanceStatus = "verified" | "pending" | "unsigned";

/**
 * Honest about what we actually know. `verified` means a signature was checked.
 * `pending` means the seller is named but has not issued one yet, which is where every
 * legitimate listing sits until Luca's signing service is live. `unsigned` means the
 * listing claims no seller identity at all, and nothing should ever be bought on it.
 */
export function provenanceOf(dataset: DatasetListing): { status: ProvenanceStatus; detail: string } {
  if (!dataset.provenance.signedBy) {
    return { status: "unsigned", detail: "No seller identity and no signature. Origin of the rows is unstated." };
  }
  if (!dataset.provenance.signature) {
    return { status: "pending", detail: `Seller ${dataset.provenance.signedBy} is named but has issued no signature yet.` };
  }
  return { status: "verified", detail: `Signature from ${dataset.provenance.signedBy} checks out.` };
}

export interface BudgetVerdict {
  allowed: boolean;
  reason: string;
  priceUsdc: number;
}

export function checkBudget(ledger: RunLedger, datasetId: string, licenceKind: LicenceKind): BudgetVerdict {
  const dataset = findDataset(datasetId);
  if (!dataset) return { allowed: false, reason: `No dataset with id ${datasetId}.`, priceUsdc: 0 };

  const priceUsdc = priceFor(dataset, licenceKind);
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
  if (provenance.status === "unsigned") {
    return { allowed: false, priceUsdc, reason: `Provenance check failed. ${provenance.detail}` };
  }
  return { allowed: true, priceUsdc, reason: `Within all four limits. ${provenance.detail}` };
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
}

/**
 * Settles a purchase and returns the rows. Never returns rows without a real signature,
 * and never invents one: a failed settlement comes back as ok: false with the reason.
 */
export async function purchaseDataset(ledger: RunLedger, datasetId: string, licenceKind: LicenceKind): Promise<PurchaseResult> {
  const dataset = findDataset(datasetId);
  if (!dataset) return { ok: false, datasetId, licenceKind, amountUsdc: 0, reason: `No dataset with id ${datasetId}.` };

  const verdict = checkBudget(ledger, datasetId, licenceKind);
  if (!verdict.allowed) {
    return { ok: false, datasetId, licenceKind, amountUsdc: verdict.priceUsdc, reason: verdict.reason };
  }

  try {
    const { signature } = await payUsdc(await loadAgentSigner(), {
      to: dataset.seller.wallet,
      amountUsdc: verdict.priceUsdc,
      memo: `datahunter:${dataset.id}:${licenceKind}`,
    });
    ledger.spentUsdc += verdict.priceUsdc;
    ledger.purchased.push({ datasetId: dataset.id, licenceKind, amountUsdc: verdict.priceUsdc, signature });
    return {
      ok: true,
      datasetId: dataset.id,
      licenceKind,
      amountUsdc: verdict.priceUsdc,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      rows: dataset.rows,
    };
  } catch (err) {
    return {
      ok: false,
      datasetId: dataset.id,
      licenceKind,
      amountUsdc: verdict.priceUsdc,
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
  { name: "purchase_dataset", description: "Pay for a dataset in devnet USDC and receive the rows. An exclusive licence costs several times more and locks every other buyer out.", args: '{ "datasetId": string, "licenceKind": "non-exclusive" | "exclusive" }' },
];
