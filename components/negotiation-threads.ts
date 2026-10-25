import type { AgentEvent, LicenceKind } from '../lib/data/types';

export type OfferEvent = Extract<AgentEvent, { type: 'offer' }>;
export type DealEvent = Extract<AgentEvent, { type: 'deal' }>;
export type NegotiationThread = {
  key: string;
  datasetId: string;
  licenceKind: LicenceKind;
  seller?: string;
  offers: OfferEvent[];
  deal?: DealEvent;
};

export function negotiationThreads(events: AgentEvent[]): NegotiationThread[] {
  const threads = new Map<string, NegotiationThread>();
  for (const event of events) {
    if (event.type !== 'offer' && event.type !== 'deal') continue;
    const key = `${event.datasetId}:${event.licenceKind}`;
    let thread = threads.get(key);
    if (!thread) {
      thread = { key, datasetId: event.datasetId, licenceKind: event.licenceKind, offers: [] };
      threads.set(key, thread);
    }
    if (event.type === 'deal') { thread.deal = event; thread.seller = event.seller; }
    else { thread.offers.push(event); if (event.from === 'seller') thread.seller = event.speaker; }
  }
  return [...threads.values()];
}
