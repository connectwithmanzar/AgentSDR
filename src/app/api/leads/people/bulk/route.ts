import { NextRequest, NextResponse } from "next/server";
import { authContextErrorResponse, withOrgContext } from "@/lib/auth/context";
import { addPeopleToEmailCampaign } from "@/lib/leads/campaignAssignments";
import { setPersonDnc } from "@/lib/leads/deskRecords";

export async function POST(req: NextRequest) {
  try {
    return await withOrgContext(req, async (ctx) => {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON body is required" }, { status: 400 });
      const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === "string").slice(0, 200) : [];
      if (!ids.length) return NextResponse.json({ error: "Choose at least one person" }, { status: 400 });
      if (body.action === "dnc") {
        const on = body.on !== false;
        for (const id of ids) await setPersonDnc(id, on, ctx.userEmail ?? ctx.userId);
        return NextResponse.json({ updated: ids.length, sends: 0 });
      }
      if (body.action === "campaign") {
        if (typeof body.campaignId !== "string") return NextResponse.json({ error: "Choose a draft campaign" }, { status: 400 });
        try {
          const result = await addPeopleToEmailCampaign(body.campaignId, ids);
          return NextResponse.json({ ...result, sends: 0, campaignStarted: false });
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add people" }, { status: 409 });
        }
      }
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    });
  } catch (error) {
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}
