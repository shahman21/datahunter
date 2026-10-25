import { runAgent } from "@/lib/agent/loop";
import type { AgentBrief } from "@/lib/data/types";

// POST /api/agent -> newline-delimited AgentEvent objects, streamed as they happen.
// Zachary: read it with a ReadableStream reader and split on "\n"; every line is one
// AgentEvent exactly as lib/data/types.ts declares it.

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let brief: AgentBrief;
  try {
    const body = (await request.json()) as Partial<AgentBrief>;
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    const budgetUsdc = typeof body.budgetUsdc === "number" ? body.budgetUsdc : NaN;
    if (!goal) return Response.json({ error: "goal is required" }, { status: 400 });
    if (!Number.isFinite(budgetUsdc) || budgetUsdc <= 0) {
      return Response.json({ error: "budgetUsdc must be a positive number" }, { status: 400 });
    }
    brief = { goal, budgetUsdc };
  } catch {
    return Response.json({ error: "expected JSON { goal, budgetUsdc }" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent(brief)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "blocked", reason })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
