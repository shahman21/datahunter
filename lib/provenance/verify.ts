import { verify as cryptoVerify, createPublicKey } from "node:crypto";
import { getBase58Encoder } from "@solana/kit";
import type { DatasetListing } from "../data/types";
import { canonicalBytes } from "./canonical";

// Real ed25519 verification against the seller's own wallet key. This is the whole point of
// the provenance claim: "verified" has to mean a signature was checked and held, not that a
// signature field happened to be non-empty. A listing whose rows or price were edited after
// signing fails here, which is exactly what should happen.

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function decodeBase58(value: string, expectedBytes: number): Buffer | null {
  try {
    const bytes = Buffer.from(getBase58Encoder().encode(value));
    return bytes.length === expectedBytes ? bytes : null;
  } catch {
    return null;
  }
}

/** True only if `signature` is a valid ed25519 signature by `seller.wallet` over this listing. */
export function signatureHolds(dataset: DatasetListing): boolean {
  const signature = dataset.provenance.signature;
  if (!signature) return false;

  const publicKey = decodeBase58(dataset.seller.wallet, 32);
  const signatureBytes = decodeBase58(signature, 64);
  if (!publicKey || !signatureBytes) return false;

  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, publicKey]),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(null, canonicalBytes(dataset), key, signatureBytes);
  } catch {
    return false;
  }
}
