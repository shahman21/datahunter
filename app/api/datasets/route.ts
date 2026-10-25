import { CATALOG } from "@/lib/data/catalog";
import { provenanceOf } from "@/lib/agent/tools";

// GET /api/datasets -> DatasetListing[], free.
//
// The listing is public and so is its provenance status, because a buyer has to be able to
// judge whether a seller is worth paying before any money moves.

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    CATALOG.map((dataset) => ({ ...dataset, provenanceStatus: provenanceOf(dataset).status })),
    { headers: { "cache-control": "no-store" } },
  );
}
