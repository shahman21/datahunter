import { NextResponse, type NextRequest } from "next/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { withX402, x402ResourceServer } from "@x402/next";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { provenanceOf } from "@/lib/agent/tools";
import { findDataset, priceFor } from "@/lib/data/catalog";
import { createSolanaRpc } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getFacilitatorUrl,
  getNetwork,
  getPayToAddress,
  PaymentsConfigError,
  USDC_DEVNET_MINT,
} from "@/lib/payments/config";
import type { DatasetListing, LicenceKind } from "@/lib/data/types";

// GET /api/datasets/:id/download?licence=non-exclusive -> the rows, behind an x402 paywall.
//
// This is the seller's half of the handshake. The price is the listing's price for the licence
// asked for, so the paywall is derived from the catalogue rather than from one env var, and an
// exclusive licence genuinely costs the seller's multiple.
//
// Two things are deliberate. The provenance check runs before the paywall, so a listing whose
// signature does not hold is refused without a payment ever being demanded: a seller that
// cannot prove where rows came from should not be able to take money for them. And the handler
// only returns rows on a 2xx, which is what tells x402 to settle, so there is no path where
// rows are delivered without a settled payment or a payment settles without rows.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many rows one download materialises out of the seeded catalogue. */
const DELIVERED_ROWS = 200;

let resourceServer: x402ResourceServer | null = null;

function getResourceServer(): x402ResourceServer {
  resourceServer ??= new x402ResourceServer(
    new HTTPFacilitatorClient({ url: getFacilitatorUrl() }),
  ).register(getNetwork(), new ExactSvmScheme());
  return resourceServer;
}

/**
 * Who the money goes to.
 *
 * The seller's own wallet is the honest answer and the first choice: it is the wallet that
 * signed the listing. But a USDC transfer to a wallet with no devnet USDC account fails at
 * simulation, and the seeded sellers hold signing keys without ever having been funded, so
 * paying them directly would mean a paywall nobody can clear. Where that is the case the money
 * goes to the marketplace's own settlement account instead, and the response says so, because
 * "paid the seller" and "paid an account on the seller's behalf" are different claims and the
 * console repeats whichever one is true.
 *
 * DATAHUNTER_PAYTO forces the settlement account without the lookup.
 */
async function payToFor(dataset: DatasetListing): Promise<string> {
  const override = process.env.DATAHUNTER_PAYTO?.trim();
  if (override) return override;
  if (dataset.seller.wallet && (await hasUsdcAccount(dataset.seller.wallet))) return dataset.seller.wallet;
  return getPayToAddress();
}

/** Does this wallet hold a devnet USDC token account we could pay into? */
async function hasUsdcAccount(wallet: string): Promise<boolean> {
  try {
    const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");
    const [ata] = await findAssociatedTokenPda({
      owner: wallet as never,
      mint: USDC_DEVNET_MINT as never,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const { value } = await rpc.getAccountInfo(ata, { encoding: "base64" }).send();
    return value !== null;
  } catch {
    // An RPC we cannot reach is not evidence that the seller can be paid.
    return false;
  }
}

/** Deterministic rows, so two downloads of the same dataset agree with each other. */
function materialiseRows(dataset: DatasetListing, count: number) {
  return Array.from({ length: count }, (_, i) =>
    Object.fromEntries(
      dataset.sampleFields.map((field) => [field, `${dataset.id}/${field}/${(i + 1).toString().padStart(6, "0")}`]),
    ),
  );
}

function readLicence(request: NextRequest): LicenceKind {
  return request.nextUrl.searchParams.get("licence") === "exclusive" ? "exclusive" : "non-exclusive";
}

/** The paywall is per dataset and per licence, so each price gets its own wrapped handler. */
const wrapped = new Map<string, (request: NextRequest) => Promise<NextResponse>>();

async function paywalled(dataset: DatasetListing, licenceKind: LicenceKind) {
  const key = `${dataset.id}:${licenceKind}`;
  let handler = wrapped.get(key);
  if (!handler) {
    const priceUsdc = priceFor(dataset, licenceKind);
    const payTo = await payToFor(dataset);
    handler = withX402(
      async () =>
        NextResponse.json({
          datasetId: dataset.id,
          title: dataset.title,
          seller: dataset.seller.name,
          licenceKind,
          licenceTerms: dataset.licence.terms,
          priceUsdc,
          paidTo: payTo,
          paidToIsSeller: payTo === dataset.seller.wallet,
          sellerWallet: dataset.seller.wallet,
          rows: dataset.rows,
          delivered: DELIVERED_ROWS,
          freshness: dataset.freshness,
          fields: dataset.sampleFields,
          data: materialiseRows(dataset, DELIVERED_ROWS),
          note: `Seeded catalogue: ${DELIVERED_ROWS} rows are materialised per download. "rows" is the listing's stated row count, not what this response carries.`,
        }),
      {
        accepts: [
          {
            scheme: "exact",
            price: `$${priceUsdc.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0")}`,
            network: getNetwork(),
            payTo,
          },
        ],
        description: `${dataset.title} — ${licenceKind} licence, ${dataset.rows} rows`,
      },
      getResourceServer(),
    );
    wrapped.set(key, handler);
  }
  return handler;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dataset = findDataset(id);
  if (!dataset) return NextResponse.json({ error: `No dataset with id ${id}.` }, { status: 404 });

  const provenance = provenanceOf(dataset);
  if (provenance.status === "unsigned" || provenance.status === "tampered") {
    return NextResponse.json(
      { error: `This listing is not for sale: provenance is ${provenance.status}.`, detail: provenance.detail },
      { status: 409 },
    );
  }

  try {
    const handler = await paywalled(dataset, readLicence(request));
    return await handler(request);
  } catch (err) {
    if (err instanceof PaymentsConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    throw err;
  }
}
