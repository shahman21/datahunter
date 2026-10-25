"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { Activity } from './Activity';
import { TRUST_ENFORCEMENT_READY } from './trust/integration-status';
import { TrustAssessment } from './trust/TrustAssessment';
import { trustExamples } from './trust/examples';
import { negotiationThreads } from './negotiation-threads';
import { Negotiation } from './Negotiation';
import { readAgentStream, summarizeRun } from './agent-stream';
import { HISTORY_KEY, PREVIEW_VERSION, advanceRuns, makeRun, restoreRuns, timelineFor, type SearchRun } from './search-history';
import { previewGoal, previewScenarios } from './preview-scenarios';

const money = (amount: number) => amount.toLocaleString('en-GB', { maximumFractionDigits: 6 });
const statusText = { running: 'Hunting', complete: 'Complete', interrupted: 'Stopped' };
function Icon({ name, size = 20 }: { name: 'panel' | 'plus' | 'arrow' | 'search' | 'check' | 'chevron' | 'external'; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    panel: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    external: <><path d="M14 4h6v6m-1-5-9 9" /><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function Console({ preview = false }: { preview?: boolean }) {
  const [runs, setRuns] = useState<SearchRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mode, setMode] = useState<SearchRun['mode']>('live');
  const connections = useRef(new Map<string, AbortController>());
  const submitted = useRef(false);
  const [goal, setGoal] = useState('');
  const [budget, setBudget] = useState('0.20');
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [formError, setFormError] = useState('');
  const [expandedBrief, setExpandedBrief] = useState(false);
  const [briefOverflows, setBriefOverflows] = useState(false);
  const briefRef = useRef<HTMLHeadingElement>(null);
  const [followLatest, setFollowLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const focusComposer = useRef(false);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const active = runs.find(run => run.id === selectedId);
  const isTrustPreview = active?.mode === 'preview' && active.previewVersion === PREVIEW_VERSION && active.events.some(event => event.type === 'tool_call' && event.name === 'search_catalog');
  const negotiations = negotiationThreads(active?.events ?? []);
  const summary = summarizeRun(active?.events ?? []);
  const hasRunning = runs.some(run => run.status === 'running' && run.mode === 'preview');

  useEffect(() => {
    try {
      setRuns(restoreRuns(localStorage.getItem(HISTORY_KEY)));
      const id = window.location.hash.slice(1);
      if (id) setSelectedId(id);
    } catch { setStorageError('Browser storage is unavailable. Data hunts will stay here until you refresh.'); }
    setReady(true);
    const handleHash = () => setSelectedId(window.location.hash.slice(1) || null);
    window.addEventListener('hashchange', handleHash);
    return () => {
      window.removeEventListener('hashchange', handleHash);
      connections.current.forEach(controller => controller.abort());
      connections.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(runs)); }
    catch { setStorageError('Could not save data hunt history in this browser. Keep this page open to retain it.'); }
  }, [runs, ready]);

  useEffect(() => {
    if (!hasRunning || !ready) return;
    const timer = window.setInterval(() => setRuns(previous => advanceRuns(previous)), 850);
    return () => window.clearInterval(timer);
  }, [hasRunning, ready]);

  useEffect(() => {
    if (followLatest && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active?.events.length, selectedId, followLatest]);

  useEffect(() => {
    const el = briefRef.current;
    if (!el) return;
    const measure = () => setBriefOverflows(expandedBrief || el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active?.goal, expandedBrief]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSidebarOpen(false); sidebarToggleRef.current?.focus(); }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [sidebarOpen]);

  function selectRun(id: string | null, follow = runs.find(run => run.id === id)?.status === 'running') {
    if (id === null) submitted.current = false;
    if (window.matchMedia('(max-width: 760px)').matches) setSidebarOpen(false);
    setSelectedId(id); setExpandedBrief(false); setFollowLatest(follow);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${id ? `#${encodeURIComponent(id)}` : ''}`);
  }

  useEffect(() => {
    if (selectedId === null && focusComposer.current) {
      composerRef.current?.focus();
      focusComposer.current = false;
    }
  }, [selectedId]);

  function newSearch() {
    submitted.current = false;
    focusComposer.current = true;
    selectRun(null);
    if (composerRef.current) { composerRef.current.focus(); focusComposer.current = false; }
  }

  async function startSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitted.current) return;
    const amount = Number(budget);
    if (!goal.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError('Add a brief and a budget greater than zero.'); return;
    }
    submitted.current = true;
    const run = makeRun(goal, amount, crypto.randomUUID(), preview ? 'preview' : mode);
    setRuns(previous => [run, ...previous]);
    selectRun(run.id, true); setGoal(''); setFormError('');
    if (run.mode === 'preview') return;
    const controller = new AbortController();
    connections.current.set(run.id, controller);
    try {
      const response = await fetch('/api/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: run.goal, budgetUsdc: run.budget }), signal: controller.signal,
      });
      await readAgentStream(response, event => setRuns(previous => previous.map(item => item.id === run.id ? { ...item, events: [...item.events, event] } : item)));
      setRuns(previous => previous.map(item => item.id === run.id ? { ...item, status: 'complete' } : item));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not connect to the agent.';
      setRuns(previous => previous.map(item => item.id === run.id ? { ...item, status: 'interrupted', error: reason } : item));
    } finally { connections.current.delete(run.id); }
  }

  function openExample(scenario: 'complete' | 'running' | 'failure') {
    const run = makeRun(previewGoal, 0.2, crypto.randomUUID());
    run.scenario = scenario === 'failure' ? 'failure' : 'complete';
    run.events = scenario === 'running' ? previewScenarios.running.events : timelineFor(run);
    run.status = scenario === 'running' ? 'running' : scenario === 'failure' ? 'interrupted' : 'complete';
    run.error = scenario === 'failure' ? previewScenarios.failure.error : undefined;
    setRuns(previous => [run, ...previous]); selectRun(run.id, scenario === 'running');
  }

  const runningCount = runs.filter(run => run.status === 'running').length;
  return (
    <div className={`search-app ${sidebarOpen ? 'search-app--expanded' : ''}`} data-preview={preview}>
      <aside className="search-sidebar" aria-label="Data hunt history">
        <div className="sidebar-top"><button ref={sidebarToggleRef} className="icon-button" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={sidebarOpen} aria-controls="search-history" onClick={() => setSidebarOpen(value => !value)}><Icon name="panel" /></button>{sidebarOpen && <span className="sidebar-wordmark">DataHunter</span>}</div>
        <button className="sidebar-new" onClick={newSearch} aria-label="New data hunt"><Icon name="plus" />{sidebarOpen && <span>New data hunt</span>}</button>
        <div id="search-history" className="sidebar-history" hidden={!sidebarOpen}>
          <div className="sidebar-section-label">Your data hunts <span>{runs.length}</span></div>
          {!runs.length && <p className="sidebar-empty">A little empty here.<br />Your data hunts will live here.</p>}
          <ul>{runs.map(run => <li key={run.id}><button title={run.goal} className={`history-item ${selectedId === run.id ? 'history-item--active' : ''}`} onClick={() => selectRun(run.id)} aria-current={selectedId === run.id ? 'page' : undefined}><span className={`status-dot status-dot--${run.status}`} /><span className="history-item-copy"><span>{run.goal}</span><small>{statusText[run.status]} · {run.mode === 'preview' ? 'Preview' : 'Live'}</small></span></button></li>)}</ul>
        </div>
        <div className="sidebar-bottom">{sidebarOpen && <span>Saved on this device</span>}</div>
      </aside>
      {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="Close sidebar" onClick={() => { setSidebarOpen(false); sidebarToggleRef.current?.focus(); }} />}
      <div className="search-main">
        <header className="search-topbar"><button className="workspace-brand" onClick={() => selectRun(null)}>DataHunter</button><div className="topbar-right"><ThemeToggle />{runningCount > 0 && <span className="running-count"><span className="status-dot status-dot--running" />{runningCount} hunting</span>}<span className="simulation-badge">{(active?.mode ?? mode) === 'preview' ? 'Preview' : 'Live · Devnet'}</span><a href="/market" className="catalogue-link">Catalogue <Icon name="external" size={14} /></a></div></header>
        {storageError && <p className="storage-message" role="status">{storageError}</p>}
        {!active ? <div className="search-landing">
          <div className="landing-content">

            <div className="landing-heading"><p>DATA WORKSPACE</p><h1>Start a data hunt.</h1></div>

            {!preview && <div className="hunt-mode" role="group" aria-label="Data hunt mode"><button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>Preview</button><button type="button" aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Live agent</button></div>}
            <form className="search-composer" aria-label="New data hunt" onSubmit={startSearch}>
              <label className="composer-label" htmlFor="goal">What are you looking for?</label>
              <textarea ref={composerRef} id="goal" required value={goal} onChange={e => setGoal(e.target.value)} placeholder="Describe the data, coverage and level of detail you need…" rows={3} />
              <div className="composer-bottom"><div className="composer-budget"><label htmlFor="budget">Budget</label><input id="budget" type="number" min="0.000001" step="any" required value={budget} onChange={e => setBudget(e.target.value)} /><span>USDC</span></div><button className="search-submit" type="submit" disabled={!ready} aria-label={mode === 'preview' ? 'Start simulated data hunt' : 'Start live data hunt'}><span>Start data hunt</span><Icon name="arrow" size={18} /></button></div>
            </form>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <p className="simulation-note">{mode === 'preview' ? 'Preview mode · No model calls or payments.' : 'Uses your configured agent and devnet wallet.'}</p>
            <details className="preview-info"><summary>What stops this agent overspending</summary><p>Enforced on the server on every live run, outside the model: a per-run budget from the brief, a cap on any single payment, a lower ceiling again on exclusive licences, a seller allowlist, and a provenance signature that has to hold before a purchase is permitted. Offers made during a negotiation are checked against the same limits before they are sent.</p>{!TRUST_ENFORCEMENT_READY && <p>The trust &amp; usage assessment on the catalogue is advisory and is not yet enforced. It shows what a real deployment would require beyond a signature: reviewed identity, usage rights and data classification.</p>}</details>
            {mode === 'preview' && <div className="example-prompts"><button disabled={!ready} onClick={() => openExample('complete')}>Full demo <span>↗</span></button><button disabled={!ready} onClick={() => openExample('running')}>Activity preview <span>↗</span></button><button disabled={!ready} onClick={() => openExample('failure')}>Payment failure <span>↗</span></button></div>}
          </div>

        </div> : <section className="run-dashboard" aria-label="Data hunt dashboard">
          <div className="dashboard-fixed">
            <div className="run-eyebrow"><span>{active.mode === 'preview' ? 'PREVIEW DATA HUNT' : 'DATA HUNT'}</span><span className={`run-status run-status--${active.status}`}><span className={`status-dot status-dot--${active.status}`} />{statusText[active.status]}</span></div>
            <h1 ref={briefRef} className={`run-brief ${expandedBrief ? 'run-brief--expanded' : ''}`}>{active.goal}</h1>
            {briefOverflows && <button className="brief-expand" aria-expanded={expandedBrief} onClick={() => setExpandedBrief(value => !value)}>{expandedBrief ? 'Less' : 'Read full brief'} <Icon name="chevron" size={14} /></button>}

            <dl className="dashboard-metrics"><div className="stat-card stat-card--spend"><dt>{active.mode === 'preview' ? 'Simulated spend' : 'Settled spend'}</dt><dd>{money(summary.spent)}<span>USDC</span></dd></div><div className="stat-card stat-card--budget"><dt>Budget remaining</dt><dd>{money(Math.max(0, active.budget - summary.spent))}<span>USDC</span></dd></div><div className="stat-card stat-card--delivered"><dt>Datasets delivered</dt><dd>{summary.deliveries.length.toString().padStart(2, '0')}</dd></div></dl>
            <div className="dashboard-activity-heading"><h2>Activity <span>{active.events.length.toString().padStart(2, '0')}</span></h2></div>
          </div>
          <div className="dashboard-scroll" ref={scrollRef} tabIndex={0} aria-label="Scrollable activity" onScroll={e => { const el = e.currentTarget; setFollowLatest(el.scrollHeight - el.scrollTop - el.clientHeight < 50); }}>
            {active.mode === 'preview' && <p className="workflow-disclaimer">Example planning-data workflow.</p>}
            {active.events.length === 0 ? <div className="dashboard-waiting"><Icon name="search" size={24} /><p>Starting your data hunt…</p></div> : <ol className="activity-list" role="log" aria-label="Agent activity" aria-live="polite" aria-relevant="additions">{active.events.map((event, index) => <Fragment key={index}><li className={`activity-event activity-event--${event.type}`}><div className="activity-marker" aria-hidden="true">{event.type === 'blocked' ? '!' : event.type === 'done' || event.type === 'data_delivered' || event.type === 'payment_sent' ? <Icon name="check" size={14} /> : <span />}</div><div className="activity-event-content"><Activity event={event} preview={active.mode === 'preview'} stopped={active.status === 'interrupted' && index === active.events.length - 1} /></div></li>{isTrustPreview && index === 2 && <li className="trust-preview-entry"><TrustAssessment assessment={trustExamples.prohibited} title="Example candidate · training prohibited" example /></li>}{isTrustPreview && index === 6 && <li className="trust-preview-entry"><TrustAssessment assessment={trustExamples.eligible} title="Example alternative · reviewed evidence" example /></li>}</Fragment>)}</ol>}
            {negotiations.length > 0 && <section className="negotiation-summaries" aria-label="Negotiation summaries">{negotiations.map(thread => <Negotiation key={thread.key} thread={thread} example={active.mode === 'preview'} />)}</section>}
            {active.error && <p className="run-error" role="alert">{active.error}</p>}
            {summary.deliveries.length > 0 && <section className="delivered-summary" aria-label="Delivered datasets"><div><span className="delivery-icon"><Icon name="check" size={18} /></span><h3>{active.mode === 'preview' ? 'Example data package' : 'Delivered datasets'}</h3></div>{summary.deliveries.map(delivery => <p key={`${delivery.datasetId}:${delivery.licenceKind}`}>{delivery.datasetId}<span>{delivery.rows.toLocaleString()} rows · {delivery.licenceKind} licence</span></p>)}</section>}

          </div>
          {!followLatest && <button className="jump-latest" onClick={() => { setFollowLatest(true); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }}>Jump to latest ↓</button>}
        </section>}
      </div>
    </div>
  );
}
