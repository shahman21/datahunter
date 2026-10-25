export function negotiationPreview(amount: number) {
  const price = amount.toLocaleString('en-GB', { maximumFractionDigits: 6 });
  const messages = [
    { id: 'offer', speaker: 'Buyer agent', text: 'We need current UK planning application text. Can you offer an exclusive licence?' },
    { id: 'exclusive', speaker: 'Seller agent', text: 'Exclusive access is 0.16 USDC. Commercial model training is permitted.' },
    { id: 'counter', speaker: 'Buyer agent', text: `That exceeds our exclusive-licence limit. Can we take a non-exclusive licence at ${price} USDC instead? Please confirm the provenance.` },
    { id: 'terms', speaker: 'Seller agent', text: `Non-exclusive access is available at ${price} USDC, with commercial training permitted and attribution required. This example offer includes reviewed seller identity, listing integrity, non-personal classification and UK processing records.` },
    { id: 'accept', speaker: 'Buyer agent', text: 'Accept the non-exclusive offer. Payment must pass the separate spending and trust-policy checks; an agreement cannot override either gate.' },
    { id: 'confirm', speaker: 'Seller agent', text: 'Non-exclusive terms confirmed. The agreement does not itself settle payment or deliver data.' },
  ];
  return { messages, topics: [
    { title: 'Price', summary: `${price} USDC · non-exclusive offer`, messageIds: ['exclusive', 'counter', 'terms'] },
    { title: 'Licence', summary: 'Commercial training · attribution required', messageIds: ['offer', 'terms', 'confirm'] },
    { title: 'Provenance', summary: 'Example evidence reviewed · non-personal data', messageIds: ['counter', 'terms', 'accept'] },
    { title: 'Outcome', summary: 'Offer accepted · payment separate', messageIds: ['accept', 'confirm'] },
  ] };
}
