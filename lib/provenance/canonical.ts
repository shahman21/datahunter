import type { DatasetListing } from "../data/types";

// What a seller actually puts their name to. Everything a buyer would care about if it were
// changed after the fact is in here: the price, the licence, the row count, the freshness.
// Leave the signature itself out, obviously, and leave nothing else out either — a field
// outside this payload is a field a seller could rewrite without breaking their own signature.
export function canonicalPayload(dataset: DatasetListing): string {
  return JSON.stringify([
    dataset.id,
    dataset.title,
    dataset.seller.name,
    dataset.seller.wallet,
    dataset.domain,
    dataset.rows,
    dataset.priceUsdc,
    dataset.licence.kind,
    dataset.licence.terms,
    dataset.licence.exclusivePriceUsdc,
    dataset.freshness,
    dataset.sampleFields,
  ]);
}

export function canonicalBytes(dataset: DatasetListing): Uint8Array {
  return new TextEncoder().encode(canonicalPayload(dataset));
}
