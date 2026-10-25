import "server-only";
import {
  createPaymentClient,
  createPayingFetch,
  loadAgentSigner,
  readPaymentError,
  readPaymentReceipt,
} from "@/lib/payments/client";
import { attachSpendingLimits } from "@/lib/spending/attach";
import { SpendingTracker } from "@/lib/spending/tracker";
import type { LicenceKind } from "@/lib/data/types";

// Buying a dataset over x402, which is the product's settlement rail.
//
// Why this exists alongside buyer.ts: buyer.ts keeps one SpendingTracker for the whole server
// process, which is right for a paid API the process calls on its own account, and wrong for an
// agent run. A run's budget comes from the brief, so the tracker here is built per purchase from
// the run's own remaining budget. The tracker is the second limit, not the first: the agent's
// ledger has already refused anything out of bounds before we get here. Two layers, both
// outside the model.
//
// The facilitator pays the network fee, so this path settles even with no SOL in our wallet.

export interface DatasetPurchase {
  ok: boolean;
  amountUsdc: number;
  /** The devnet transaction signature, straight off the settlement receipt. Never synthesised. */
  signature?: string;
  rows?: number;
  delivered?: number;
  reason?: string;
  /** The address that actually received the money, and whether it is the seller's own wallet. */
  paidTo?: string;
  paidToIsSeller?: boolean;
}

/** Where this server can reach itself to buy from its own seller route. */
export function selfBaseUrl(): string {
  const explicit = process.env.DATAHUNTER_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}

function micros(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

export interface DatasetPurchaseRequest {
  datasetId: string;
  licenceKind: LicenceKind;
  /** The price the agent's ledger already approved, used as this purchase's per-payment cap. */
  priceUsdc: number;
  /** What is left of the run's budget, as the x402 layer's own budget. */
  remainingUsdc: number;
  /** Signed negotiated price (lib/agent/quote.ts), so the paywall asks for the deal price, not list. */
  quote?: string;
}

export async function purchaseOverX402(req: DatasetPurchaseRequest): Promise<DatasetPurchase> {
  const { datasetId, licenceKind, priceUsdc, remainingUsdc, quote } = req;
  const tracker = new SpendingTracker({
    budgetMicros: micros(Math.max(remainingUsdc, priceUsdc)),
    maxPaymentMicros: micros(priceUsdc),
  });

  const signer = await loadAgentSigner();
  const pay = createPayingFetch(attachSpendingLimits(createPaymentClient(signer), tracker));
  const url = `${selfBaseUrl()}/api/datasets/${encodeURIComponent(datasetId)}/download?licence=${licenceKind}${quote ? `&quote=${encodeURIComponent(quote)}` : ""}`;

  const response = await pay(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // keep the raw text in the failure reason below
  }

  if (!response.ok) {
    const paymentError = readPaymentError(response);
    const stated = typeof body.error === "string" ? body.error : "";
    return {
      ok: false,
      amountUsdc: priceUsdc,
      reason: `The seller did not release the rows (HTTP ${response.status}). ${paymentError ?? stated ?? text.slice(0, 200)}`.trim(),
    };
  }

  const receipt = readPaymentReceipt(response);
  if (!receipt?.success || !receipt.transaction) {
    // 200 with no settled receipt should be impossible on a paid route. If it happens, say so
    // rather than reporting a purchase we cannot evidence.
    return {
      ok: false,
      amountUsdc: priceUsdc,
      reason: `The rows arrived without a settlement receipt, so this purchase has no evidence on chain${receipt?.errorReason ? `: ${receipt.errorReason}` : "."}`,
    };
  }

  return {
    ok: true,
    amountUsdc: priceUsdc,
    signature: receipt.transaction,
    rows: typeof body.rows === "number" ? body.rows : undefined,
    delivered: typeof body.delivered === "number" ? body.delivered : undefined,
    paidTo: typeof body.paidTo === "string" ? body.paidTo : undefined,
    paidToIsSeller: typeof body.paidToIsSeller === "boolean" ? body.paidToIsSeller : undefined,
  };
}
