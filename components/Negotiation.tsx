import type { NegotiationThread, OfferEvent } from './negotiation-threads';

const money = (amount: number) => amount.toLocaleString('en-GB', { maximumFractionDigits: 6 });
const actionLabels = { offer: 'Offer', counter: 'Counteroffer', accept: 'Accepted', reject: 'Rejected' };

export function Negotiation({ thread, example = false }: { thread: NegotiationThread; example?: boolean }) {
  const { offers, deal } = thread;
  const lastOffer = offers.at(-1);
  const price = deal ? `${money(deal.priceUsdc)} USDC agreed` : lastOffer ? `${money(lastOffer.priceUsdc)} USDC · latest ${actionLabels[lastOffer.action].toLowerCase()}` : 'Awaiting an offer';
  const outcome = deal ? 'Price agreed · payment separate' : 'No agreed price yet';
  function transcript(messages: OfferEvent[] = offers) {
    return messages.length ? <ol className="negotiation-transcript">{messages.map((message, index) => <li key={index}><strong>{message.speaker} · {actionLabels[message.action]} · round {message.round}</strong><p>{money(message.priceUsdc)} USDC</p><p>{message.message}</p></li>)}</ol> : <p className="negotiation-empty">No conversation messages were received.</p>;
  }
  return <section className="negotiation-card" aria-label={`${example ? 'Example' : 'Live'} agent negotiation for ${thread.datasetId}`}>
    <header><div className="negotiation-icon" aria-hidden="true">⇄</div><div><h3>Agent negotiation</h3><p>{thread.datasetId} · {example ? 'Example conversation' : thread.seller ?? 'Seller agent'}</p></div></header>
    <div className="negotiation-topics">
      <details><summary><span>Price<strong>{price}</strong></span><span className="negotiation-chevron" aria-hidden="true">＋</span></summary>{transcript()}{deal && <p className="negotiation-note">Listed at {money(deal.listPriceUsdc)} USDC. Agreed prices are not counted as settled spending.</p>}</details>
      <details><summary><span>Licence<strong>{thread.licenceKind} licence requested</strong></span><span className="negotiation-chevron" aria-hidden="true">＋</span></summary>{transcript()}<p className="negotiation-note">These are the messages received for this licence. Usage rights and trust evidence are assessed separately.</p></details>
      <details><summary><span>Participants<strong>Buyer agent ↔ {thread.seller ?? 'Seller agent'}</strong></span><span className="negotiation-chevron" aria-hidden="true">＋</span></summary>{transcript()}</details>
      <details><summary><span>Outcome<strong>{outcome}</strong></span><span className="negotiation-chevron" aria-hidden="true">＋</span></summary>{transcript(offers.filter(offer => offer.action === 'accept' || offer.action === 'reject'))}{deal && <p className="negotiation-note">{deal.seller} agreed {money(deal.priceUsdc)} USDC for a {deal.licenceKind} licence. Payment and delivery must be confirmed by their own events.</p>}</details>
    </div>
    <details className="negotiation-full"><summary>Full conversation <span>{offers.length} messages</span></summary>{transcript()}</details>
  </section>;
}
