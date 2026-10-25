import type { DatasetListing } from "./types";
import { LISTING_SIGNATURES, SELLER_WALLETS } from "./provenance.generated";

// Seeded sellers. Supply is not the claim DataHunter makes: the claim is the settlement and
// verification rail underneath it, and a seeded catalogue exercises that rail exactly as a
// real one would. Say so in the pitch before a judge asks.
//
// Prices are tuned against the starter's default spending limits (MAX_PAYMENT_USD=0.10,
// AGENT_BUDGET_USD=1.00) so the demo produces a real refusal rather than a staged one:
// every non-exclusive price clears the per-payment cap, and five of the nine exclusive
// prices breach it. The agent therefore has to argue for exclusivity and lose, on stage,
// without anyone rigging the moment.
//
// Two listings are deliberately defective. ds-007 is unsigned, so verify_provenance fails.
// ds-009 is three years stale, so a brief asking for current data should reject it on the
// free sample and never pay. Do not "fix" either: they are the demo.

const SEED: DatasetListing[] = [
  {
    id: "ds-001",
    title: "UK planning applications, full text and outcomes",
    seller: { name: "Pendle Civic Data", wallet: "7xKXtg2CW3pTGbmEiH8nQd4kVfYrLs9ZaBcDeFgHjKmN" },
    domain: "uk-planning-applications",
    rows: 412_880,
    priceUsdc: 0.04,
    licence: {
      kind: "non-exclusive",
      terms: "Commercial use and model training permitted. Attribution not required. No redistribution of raw rows.",
      exclusivePriceUsdc: 0.16,
    },
    freshness: "2026-10-21",
    sampleFields: ["application_ref", "authority", "submitted_at", "decision", "decision_at", "description", "ward"],
    provenance: { signedBy: "Pendle Civic Data", signature: null },
  },
  {
    id: "ds-002",
    title: "De-identified GP referral letters, East of England",
    seller: { name: "Thornbury Clinical Archive", wallet: "3mNpQr5SvT8uWxYzA1bC2dE4fG6hJ7kL9mN0pQrStUvW" },
    domain: "clinical-notes",
    rows: 86_300,
    priceUsdc: 0.09,
    licence: {
      kind: "non-exclusive",
      terms: "Research and model training only. De-identified under NHS guidance. No attempt at re-identification. No onward sale.",
      exclusivePriceUsdc: 0.45,
    },
    freshness: "2026-09-30",
    sampleFields: ["referral_id", "specialty", "referred_at", "presenting_complaint", "letter_text", "age_band"],
    provenance: { signedBy: "Thornbury Clinical Archive", signature: null },
  },
  {
    id: "ds-003",
    title: "Sentinel-2 NDVI time series, English arable holdings",
    seller: { name: "Fenland Remote Sensing", wallet: "9aBcDeF1gH2iJ3kL4mN5oP6qR7sT8uV9wX0yZ1aB2cD3" },
    domain: "satellite-ndvi",
    rows: 1_940_000,
    priceUsdc: 0.03,
    licence: {
      kind: "non-exclusive",
      terms: "Derived from Copernicus open data. Commercial use permitted. Derived products may be redistributed.",
      exclusivePriceUsdc: 0.09,
    },
    freshness: "2026-10-18",
    sampleFields: ["holding_id", "captured_on", "ndvi_mean", "ndvi_p10", "cloud_fraction", "crop_code", "centroid_geohash"],
    provenance: { signedBy: "Fenland Remote Sensing", signature: null },
  },
  {
    id: "ds-004",
    title: "UK SME insolvency filings with director histories",
    seller: { name: "Greyfriars Credit Research", wallet: "5eF6gH7iJ8kL9mN0oP1qR2sT3uV4wX5yZ6aB7cD8eF9g" },
    domain: "company-filings",
    rows: 231_450,
    priceUsdc: 0.07,
    licence: {
      kind: "non-exclusive",
      terms: "Commercial use and model training permitted. Rows derived from public filings. No warranty of completeness.",
      exclusivePriceUsdc: 0.28,
    },
    freshness: "2026-10-23",
    sampleFields: ["company_number", "filing_type", "filed_at", "outcome", "director_ids", "sic_codes", "liabilities_gbp"],
    provenance: { signedBy: "Greyfriars Credit Research", signature: null },
  },
  {
    id: "ds-005",
    title: "Annotated UK rail incident reports, 2019 to date",
    seller: { name: "Ashworth Transport Analytics", wallet: "2hJ3kL4mN5oP6qR7sT8uV9wX0yZ1aB2cD3eF4gH5iJ6k" },
    domain: "incident-reports",
    rows: 54_120,
    priceUsdc: 0.05,
    licence: {
      kind: "non-exclusive",
      terms: "Research and model training permitted. Human annotations licensed for derivative models. Attribution required in publications.",
      exclusivePriceUsdc: 0.2,
    },
    freshness: "2026-10-12",
    sampleFields: ["incident_id", "occurred_at", "operator", "category", "narrative", "severity", "cause_label"],
    provenance: { signedBy: "Ashworth Transport Analytics", signature: null },
  },
  {
    id: "ds-006",
    title: "Chemistry lab notebooks, reaction yields and failures",
    seller: { name: "Calder Synthesis Group", wallet: "8kL9mN0oP1qR2sT3uV4wX5yZ6aB7cD8eF9gH0iJ1kL2m" },
    domain: "lab-notebooks",
    rows: 19_740,
    priceUsdc: 0.08,
    licence: {
      kind: "non-exclusive",
      terms: "Model training permitted. Includes negative results. No publication of individual researcher identities.",
      exclusivePriceUsdc: 0.32,
    },
    freshness: "2026-10-09",
    sampleFields: ["experiment_id", "run_at", "reagents", "conditions", "yield_pct", "outcome", "notes"],
    provenance: { signedBy: "Calder Synthesis Group", signature: null },
  },
  {
    id: "ds-007",
    title: "Scraped product reviews, UK electronics retail",
    seller: { name: "unverified seller", wallet: "4nO5pQ6rS7tU8vW9xY0zA1bC2dE3fG4hI5jK6lM7nO8p" },
    domain: "product-reviews",
    rows: 2_310_000,
    priceUsdc: 0.01,
    licence: {
      kind: "non-exclusive",
      terms: "Seller asserts the right to sell. No provenance signature provided. Origin of rows not stated.",
      exclusivePriceUsdc: 0.03,
    },
    freshness: "2026-10-24",
    sampleFields: ["review_id", "product_id", "rating", "posted_at", "body", "verified_purchase"],
    // Deliberately unsigned. verify_provenance must fail and the agent must not buy it.
    provenance: { signedBy: "", signature: null },
  },
  {
    id: "ds-008",
    title: "Local authority FOI responses, full corpus",
    seller: { name: "Openshaw Records Office", wallet: "6qR7sT8uV9wX0yZ1aB2cD3eF4gH5iJ6kL7mN8oP9qR0s" },
    domain: "foi-responses",
    rows: 148_900,
    priceUsdc: 0.02,
    licence: {
      kind: "non-exclusive",
      terms: "Open Government Licence. Commercial use and redistribution permitted. Attribution required.",
      exclusivePriceUsdc: 0.06,
    },
    freshness: "2026-10-20",
    sampleFields: ["request_id", "authority", "requested_at", "responded_at", "subject", "response_text", "exemptions"],
    provenance: { signedBy: "Openshaw Records Office", signature: null },
  },
  {
    id: "ds-009",
    title: "UK retail footfall counts, high street sensors",
    seller: { name: "Marchmont Urban Sensing", wallet: "1sT2uV3wX4yZ5aB6cD7eF8gH9iJ0kL1mN2oP3qR4sT5u" },
    domain: "footfall",
    rows: 7_820_000,
    priceUsdc: 0.03,
    licence: {
      kind: "non-exclusive",
      terms: "Commercial use permitted. Sensor coverage changed in 2024 and is not backfilled.",
      exclusivePriceUsdc: 0.12,
    },
    // Deliberately stale. A brief asking for current data should reject this on the free
    // sample and never pay for it.
    freshness: "2023-11-02",
    sampleFields: ["sensor_id", "counted_at", "footfall", "town", "street", "weather_code"],
    provenance: { signedBy: "Marchmont Urban Sensing", signature: null },
  },
];

// Real wallets and real signatures are generated out of band by `npm run sign:catalog`, so
// that no seller's private key is anywhere near the app. A seller the generator has not run
// for keeps its seeded wallet and stays unsigned, which verify_provenance reports honestly.
export const CATALOG: DatasetListing[] = SEED.map((dataset) => ({
  ...dataset,
  seller: { ...dataset.seller, wallet: SELLER_WALLETS[dataset.seller.name] ?? dataset.seller.wallet },
  provenance: { ...dataset.provenance, signature: LISTING_SIGNATURES[dataset.id] ?? null },
}));

export function findDataset(id: string): DatasetListing | undefined {
  return CATALOG.find((d) => d.id === id);
}

/** Price for a given licence kind. The only place this choice turns into money. */
export function priceFor(dataset: DatasetListing, kind: DatasetListing["licence"]["kind"]): number {
  return kind === "exclusive" ? dataset.licence.exclusivePriceUsdc : dataset.priceUsdc;
}
