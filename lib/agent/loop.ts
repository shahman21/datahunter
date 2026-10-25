import "server-only";
import { askClaude } from "../ai/claude";
import type { AgentBrief, AgentEvent, LicenceKind, ToolName } from "../data/types";
import {
  checkBudget,
  getSample,
  newLedger,
  purchaseDataset,
  searchCatalog,
  TOOL_CATALOGUE,
  verifyProvenance,
  type RunLedger,
} from "./tools";

// The product agent. One tool call per step, so the console has something to narrate and the
// room can watch it think, get refused, and re-plan. Every refusal below comes from a server
// side limit, never from the model deciding to behave.

const MAX_STEPS = 12;

type Step =
  | { tool: ToolName; args: Record<string, unknown>; status: string }
  | { done: true; status: string; summary: string };

function parseJsonBlock<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  for (const candidate of [cleaned, first >= 0 && last > first ? cleaned.slice(first, last + 1) : ""]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try the next shape
    }
  }
  return null;
}

function asLicenceKind(value: unknown): LicenceKind {
  return value === "exclusive" ? "exclusive" : "non-exclusive";
}

function systemBrief(brief: AgentBrief, ledger: RunLedger): string {
  return [
    "You are a procurement agent buying training data for a company. You act only by calling one tool at a time.",
    `The brief: ${brief.goal}`,
    `Your budget for this run is ${brief.budgetUsdc} devnet USDC. Limits you cannot talk your way past, enforced outside you:`,
    `- no single payment above ${ledger.maxPaymentUsdc} USDC`,
    `- no exclusive licence above ${ledger.maxExclusiveUsdc} USDC`,
    `- never buy a dataset whose provenance is unsigned`,
    "Provenance has three states and they are not the same thing. `unsigned` means the listing claims no seller identity at all: never buy it, whatever the price. `pending` means the seller is named but has not issued a signature yet: you may buy it where the brief needs it, and you must say so in your summary. `verified` means a signature was checked and holds.",
    "Tools:",
    ...TOOL_CATALOGUE.map((t) => `- ${t.name}: ${t.description} args ${t.args}`),
    "Work like a buyer who will have to defend the spend: sample before paying, verify provenance, and check the budget before committing.",
    "Consider an exclusive licence only where the brief genuinely needs a competitor locked out, and accept a refusal rather than arguing with it.",
    "Stop when the brief is covered or nothing affordable is left.",
  ].join("\n");
}

/**
 * Runs the brief, yielding events as they happen so the interface can stream them.
 */
export async function* runAgent(brief: AgentBrief): AsyncGenerator<AgentEvent> {
  const ledger = newLedger(brief.budgetUsdc);
  const transcript: string[] = [];

  yield { type: "thought", text: `Brief received. Budget ${brief.budgetUsdc} USDC, single payment capped at ${ledger.maxPaymentUsdc}, exclusive licences capped at ${ledger.maxExclusiveUsdc}.` };

  for (let step = 0; step < MAX_STEPS; step++) {
    const prompt = [
      systemBrief(brief, ledger),
      transcript.length ? `What has happened so far:\n${transcript.join("\n")}` : "Nothing has happened yet.",
      `Spent so far: ${ledger.spentUsdc.toFixed(3)} of ${ledger.budgetUsdc} USDC. Datasets bought: ${ledger.purchased.length}.`,
      'Reply with JSON only, either {"status": "<one short sentence for the operator console describing the action you are taking>", "tool": "<name>", "args": { ... }} or {"status": "...", "done": true, "summary": "what you assembled and what you deliberately did not buy"}.',
      "No prose and no markdown fences.",
    ].join("\n\n");

    const decision = parseJsonBlock<Step & Record<string, unknown>>(await askClaude(prompt, { effort: "low" }));

    if (!decision) {
      yield { type: "blocked", reason: "Could not read the agent's next step." };
      return;
    }

    if ("done" in decision && decision.done) {
      if (decision.status) yield { type: "thought", text: String(decision.status) };
      yield { type: "done", summary: String(decision.summary ?? "Finished.") };
      return;
    }

    const tool = (decision as { tool?: ToolName }).tool;
    const args = ((decision as { args?: Record<string, unknown> }).args ?? {}) as Record<string, unknown>;
    if (!tool || !TOOL_CATALOGUE.some((t) => t.name === tool)) {
      yield { type: "blocked", reason: `The agent asked for a tool that does not exist: ${String(tool)}.` };
      return;
    }

    if (decision.status) yield { type: "thought", text: String(decision.status) };
    yield { type: "tool_call", name: tool, args };

    const datasetId = typeof args.datasetId === "string" ? args.datasetId : "";

    switch (tool) {
      case "search_catalog": {
        const results = searchCatalog(String(args.query ?? brief.goal), typeof args.maxPriceUsdc === "number" ? args.maxPriceUsdc : undefined);
        const summary = `${results.length} candidates: ${results.map((r) => `${r.id} ${r.title} at ${r.priceUsdc} (${r.provenance}, fresh to ${r.freshness})`).join("; ")}`;
        transcript.push(`search_catalog -> ${summary}`);
        yield { type: "tool_result", name: tool, summary };
        break;
      }

      case "get_sample": {
        const sample = getSample(datasetId);
        const summary = "error" in sample
          ? String(sample.error)
          : `${sample.rowsShown} of ${sample.totalRows} rows, fields ${sample.fields.join(", ")}, newest row ${sample.freshness}`;
        transcript.push(`get_sample ${datasetId} -> ${summary}`);
        yield { type: "tool_result", name: tool, summary };
        break;
      }

      case "verify_provenance": {
        const result = verifyProvenance(datasetId);
        const summary = "error" in result ? String(result.error) : `${result.status}. ${result.detail}`;
        transcript.push(`verify_provenance ${datasetId} -> ${summary}`);
        yield { type: "tool_result", name: tool, summary };
        break;
      }

      case "check_budget": {
        const licenceKind = asLicenceKind(args.licenceKind);
        const verdict = checkBudget(ledger, datasetId, licenceKind);
        const summary = `${verdict.allowed ? "allowed" : "refused"} at ${verdict.priceUsdc} USDC. ${verdict.reason}`;
        transcript.push(`check_budget ${datasetId} ${licenceKind} -> ${summary}`);
        yield { type: "tool_result", name: tool, summary };
        if (!verdict.allowed) yield { type: "blocked", reason: verdict.reason };
        break;
      }

      case "purchase_dataset": {
        const licenceKind = asLicenceKind(args.licenceKind);
        const verdict = checkBudget(ledger, datasetId, licenceKind);
        if (!verdict.allowed) {
          transcript.push(`purchase_dataset ${datasetId} ${licenceKind} -> refused. ${verdict.reason}`);
          yield { type: "tool_result", name: tool, summary: `refused. ${verdict.reason}` };
          yield { type: "blocked", reason: verdict.reason };
          break;
        }

        yield { type: "payment_required", datasetId, priceUsdc: verdict.priceUsdc, licenceKind, network: "solana-devnet" };
        const result = await purchaseDataset(ledger, datasetId, licenceKind);

        if (!result.ok || !result.signature) {
          transcript.push(`purchase_dataset ${datasetId} ${licenceKind} -> failed. ${result.reason}`);
          yield { type: "tool_result", name: tool, summary: `payment did not settle. ${result.reason}` };
          yield { type: "blocked", reason: result.reason ?? "Payment did not settle." };
          break;
        }

        yield { type: "payment_sent", datasetId, signature: result.signature, amountUsdc: result.amountUsdc };
        yield { type: "data_delivered", datasetId, rows: result.rows ?? 0, licenceKind };
        transcript.push(`purchase_dataset ${datasetId} ${licenceKind} -> settled ${result.amountUsdc} USDC, signature ${result.signature}, ${result.rows} rows delivered`);
        yield { type: "tool_result", name: tool, summary: `settled ${result.amountUsdc} USDC. ${result.rows} rows delivered. ${result.explorerUrl}` };
        break;
      }
    }
  }

  yield { type: "done", summary: `Stopped after ${MAX_STEPS} steps. Spent ${ledger.spentUsdc.toFixed(3)} USDC across ${ledger.purchased.length} datasets.` };
}
