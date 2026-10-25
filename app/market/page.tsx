import { CATALOG } from "@/lib/data/catalog";

export default function MarketPage() {
  return (
    <div className="workspace">
      <header className="workspace-heading">
        <h1>Dataset catalogue.</h1>
        <p>A starting point for your agent’s search.</p>
      </header>
      <section className="catalogue" aria-label="Available datasets">
        <div className="catalogue-heading"><span>{CATALOG.length} datasets · Seeded catalogue</span><span>Price / download</span></div>
        {CATALOG.map((dataset) => (
          <article className="dataset-row" key={dataset.id}>
            <div>
              <h2>{dataset.title}</h2>
              <p>{dataset.seller.name} <span aria-hidden="true">·</span> {dataset.rows.toLocaleString("en-GB")} rows</p>
            </div>
            <span className="dataset-price">{dataset.priceUsdc.toFixed(2)} <span>USDC</span></span>
          </article>
        ))}
      </section>
    </div>
  );
}
