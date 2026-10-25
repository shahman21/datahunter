import type { AgentEvent } from '../lib/data/types';

const tools = new Set(['search_catalog', 'get_sample', 'verify_provenance', 'check_budget', 'purchase_dataset', 'negotiate_price']);
export function isEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  const text = (key: string) => typeof e[key] === 'string';
  const amount = (key: string) => typeof e[key] === 'number' && Number.isFinite(e[key]) && (e[key] as number) >= 0;
  const licence = () => e.licenceKind === 'exclusive' || e.licenceKind === 'non-exclusive';
  switch (e.type) {
    case 'thought': return text('text');
    case 'blocked': return text('reason');
    case 'done': return text('summary');
    case 'tool_call': return tools.has(String(e.name)) && 'args' in e;
    case 'tool_result': return tools.has(String(e.name)) && text('summary');
    case 'payment_required': return text('datasetId') && amount('priceUsdc') && licence() && e.network === 'solana-devnet';
    case 'payment_sent': return text('datasetId') && text('signature') && !!e.signature && amount('amountUsdc');
    case 'offer': return text('datasetId') && licence() && (e.from === 'buyer' || e.from === 'seller') && text('speaker') && ['offer', 'counter', 'accept', 'reject'].includes(String(e.action)) && amount('priceUsdc') && Number(e.priceUsdc) > 0 && amount('listPriceUsdc') && Number(e.listPriceUsdc) > 0 && text('message') && Number.isInteger(e.round) && Number(e.round) >= 1;
    case 'deal': return text('datasetId') && licence() && text('seller') && amount('priceUsdc') && Number(e.priceUsdc) > 0 && amount('listPriceUsdc') && Number(e.listPriceUsdc) > 0;
    case 'data_delivered': return text('datasetId') && amount('rows') && licence();
    default: return false;
  }
}

export async function readAgentStream(response: Response, onEvent: (event: AgentEvent) => void): Promise<void> {
  if (!response.ok) {
    let message = `Agent request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.error === 'string') message = body.error;
    } catch { /* Fall back to the HTTP status. */ }
    throw new Error(message);
  }
  if (!response.body) throw new Error('The agent returned no activity stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let lastEvent: AgentEvent | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: unknown;
    try { event = JSON.parse(line); } catch { throw new Error('Invalid activity received from the agent.'); }
    if (!isEvent(event)) throw new Error('Invalid activity received from the agent.');
    lastEvent = event;
    onEvent(event);
    if (event.type === 'done') completed = true;
  };
  try {
    while (!completed) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        consume(line);
        if (completed) break;
      }
      if (done) {
        if (!completed) consume(buffer);
        break;
      }
    }
    if (!completed) {
      const cause = lastEvent?.type === 'blocked' ? ` Last reported issue: ${lastEvent.reason}` : '';
      throw new Error(`Activity stream ended before completion.${cause} Review the activity before starting another run; a payment may already have settled.`);
    }
  } finally {
    try { await reader.cancel(); } catch { /* Preserve the original stream error. */ }
    reader.releaseLock();
  }
}

export function summarizeRun(events: AgentEvent[]) {
  const payments = events.filter((e): e is Extract<AgentEvent, { type: 'payment_sent' }> => e.type === 'payment_sent');
  const uniquePayments = [...new Map(payments.map(e => [e.signature, e])).values()];
  const deliveries = events.filter((e): e is Extract<AgentEvent, { type: 'data_delivered' }> => e.type === 'data_delivered');
  return {
    spent: uniquePayments.reduce((total, e) => total + e.amountUsdc, 0),
    payments: uniquePayments,
    deliveries: [...new Map(deliveries.map(e => [`${e.datasetId}:${e.licenceKind}`, e])).values()],
  };
}
