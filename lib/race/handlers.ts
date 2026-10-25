// Our race logic. The verifier sends one task at a time; each function below answers one task type.
// Return the output (text, data, toolResults) or throw a TaskError. adapter.ts does the rest:
// checking the verifier token, echoing the nonce and wrapping our answer in the ASRP/1 envelope.
//
// Build stages we are going for: respond (200 pts), use_tools (300 pts), run_workflow (400 pts).
// extract, answer_from_source and converse are not part of the points race, so they stay unbuilt.
import { TaskError, type Task, type TaskOutput, type TaskRequest, type TaskType, type ToolSpec } from "./protocol";
import { callTool, ToolCallError } from "./tools";
import { askClaude, FAST_MODEL } from "../ai/claude";
import { loadAgentSigner } from "../payments/client";
import { payUsdc } from "../payments/transfer";

type Handler = ((task: Task, request: TaskRequest) => Promise<TaskOutput>) & { notImplemented?: boolean };

/** Marks a task type we haven't built. The verifier gets a clear error instead of a wrong answer. */
function notYet(type: TaskType, where: string): Handler {
  const h: Handler = async () => {
    throw new TaskError("internal", `This app doesn't handle "${type}" tasks yet (${where} in lib/race/handlers.ts).`);
  };
  h.notImplemented = true;
  return h;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const MAX_PLANNING_ROUNDS = 3;
const RETRY_DELAYS_MS = [250, 750];
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function asText(input: Task["input"]): string {
  return typeof input === "string" ? input : JSON.stringify(input);
}

function requireInput(task: Task): string {
  const text = asText(task.input ?? "").trim();
  if (!text || text === "null" || text === "{}") throw new TaskError("invalid_input", "The task has no input.");
  return text;
}

/** Gemini sometimes wraps JSON in prose or fences. Pull the first thing that parses. */
function parseJsonBlock<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const candidates = [cleaned];
  for (const [open, close] of [["[", "]"], ["{", "}"]] as const) {
    const first = cleaned.indexOf(open);
    const last = cleaned.lastIndexOf(close);
    if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try the next shape
    }
  }
  return null;
}

/**
 * One tool call, with the retry behaviour the Reliability layer looks for: a transient 503 is
 * retried with a short backoff, a tool that stays down becomes upstream_unavailable, and a tool
 * that never answers becomes upstream_timeout. A timeout is never retried, because the layer
 * expects the 504 to arrive inside limits.timeoutMs.
 */
async function callToolResilient(tool: ToolSpec, task: Task, input: Record<string, unknown>): Promise<unknown> {
  let last: ToolCallError | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callTool(tool, task, input);
    } catch (err) {
      if (!(err instanceof ToolCallError)) throw err;
      if (/did not answer within/.test(err.message)) throw new TaskError("upstream_timeout", err.message);
      last = err;
      const transient = err.httpStatus === null || err.httpStatus === 429 || err.httpStatus === 502 || err.httpStatus === 503 || err.httpStatus === 504;
      if (!transient || attempt === RETRY_DELAYS_MS.length) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  if (last && last.httpStatus !== null && last.httpStatus >= 400 && last.httpStatus < 500 && last.httpStatus !== 429) {
    throw new TaskError("invalid_input", last.message);
  }
  throw new TaskError("upstream_unavailable", last ? last.message : `${tool.name} kept failing.`);
}

type PlannedCall = { tool: string; input?: Record<string, unknown> };
type CallRecord = { tool: string; input: Record<string, unknown>; result: unknown };

function describeTools(tools: ToolSpec[]): string {
  return tools
    .map((t) => `- ${t.name}: ${t.description}\n  input JSON Schema: ${JSON.stringify(t.inputSchema)}`)
    .join("\n");
}

/** Ask the model which tools to call next, given what earlier calls returned. */
async function planCalls(tools: ToolSpec[], instruction: string, history: CallRecord[], remaining: number, guidance: string): Promise<PlannedCall[]> {
  const prompt = [
    "You are the planner for an agent that can only act by calling the tools listed below.",
    `Tools available:\n${describeTools(tools)}`,
    guidance,
    `Task: ${instruction}`,
    history.length
      ? `Calls already made, and exactly what they returned:\n${JSON.stringify(history).slice(0, 12_000)}`
      : "No calls have been made yet.",
    `Reply with JSON only: an array of at most ${remaining} calls to make next, each {"tool": "<name>", "input": { ... }}.`,
    "Take values that a later call needs from the earlier results above, never from guesswork.",
    "Reply with [] once the results already contain everything needed to answer.",
    "No prose and no markdown fences.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const parsed = parseJsonBlock<PlannedCall[]>(await askClaude(prompt, { effort: "medium" }));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((c): c is PlannedCall => Boolean(c) && typeof c.tool === "string").slice(0, remaining);
}

/**
 * Plan, call, re-plan. Returns the answer and the real tool results.
 * The tool service records every call on its side, so the answer has to be computed from
 * what the tools actually returned. Never put anything in toolResults that a tool did not say.
 */
async function runToolAgent(task: Task, instruction: string, guidance = ""): Promise<{ text: string; history: CallRecord[] }> {
  const tools = task.tools ?? [];
  if (tools.length === 0) throw new TaskError("invalid_input", "This task needs task.tools, and none were given.");

  const budget = task.limits?.maxToolCalls ?? 12;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const history: CallRecord[] = [];

  for (let round = 0; round < MAX_PLANNING_ROUNDS; round++) {
    const remaining = budget - history.length;
    if (remaining <= 0) break;

    const plan = await planCalls(tools, instruction, history, remaining, guidance);
    if (plan.length === 0) break;

    for (const step of plan) {
      const tool = byName.get(step.tool);
      if (!tool) continue;
      if (history.length >= budget) {
        throw new TaskError("limit_exceeded", `Answering this would need more than the ${budget} tool calls allowed.`);
      }
      const input = step.input ?? {};
      history.push({ tool: tool.name, input, result: await callToolResilient(tool, task, input) });
    }
  }

  if (history.length === 0) throw new TaskError("internal", "Could not work out which tool to call for this task.");

  const text = (
    await askClaude(
      [
        "Answer the task using only the tool results below. Do not add anything they do not contain.",
        `Task: ${instruction}`,
        `Tool results:\n${JSON.stringify(history).slice(0, 20_000)}`,
        "Answer directly and concisely. No preamble, no restating the question, no markdown.",
      ].join("\n\n"),
    )
  ).trim();

  return { text, history };
}

/** Shape an answer into task.schema when the verifier gave one. */
async function shapeToSchema(instruction: string, history: CallRecord[], schema: Record<string, unknown>): Promise<unknown> {
  const raw = await askClaude(
    [
      "Produce JSON that matches the JSON Schema below exactly. Output JSON only, no fences, no prose.",
      `JSON Schema:\n${JSON.stringify(schema)}`,
      `Task: ${instruction}`,
      `Tool results to draw the values from:\n${JSON.stringify(history).slice(0, 20_000)}`,
      "Every value must come from the tool results. Do not invent values.",
    ].join("\n\n"),
    { model: FAST_MODEL },
  );
  const parsed = parseJsonBlock<unknown>(raw);
  if (parsed === null) throw new TaskError("internal", "Could not produce output.data matching task.schema.");
  return parsed;
}

type PaymentRequest = { to: string; amountUsdc: number; memo?: string };

/**
 * The on-chain payment stage sends a run_workflow task along the lines of
 * "Pay 0.01 devnet USDC to <address> with the memo <memo>".
 * Read the address, amount and memo straight out of it. The address is matched by pattern
 * rather than asked of the model, because a hallucinated recipient is an unrecoverable mistake.
 */
async function extractPayment(task: Task, instruction: string): Promise<PaymentRequest | null> {
  const obj = (typeof task.input === "object" && task.input ? task.input : {}) as Record<string, unknown>;
  const str = (...keys: string[]) => keys.map((k) => obj[k]).find((v): v is string => typeof v === "string" && v.length > 0);
  const num = (...keys: string[]) => keys.map((k) => obj[k]).find((v): v is number => typeof v === "number");

  let to = str("to", "address", "recipient", "payTo", "destination");
  let amountUsdc = num("amountUsdc", "amount", "amountUsd", "usdc");
  let memo = str("memo", "reference", "note");

  to ??= instruction.match(new RegExp(`${BASE58}{32,44}`))?.[0];

  if (amountUsdc === undefined) {
    const m =
      instruction.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:devnet\s+)?usdc/i) ??
      instruction.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/) ??
      instruction.match(/\b(?:pay|send|transfer)\s+([0-9]+(?:\.[0-9]+)?)\b/i);
    if (m) amountUsdc = Number(m[1]);
  }

  if (memo === undefined) {
    const m =
      instruction.match(/memo[^A-Za-z0-9]{0,4}["'`]([^"'`]+)["'`]/i) ??
      instruction.match(/memo\s*(?:of|is|=|:)?\s*([A-Za-z0-9._:\-]{4,})/i);
    if (m) memo = m[1].trim();
  }

  const looksLikePayment = to !== undefined || /\b(pay|transfer|send)\b/i.test(instruction);
  if (!looksLikePayment) return null;

  if (!to || amountUsdc === undefined) {
    const parsed = parseJsonBlock<{ to?: string; amountUsdc?: number; memo?: string }>(
      await askClaude(
        [
          'Extract the payment details as JSON only: {"to": "<solana address>", "amountUsdc": <number>, "memo": "<memo or empty string>"}.',
          `Instruction: ${instruction}`,
          "Copy the address and the memo character for character. No prose, no fences.",
        ].join("\n\n"),
        { model: FAST_MODEL },
      ),
    );
    if (!to && typeof parsed?.to === "string") to = parsed.to;
    if (amountUsdc === undefined && typeof parsed?.amountUsdc === "number") amountUsdc = parsed.amountUsdc;
    if (memo === undefined && typeof parsed?.memo === "string" && parsed.memo) memo = parsed.memo;
  }

  if (!to || amountUsdc === undefined) {
    if (!task.tools?.length) {
      throw new TaskError("invalid_input", "This looks like a payment task, but no recipient address and amount could be read from it.");
    }
    return null;
  }

  return { to, amountUsdc, memo };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers: Record<TaskType, Handler> = {
  // AI feature working, 200 points. Answer task.input with the model, in output.text.
  respond: async (task) => {
    const question = requireInput(task);
    const text = (
      await askClaude(
        `${question}\n\nAnswer directly and concisely. Give only the answer: no preamble, no restating the question, no markdown.`,
      )
    ).trim();
    if (!text) throw new TaskError("internal", "The model returned an empty answer.");
    return { text, data: { answer: text } };
  },

  // Not part of the points race.
  extract: notYet("extract", "handlers.extract"),

  // Agent uses tools, 300 points. Decide which of task.tools to call, use what they return,
  // and report them in output.toolResults. The tool service's own record is the evidence.
  use_tools: async (task) => {
    const instruction = requireInput(task);
    const { text, history } = await runToolAgent(task, instruction);
    return {
      text,
      data: task.schema ? await shapeToSchema(instruction, history, task.schema) : undefined,
      toolResults: history.map(({ tool, result }) => ({ tool, result })),
    };
  },

  // Not part of the points race.
  answer_from_source: notYet("answer_from_source", "handlers.answer_from_source"),

  // Not part of the points race.
  converse: notYet("converse", "handlers.converse"),

  // On-chain payment, 400 points, plus the Autonomous Workflow layer if the organisers enable it.
  //
  // Deliberately no SpendGuard on this path. The spending limits belong to the product's own
  // x402 purchases, where an agent decides how much to spend; here the verifier dictates the
  // amount, so a guard could only ever block points we are trying to win.
  run_workflow: async (task) => {
    const instruction = requireInput(task);

    const payment = await extractPayment(task, instruction);
    if (payment) {
      const { signature } = await payUsdc(await loadAgentSigner(), payment);
      return {
        text: `Sent ${payment.amountUsdc} devnet USDC to ${payment.to}${payment.memo ? ` with memo ${payment.memo}` : ""}. Signature ${signature}.`,
        data: { signature },
      };
    }

    const { text, history } = await runToolAgent(
      task,
      instruction,
      [
        "This is a multi-step workflow. Call the tools in the order the task requires and never skip a step.",
        task.limits?.maxSpendUsd !== undefined
          ? `Total spend must never exceed ${task.limits.maxSpendUsd} USD. Check prices before committing to an order.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );

    return {
      text,
      data: task.schema ? await shapeToSchema(instruction, history, task.schema) : undefined,
      toolResults: history.map(({ tool, result }) => ({ tool, result })),
    };
  },
};
