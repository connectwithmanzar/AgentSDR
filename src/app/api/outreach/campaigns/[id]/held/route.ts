import { NextRequest, NextResponse } from "next/server";
import { authContextErrorResponse, withOrgContext } from "@/lib/auth/context";
import { approveHeldLeads } from "@/lib/publicApi/draftLeads.server";

/** Moves held drafts to pending. Does not start the campaign and does not send. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await withOrgContext(req, async () => {
      const { id } = await params;
      const body = await req.json().catch(() => ({}));
      const leadIds = body && Array.isArray(body.leadIds) ? body.leadIds.filter((item: unknown) => typeof item === "string") : [];
      const result = await approveHeldLeads(id, leadIds);
      if (!result.found) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      return NextResponse.json({ approved: result.approved, campaignStarted: false, sends: 0 });
    });
  } catch (error) {
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}
