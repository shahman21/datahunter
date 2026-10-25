import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAgentStream, summarizeRun } from '../components/agent-stream';
import type { AgentEvent } from '../lib/data/types';

function response(chunks: string[], status = 200) {
  return new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  } }), { status });
}

test('reads split JSON, blank lines and a final unterminated event', async () => {
  const events: AgentEvent[] = [];
  await readAgentStream(response(['{"type":"thought","te', 'xt":"Checking"}\n\n{"type":"done","summary":"Finished"}']), e => events.push(e));
  assert.deepEqual(events.map(e => e.type), ['thought', 'done']);
});

test('refusal does not terminate a stream that subsequently completes', async () => {
  const events: AgentEvent[] = [];
  await readAgentStream(response(['{"type":"blocked","reason":"Exclusive cap"}\n{"type":"done","summary":"Alternative found"}\n']), e => events.push(e));
  assert.equal(events.length, 2);
});

test('reports interrupted streams and preserves events already received', async () => {
  const events: AgentEvent[] = [];
  await assert.rejects(readAgentStream(response(['{"type":"blocked","reason":"Payment failed"}\n']), e => events.push(e)), /ended before completion/i);
  assert.equal(events.length, 1);
});

test('rejects HTTP failures and malformed events', async () => {
  await assert.rejects(readAgentStream(response(['{"error":"goal is required"}'], 400), () => {}), /goal is required/);
  await assert.rejects(readAgentStream(response(['not json\n']), () => {}), /invalid activity/i);
  await assert.rejects(readAgentStream(response(['{"type":"payment_sent","amountUsdc":"wrong"}\n']), () => {}), /invalid activity/i);
});

test('counts settled transactions once and only delivered datasets as delivered', () => {
  const payment: AgentEvent = { type: 'payment_sent', datasetId: 'ds-001', signature: 'test-only-transaction', amountUsdc: 0.04 };
  const events: AgentEvent[] = [
    { type: 'payment_required', datasetId: 'ds-001', priceUsdc: 0.16, licenceKind: 'exclusive', network: 'solana-devnet' },
    { type: 'blocked', reason: 'Cap' }, payment, payment,
    { type: 'data_delivered', datasetId: 'ds-001', rows: 200, licenceKind: 'non-exclusive' },
  ];
  const summary = summarizeRun(events);
  assert.equal(summary.spent, 0.04);
  assert.equal(summary.payments.length, 1);
  assert.equal(summary.deliveries.length, 1);
  assert.equal(summarizeRun(events.slice(0, 2)).spent, 0);
  assert.equal(summarizeRun([payment]).deliveries.length, 0);
});

test('an unfinished run reports its final backend error', async () => {
  const reason = 'ANTHROPIC_API_KEY is not set. Add it to .env.local and restart npm run dev.';
  await assert.rejects(
    readAgentStream(response([JSON.stringify({ type: 'blocked', reason }) + '\n']), () => {}),
    /Activity stream ended before completion.*ANTHROPIC_API_KEY is not set/s,
  );
});

test('UI preview covers every event type without inventing transaction signatures', async () => {
  const { previewScenarios } = await import('../components/preview-scenarios');
  const events = previewScenarios.complete.events;
  assert.deepEqual(new Set(events.map(e => e.type)), new Set(['thought', 'tool_call', 'tool_result', 'blocked', 'payment_required', 'payment_sent', 'data_delivered', 'done', 'offer', 'deal']));
  for (const scenario of Object.values(previewScenarios)) {
    for (const event of scenario.events) {
      if (event.type === 'payment_sent') assert.equal(event.signature, '');
    }
  }
  assert.equal(previewScenarios.empty.events.length, 0);
  assert.equal(previewScenarios.failure.status, 'interrupted');
});
