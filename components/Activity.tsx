import type { AgentEvent, ToolName } from "@/lib/data/types";

const labels: Record<ToolName, string> = {
  search_catalog: 'Finding datasets', get_sample: 'Inspecting sample',
  verify_provenance: 'Checking provenance', check_budget: 'Checking spending limits',
  purchase_dataset: 'Purchasing dataset', negotiate_price: 'Negotiating price',
};
const money = (amount: number) => amount.toLocaleString('en-GB', { maximumFractionDigits: 6 });
const explorer = (signature: string) => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;

export function Activity({ event, stopped = false, preview = false }: { event: AgentEvent; stopped?: boolean; preview?: boolean }) {
  switch (event.type) {
    case 'thought': return <p>{event.text}</p>;
    case 'tool_call': return <><strong>{labels[event.name]}</strong><details><summary>Tool details</summary><pre>{JSON.stringify(event.args, null, 2)}</pre></details></>;
    case 'tool_result': return <><strong>{labels[event.name]} · result</strong><p>{event.summary}</p></>;
    case 'blocked': return <><strong>{stopped ? 'Data hunt stopped' : 'Action blocked'}</strong><p>{event.reason}</p></>;
    case 'payment_required': return <><strong>Payment requested · {money(event.priceUsdc)} USDC</strong><p>{event.datasetId} · {event.licenceKind} licence · Solana devnet</p><small>Quote only — payment has not settled.</small></>;
    case 'payment_sent': return <><strong>{preview ? 'Payment simulated' : 'Payment settled'} · {money(event.amountUsdc)} USDC</strong><p>{event.datasetId}</p>{!preview && <a href={explorer(event.signature)} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}</>;
    case 'offer': return <><strong>{event.speaker} · {{ offer: 'Offer', counter: 'Counteroffer', accept: 'Accepted', reject: 'Rejected' }[event.action]} · {money(event.priceUsdc)} USDC</strong><p>{event.licenceKind} licence · round {event.round}</p><details><summary>Message</summary><p>{event.message}</p></details></>;
    case 'deal': return <><strong>Price agreed · {money(event.priceUsdc)} USDC</strong><p>{event.seller} · {event.licenceKind} licence</p><small>Agreement only. Payment and delivery are reported separately.</small></>;
    case 'data_delivered': return <><strong>Data delivered</strong><p>{event.datasetId} · {event.rows.toLocaleString()} rows · {event.licenceKind} licence</p></>;
    case 'done': return <><strong>Data hunt complete</strong><p>{event.summary}</p></>;
  }
}
