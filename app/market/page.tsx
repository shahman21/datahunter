import { TrustAssessment } from "@/components/trust/TrustAssessment";
import { assessListing } from "@/components/trust/registry";
import { PILOT_POLICY } from "@/components/trust/policy";
import { provenanceOf } from "@/lib/agent/tools";
import { CATALOG } from "@/lib/data/catalog";
import type { DatasetListing } from "@/lib/data/types";

// A buyer decides on four things before spending: price, what the licence lets them do, how
// fresh the rows are, and whether the seller's provenance holds. All four are on the row, and
// an unsigned listing says so plainly rather than being quietly omitted.

// The same check the agent runs, so the screen and the agent can never disagree: a listing
// is only labelled verified if its signature actually held.
function provenance(dataset: DatasetListing): { label: string; tone: "ok" | "pending" | "fault" } {
  switch (provenanceOf(dataset).status) {
    case "verified":
      return { label: "Signature verified", tone: "ok" };
    case "pending":
      return { label: "Signature pending", tone: "pending" };
    case "tampered":
      return { label: "Signature does not match", tone: "fault" };
    default:
      return { label: "Unsigned", tone: "fault" };
  }
}

const DAY = 24 * 60 * 60 * 1000;

function freshness(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / DAY);
  if (days <= 1) return "Fresh today";
  if (days < 31) return `${days} days old`;
  if (days < 365) return `${Math.round(days / 30)} months old`;
  return `${(days / 365).toFixed(1)} years old`;
}

export default function MarketPage() {
  return (
    <div className="workspace catalogue-workspace">
      <header className="workspace-heading">
        <h1>Dataset catalogue</h1>
        <p>Compare pricing, licences and provenance before starting a data hunt.</p>
      </header>
      <div className="catalogue-policy"><strong>Procurement policy, advisory</strong><p>{PILOT_POLICY.description}</p><p>Signed listings still require evidence of identity, usage rights and data classification. This assessment is not yet enforced at purchase: what holds the money today is the spending limits and the provenance signature, both checked server side on every run.</p></div>
      <section className="catalogue" aria-label="Available datasets">
        <div className="catalogue-heading">
          <span>{CATALOG.length} datasets · Seeded catalogue</span>
          <span>Price / download</span>
        </div>
        {CATALOG.map((dataset) => {
          const prov = provenance(dataset);
          const assessment = assessListing(dataset, provenanceOf(dataset).status);
          return (
            <article className="dataset-row" key={dataset.id}>
              <div className="dataset-main">
                <h2>{dataset.title}</h2>
                <p>
                  {dataset.seller.name} <span aria-hidden="true">·</span>{" "}
                  {dataset.rows.toLocaleString("en-GB")} rows <span aria-hidden="true">·</span>{" "}
                  <time dateTime={dataset.freshness}>{new Date(dataset.freshness).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time> · {freshness(dataset.freshness)}
                </p>
                <p className="dataset-terms">{dataset.licence.terms}</p>
                <div className="dataset-flags">
                  <span className={`flag flag--${prov.tone}`}>{prov.label}</span>
                  {Date.now() - new Date(dataset.freshness).getTime() > 365 * DAY && <span className="flag flag--pending">Older than one year</span>}
                </div>
                <TrustAssessment assessment={assessment} />
              </div>
              <dl className="dataset-prices">
                <div><dt>Non-exclusive</dt><dd>{dataset.priceUsdc.toFixed(2)} <span>USDC</span></dd></div>
                <div><dt>Exclusive</dt><dd>{dataset.licence.exclusivePriceUsdc.toFixed(2)} <span>USDC</span></dd></div>
              </dl>
            </article>
          );
        })}
      </section>
    </div>
  );
}
