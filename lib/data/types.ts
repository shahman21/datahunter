// The frozen contracts for DataHunter. Import from here, never redeclare these shapes.
// Zachary builds the interface against mocked AgentEvent arrays matching this file while
// Luca makes the payments real, and nothing has to be rewritten when they meet.

export type LicenceKind = "non-exclusive" | "exclusive";

export interface DatasetListing {
  id: string;
  title: string;
  seller: { name: string; wallet: string };
  /** Short slug, used for filtering in the UI. */
  domain: string;
  rows: number;
  /** Price of a non-exclusive full download, in devnet USDC. */
  priceUsdc: number;
  licence: {
    kind: LicenceKind;
    /** Plain words, shown in the UI before any purchase. */
    terms: string;
    /** What the seller charges to lock every other buyer out. 3x to 5x priceUsdc. */
    exclusivePriceUsdc: number;
  };
  /** ISO date of the newest row. */
  freshness: string;
  sampleFields: string[];
  /** signature stays null until Luca's seller signing is wired in. Never fake one. */
  provenance: { signedBy: string; signature: string | null };
}

export type ToolName =
  | "search_catalog"
  | "get_sample"
  | "check_budget"
  | "purchase_dataset"
  | "verify_provenance";

export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "tool_call"; name: ToolName; args: unknown }
  | { type: "tool_result"; name: ToolName; summary: string }
  | { type: "payment_required"; datasetId: string; priceUsdc: number; licenceKind: LicenceKind; network: "solana-devnet" }
  | { type: "payment_sent"; datasetId: string; signature: string; amountUsdc: number }
  | { type: "data_delivered"; datasetId: string; rows: number; licenceKind: LicenceKind }
  | { type: "blocked"; reason: string }
  | { type: "done"; summary: string };

/** What POST /api/agent accepts. */
export interface AgentBrief {
  goal: string;
  budgetUsdc: number;
}
