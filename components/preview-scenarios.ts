import type { AgentEvent } from '../lib/data/types';

type Scenario = { label: string; status: 'idle' | 'running' | 'complete' | 'interrupted'; events: AgentEvent[]; error?: string };
export const previewGoal = 'Find current UK planning application text for a land-use model, preferably with an exclusive licence.';
const evaluation: AgentEvent[] = [
  { type: 'thought', text: 'I’ll look for current planning data, inspect a sample, and check the licence before spending.' },
  { type: 'tool_call', name: 'search_catalog', args: { query: 'UK planning applications', maxPriceUsdc: 0.2 } },
  { type: 'tool_result', name: 'search_catalog', summary: 'Found three candidates. The strongest match is UK planning applications at 0.04 USDC.' },
  { type: 'blocked', reason: 'Trust policy: the first candidate has a valid listing signature, but its licence prohibits model training. No sample was accessed and no payment was made.' },
  { type: 'thought', text: 'I’ll exclude that candidate and assess an alternative against the non-personal-data procurement policy.' },
  { type: 'tool_call', name: 'verify_provenance', args: { datasetId: 'example-planning' } },
  { type: 'tool_result', name: 'verify_provenance', summary: 'Example alternative: signature check passed. Reviewed non-personal, training-rights and UK processing evidence satisfies the pilot policy. All evidence in this preview is simulated.' },
  { type: 'tool_call', name: 'get_sample', args: { datasetId: 'example-planning' } },
  { type: 'tool_result', name: 'get_sample', summary: 'Sample includes application text, decision, authority and submission date. Newest row: 24 October 2026.' },
  { type: 'tool_call', name: 'check_budget', args: { datasetId: 'example-planning', licenceKind: 'exclusive' } },
  { type: 'blocked', reason: 'The exclusive licence costs 0.16 USDC, exceeding the 0.05 USDC exclusive-purchase ceiling.' },
  { type: 'thought', text: 'The exclusive licence is outside the spending limit. I’ll check the non-exclusive option instead.' },
  { type: 'tool_call', name: 'check_budget', args: { datasetId: 'example-planning', licenceKind: 'non-exclusive' } },
  { type: 'tool_result', name: 'check_budget', summary: 'Non-exclusive access at 0.04 USDC is within the budget and per-payment limit.' },
  { type: 'tool_call', name: 'negotiate_price', args: { datasetId: 'example-planning', licenceKind: 'non-exclusive', offerUsdc: 0.02, message: 'Can you offer non-exclusive access at 0.02 USDC?' } },
  { type: 'offer', datasetId: 'example-planning', licenceKind: 'non-exclusive', from: 'buyer', speaker: 'Buyer agent', action: 'offer', priceUsdc: 0.02, listPriceUsdc: 0.04, message: 'Can you offer non-exclusive access at 0.02 USDC?', round: 1 },
  { type: 'offer', datasetId: 'example-planning', licenceKind: 'non-exclusive', from: 'seller', speaker: 'Example seller', action: 'counter', priceUsdc: 0.03, listPriceUsdc: 0.04, message: 'I can offer the same non-exclusive terms at 0.03 USDC.', round: 1 },
  { type: 'tool_result', name: 'negotiate_price', summary: 'Seller countered at 0.03 USDC. No price is agreed yet.' },
  { type: 'tool_call', name: 'negotiate_price', args: { datasetId: 'example-planning', licenceKind: 'non-exclusive', offerUsdc: 0.03, message: 'I accept 0.03 USDC on those terms.' } },
  { type: 'offer', datasetId: 'example-planning', licenceKind: 'non-exclusive', from: 'buyer', speaker: 'Buyer agent', action: 'offer', priceUsdc: 0.03, listPriceUsdc: 0.04, message: 'I accept 0.03 USDC on those terms.', round: 2 },
  { type: 'offer', datasetId: 'example-planning', licenceKind: 'non-exclusive', from: 'seller', speaker: 'Example seller', action: 'accept', priceUsdc: 0.03, listPriceUsdc: 0.04, message: 'Agreed at 0.03 USDC. Payment and delivery remain separate steps.', round: 2 },
  { type: 'deal', datasetId: 'example-planning', licenceKind: 'non-exclusive', seller: 'Example seller', priceUsdc: 0.03, listPriceUsdc: 0.04 },
  { type: 'tool_result', name: 'negotiate_price', summary: 'A non-exclusive price of 0.03 USDC is agreed, reduced from the 0.04 USDC list price.' },
  { type: 'tool_call', name: 'purchase_dataset', args: { datasetId: 'example-planning', licenceKind: 'non-exclusive' } },
  { type: 'payment_required', datasetId: 'example-planning', priceUsdc: 0.03, licenceKind: 'non-exclusive', network: 'solana-devnet' },
];

// Only the labelled preview uses this fixture. Empty signature means no transaction
// occurred; the preview renderer never creates a receipt or explorer link for it.
export const previewScenarios: Record<'complete' | 'running' | 'failure' | 'empty', Scenario> = {
  complete: { label: 'All activity / success', status: 'complete', events: [
    ...evaluation,
    { type: 'payment_sent', datasetId: 'example-planning', amountUsdc: 0.03, signature: '' },
    { type: 'data_delivered', datasetId: 'example-planning', rows: 124800, licenceKind: 'non-exclusive' },
    { type: 'done', summary: 'Assembled 124,800 planning application records with a non-exclusive licence. Spent 0.03 of 0.20 USDC. Exclusive access was refused by the spending policy; the alternative passed the simulated trust checks.' },
  ] },
  running: { label: 'In progress', status: 'running', events: evaluation.slice(0, 6) },
  failure: { label: 'Payment failure', status: 'interrupted', error: 'Example failure: payment did not settle. No funds were spent and no data was delivered.', events: [
    ...evaluation,
    { type: 'blocked', reason: 'Payment did not settle because the buyer wallet has insufficient devnet USDC.' },
  ] },
  empty: { label: 'Empty state', status: 'idle', events: [] },
};
