import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { LicenceKind } from "../data/types";

// A price the seller agent agreed, carried to the seller's paywall so the 402 demands the deal
// price rather than list. It is signed with a server secret, so a buyer cannot hand the paywall
// a cheaper price than the one actually agreed, and it expires so an old deal cannot be replayed
// forever. The paywall still never charges more than list.

const TTL_MS = 10 * 60_000;

export interface Quote {
  datasetId: string;
  licenceKind: LicenceKind;
  priceUsdc: number;
  expiresAt: number;
}

/** DATAHUNTER_QUOTE_SECRET if set, otherwise a key derived from the server's own signing key. */
function key(): Buffer {
  const explicit = process.env.DATAHUNTER_QUOTE_SECRET?.trim();
  if (explicit) return Buffer.from(explicit);
  const fallback = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!fallback) throw new Error("Set DATAHUNTER_QUOTE_SECRET (or AGENT_PRIVATE_KEY) to sign negotiated prices.");
  return createHash("sha256").update(`datahunter-quote|${fallback}`).digest();
}

const mac = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function signQuote(quote: Omit<Quote, "expiresAt">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...quote, expiresAt: now + TTL_MS })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

/** The quote if its signature holds and it has not expired, otherwise null. */
export function readQuote(token: string, now = Date.now()): Quote | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(mac(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const quote = JSON.parse(Buffer.from(payload, "base64url").toString()) as Quote;
    if (typeof quote.priceUsdc !== "number" || !(quote.priceUsdc > 0) || quote.expiresAt < now) return null;
    return quote;
  } catch {
    return null;
  }
}
