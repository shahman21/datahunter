import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEvent, readAgentStream, summarizeRun } from './agent-stream';
import { negotiationThreads } from './negotiation-threads';
import type { AgentEvent } from '../lib/data/types';

const buyer: AgentEvent = { type: 'offer', datasetId: 'ds-001', licenceKind: 'non-exclusive', from: 'buyer', speaker: 'Buyer agent', action: 'offer', priceUsdc: 0.03, listPriceUsdc: 0.04, message: 'Would you accept 0.03?', round: 1 };
const seller: AgentEvent = { ...buyer, from: 'seller', speaker: 'Example seller', action: 'counter', priceUsdc: 0.035, message: 'I can offer 0.035.' };
const deal: AgentEvent = { type: 'deal', datasetId: 'ds-001', licenceKind: 'non-exclusive', seller: 'Example seller', priceUsdc: 0.035, listPriceUsdc: 0.04 };

test('new negotiation tools, offers and deals survive the streamed protocol', async () => {
  const events: AgentEvent[] = [{ type: 'tool_call', name: 'negotiate_price', args: {} }, buyer, seller, deal, { type: 'done', summary: 'Agreed; not paid.' }];
  const body = events.map(event => JSON.stringify(event)).join('\n');
  const output: AgentEvent[] = [];
  await readAgentStream(new Response(body), event => output.push(event));
  assert.deepEqual(output, events);
  assert.equal(summarizeRun(output).spent, 0);
});

test('malformed negotiation events cannot be displayed as valid agreements', () => {
  for (const bad of [{ ...buyer, round: 0 }, { ...buyer, from: 'unknown' }, { ...buyer, action: 'invented' }, { ...deal, priceUsdc: -1 }, { ...deal, seller: null }]) assert.equal(isEvent(bad), false);
});

test('negotiation summaries keep separate datasets and licences, with exact messages', () => {
  const other: AgentEvent = { ...seller, datasetId: 'ds-002', message: 'A different conversation.' };
  const exclusive: AgentEvent = { ...buyer, licenceKind: 'exclusive' };
  const threads = negotiationThreads([buyer, seller, other, exclusive, deal]);
  assert.equal(threads.length, 3);
  assert.deepEqual(threads[0].offers.map(event => event.message), ['Would you accept 0.03?', 'I can offer 0.035.']);
  assert.equal(threads[0].deal?.priceUsdc, 0.035);
  assert.equal(threads[1].deal, undefined);
  assert.equal(threads[2].licenceKind, 'exclusive');
});
