import { getSample } from "@/lib/agent/tools";

// GET /api/datasets/:id/sample -> 20 redacted rows, free, so the agent can judge quality
// and freshness before it spends anything.

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = getSample(id);
  if ("error" in sample) return Response.json(sample, { status: 404 });
  return Response.json(sample, { headers: { "cache-control": "no-store" } });
}
