import type { AgentEvent } from '../lib/data/types';
import { isEvent } from './agent-stream';
import { previewScenarios } from './preview-scenarios';

export const PREVIEW_VERSION = 3;
export const HISTORY_KEY = 'datahunter.searches.v1';
export type SearchRun = {
  id: string;
  mode: 'preview' | 'live';
  previewVersion?: number;
  goal: string;
  budget: number;
  createdAt: string;
  status: 'running' | 'complete' | 'interrupted';
  scenario: 'complete' | 'failure';
  events: AgentEvent[];
  error?: string;
};

export function makeRun(goal: string, budget: number, id: string, mode: SearchRun['mode'] = 'preview'): SearchRun {
  return { id, mode, previewVersion: mode === 'preview' ? PREVIEW_VERSION : undefined, goal: goal.trim(), budget, createdAt: new Date().toISOString(), status: 'running', scenario: 'complete', events: [] };
}

function validEvent(value: unknown): boolean {
  if (isEvent(value)) return true;
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  // Preview payments intentionally have no signature: no transaction happened.
  return e.type === 'payment_sent' && e.signature === '' && typeof e.datasetId === 'string'
    && typeof e.amountUsdc === 'number' && Number.isFinite(e.amountUsdc) && e.amountUsdc >= 0;
}

export function restoreRuns(raw: string | null): SearchRun[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = new Set<string>();
    return parsed.filter((value): value is SearchRun => {
      if (!value || typeof value !== 'object') return false;
      const r = value as Record<string, unknown>;
      if ((r.mode !== undefined && r.mode !== 'preview' && r.mode !== 'live') || typeof r.id !== 'string' || !r.id || ids.has(r.id) || typeof r.goal !== 'string' || !r.goal.trim()
        || typeof r.budget !== 'number' || !Number.isFinite(r.budget) || r.budget <= 0
        || (r.previewVersion !== undefined && (!Number.isInteger(r.previewVersion) || (r.previewVersion as number) < 1))
        || typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt))
        || !['running', 'complete', 'interrupted'].includes(String(r.status))
        || !['complete', 'failure'].includes(String(r.scenario))
        || (r.error !== undefined && typeof r.error !== 'string')
        || !Array.isArray(r.events) || !r.events.every(r.mode === 'live' ? isEvent : validEvent)) return false;
      ids.add(r.id);
      return true;
    }).map(run => ({ ...run, mode: run.mode ?? 'preview', ...((run.mode ?? 'preview') === 'preview' && run.previewVersion !== PREVIEW_VERSION && run.status === 'running' ? { status: 'interrupted' as const, error: 'This saved preview uses an earlier workflow. Start a new preview to see the current trust checks.' } : {}), ...(run.mode === 'live' && run.status === 'running' ? { status: 'interrupted' as const, error: 'The live connection ended when this page was closed. Review any settled payments before starting another data hunt.' } : {}) }));
  } catch { return []; }
}

export function timelineFor(run: SearchRun): AgentEvent[] {
  if (run.budget < 0.00001) return [
    { type: 'thought', text: 'Checking whether the budget can support the example negotiation.' },
    { type: 'blocked', reason: 'This preview needs at least 0.00001 USDC to represent its offer steps at USDC precision. No purchase was attempted.' },
    { type: 'done', summary: 'Budget preserved. Increase the preview budget to see the full workflow.' },
  ];
  const list = Math.min(0.04, run.budget / 5);
  const scale = (value: number) => Number((value / 0.04 * list).toFixed(6));
  const price = scale(0.03);
  const text = (value: string) => value.replace(/0\.(04|03|02)\b/g, match => scale(Number(match)).toLocaleString('en-GB', { maximumFractionDigits: 6 }));
  return previewScenarios[run.scenario].events.map(event => {
    if (event.type === 'payment_required') return { ...event, priceUsdc: price };
    if (event.type === 'payment_sent') return { ...event, amountUsdc: price };
    if (event.type === 'offer') return { ...event, priceUsdc: scale(event.priceUsdc), listPriceUsdc: list, message: text(event.message) };
    if (event.type === 'deal') return { ...event, priceUsdc: scale(event.priceUsdc), listPriceUsdc: list };
    if (event.type === 'tool_call' && event.name === 'negotiate_price') {
      const args = event.args as Record<string, unknown>;
      return { ...event, args: { ...args, offerUsdc: scale(Number(args.offerUsdc)), message: text(String(args.message)) } };
    }
    if (event.type === 'tool_result') return { ...event, summary: text(event.summary) };
    if (event.type === 'done') return { ...event, summary: `Example outcome: 124,800 planning records with a non-exclusive licence. Simulated spend: ${price} of ${run.budget} USDC after negotiating down from ${list}. Exclusive access was refused by policy; the alternative passed the simulated non-personal-data policy checks.` };
    return event;
  });
}

export function advanceRuns(runs: SearchRun[]): SearchRun[] {
  return runs.map(run => {
    if (run.status !== 'running' || run.mode === 'live') return run;
    const timeline = timelineFor(run);
    const events = timeline.slice(0, run.events.length + 1);
    if (events.length >= timeline.length) {
      const complete = events.at(-1)?.type === 'done';
      return { ...run, events, status: complete ? 'complete' : 'interrupted', error: !complete && run.scenario === 'failure' ? previewScenarios.failure.error : undefined };
    }
    return { ...run, events };
  });
}
