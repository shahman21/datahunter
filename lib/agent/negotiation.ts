// The seller agent's pricing rules. Pure functions, no model and no I/O, so they can be tested
// and so nothing the buyer writes can move a price. The model only words the seller's reply
// (lib/agent/seller.ts); whether to accept, counter or hold, and at what price, is decided here.
//
// Each listing has a floor the seller will not go below. It lives only on the server: it is not
// in DatasetListing, so the catalogue, the market page and the buyer agent never see it.

/** Offers the buyer may make per dataset and licence. After that, only the seller's ask is accepted. */
export const MAX_OFFERS = 3;

/** Floor as a fraction of list price. Varied per seller so they do not all behave alike. */
const FLOOR_FRACTION: Record<string, number> = {
  "ds-001": 0.75,
  "ds-002": 0.85,
  "ds-003": 0.7,
  "ds-004": 0.8,
  "ds-005": 0.75,
  "ds-006": 0.85,
  "ds-007": 0.9,
  "ds-008": 0.7,
  "ds-009": 0.6,
};
const DEFAULT_FLOOR_FRACTION = 0.8;

/** An offer within this fraction of the current ask is close enough to accept outright. */
const CLOSE_ENOUGH = 0.1;

// Prices are handled in thousandths of a USDC so rounding can never take the seller under its floor.
const toMilli = (usdc: number) => Math.round(usdc * 1000);
const fromMilli = (milli: number) => milli / 1000;

export interface NegotiationState {
  listPriceUsdc: number;
  /** Server-side only. Never put this in a transcript, an event or a response. */
  floorUsdc: number;
  /** What the seller is currently asking. Starts at list price. */
  askUsdc: number;
  /** Offers the buyer has made so far. */
  offers: number;
  agreedUsdc: number | null;
}

export type SellerAction = "accept" | "counter" | "reject";

export interface SellerDecision {
  action: SellerAction;
  /** The agreed price on accept, otherwise the seller's standing ask. */
  priceUsdc: number;
  /** True when the seller will not move again. */
  final: boolean;
}

export function openNegotiation(datasetId: string, listPriceUsdc: number): NegotiationState {
  const fraction = FLOOR_FRACTION[datasetId] ?? DEFAULT_FLOOR_FRACTION;
  const listMilli = toMilli(listPriceUsdc);
  return {
    listPriceUsdc,
    floorUsdc: fromMilli(Math.min(listMilli, Math.ceil(listMilli * fraction))),
    askUsdc: listPriceUsdc,
    offers: 0,
    agreedUsdc: null,
  };
}

/** What the seller does with an offer. Does not change the state; see applyDecision. */
export function sellerDecide(state: NegotiationState, offerUsdc: number): SellerDecision {
  const offer = toMilli(offerUsdc);
  const ask = toMilli(state.askUsdc);
  const floor = toMilli(state.floorUsdc);
  const round = state.offers + 1;
  const lastRound = round >= MAX_OFFERS;

  // Meeting the ask always closes, and the seller never takes more than it asked for.
  if (offer >= ask) return { action: "accept", priceUsdc: fromMilli(ask), final: true };

  // Out of offers: the ask stands, take it or leave it.
  if (round > MAX_OFFERS) return { action: "reject", priceUsdc: fromMilli(ask), final: true };

  if (offer >= floor && (lastRound || ask - offer <= Math.ceil(ask * CLOSE_ENOUGH))) {
    return { action: "accept", priceUsdc: fromMilli(offer), final: true };
  }

  // Below the floor on the last offer: best and final is the floor itself.
  if (lastRound) return { action: "counter", priceUsdc: fromMilli(floor), final: true };

  // Otherwise meet the buyer halfway, never below the floor.
  const counter = Math.max(floor, Math.ceil((offer + ask) / 2));
  return { action: "counter", priceUsdc: fromMilli(counter), final: counter === floor };
}

export function applyDecision(state: NegotiationState, decision: SellerDecision): NegotiationState {
  return {
    ...state,
    offers: state.offers + 1,
    askUsdc: decision.action === "counter" ? decision.priceUsdc : state.askUsdc,
    agreedUsdc: decision.action === "accept" ? decision.priceUsdc : state.agreedUsdc,
  };
}
