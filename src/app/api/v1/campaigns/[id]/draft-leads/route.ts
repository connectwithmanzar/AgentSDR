import { NextRequest, NextResponse } from "next/server";
import { campaignIdParam, jsonBody, withApiKey } from "@/lib/publicApi/http";
import { parseDraftLeadsBody } from "@/lib/publicApi/draftLeads";
import { importDraftLead } from "@/lib/publicApi/draftLeads.server";
import { PublicApiError } from "@/lib/publicApi/requests";

// POST /api/v1/campaigns/:id/draft-leads
// Holds per-lead copy. Never starts the campaign and never sends mail.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApiKey(req, "campaigns:write", async () => {
    const campaignId = campaignIdParam((await params).id);
    let parsed: ReturnType<typeof parseDraftLeadsBody>;
    try {
      parsed = parseDraftLeadsBody(await jsonBody(req));
    } catch (error) {
      throw new PublicApiError(400, error instanceof Error ? error.message : "Invalid body");
    }
    const results = [];
    for (const lead of parsed.leads) {
      results.push(await importDraftLead(campaignId, lead, parsed.allowActiveCampaign));
    }
    return NextResponse.json({
      total: results.length,
      created: results.filter((row) => row.status === "created").length,
      updated: results.filter((row) => row.status === "updated").length,
      rejected: results.filter((row) => row.status === "rejected").length,
      results,
      sends: 0,
      campaignStarted: false,
    });
  });
}
