export default function Console() {
  return (
    <div className="workspace">
      <header className="workspace-heading">
        <h1>Find the data you need.</h1>
        <p>Give your agent a brief and a budget.</p>
      </header>
      <section className="brief-panel" aria-label="Agent brief">
        <label htmlFor="goal">What are you looking for?</label>
        <textarea id="goal" name="goal" rows={5} placeholder="Describe the data you need and how you plan to use it…" />
        <div className="brief-controls">
          <div className="budget-field">
            <label htmlFor="budget">Budget</label>
            <div className="budget-input">
              <input id="budget" name="budget" type="number" min="0" step="0.01" defaultValue="0.20" aria-describedby="budget-unit" />
              <span id="budget-unit">USDC</span>
            </div>
          </div>
          <button className="btn btn--primary" type="button" disabled aria-describedby="preview-note">Run agent <span aria-hidden="true">↗</span></button>
        </div>
      </section>
      <p id="preview-note" className="preview-note">UI preview · Agent connection coming next.</p>
      <section className="activity-panel" aria-labelledby="activity-title">
        <div className="activity-heading">
          <h2 id="activity-title">Activity</h2>
          <span>Not started</span>
        </div>
        <div className="activity-empty">
          <span className="activity-symbol" aria-hidden="true">↳</span>
          <p>Your agent’s progress will appear here.</p>
        </div>
      </section>
    </div>
  );
}
