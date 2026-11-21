import { NextRequest, NextResponse } from "next/server";
import { authContextErrorResponse, withOrgContext } from "@/lib/auth/context";
import { getDeskSettings, listAudit, recruiterDay, updateDeskSettings } from "@/lib/leads/deskSettings.server";

export async function GET(req: NextRequest) {
  try {
    return await withOrgContext(req, async (ctx) => {
      const view = req.nextUrl.searchParams.get("view");
      if (view === "day") return NextResponse.json(await recruiterDay());
      if (view === "audit") {
        const canSee = ctx.roles.includes("owner") || ctx.roles.includes("admin");
        if (!canSee) return NextResponse.json({ error: "Owners and admins can read the audit log" }, { status: 403 });
        return NextResponse.json({ events: await listAudit(req.nextUrl.searchParams.get("q") ?? undefined) });
      }
      const settings = await getDeskSettings();
      return NextResponse.json({
        candidateAtsUrl: settings.candidateAtsUrl,
        checklist: settings.checklist,
        checklistDismissed: Boolean(settings.checklistDismissedAt),
        canSeeFees: ctx.roles.includes("owner") || ctx.roles.includes("admin"),
      });
    });
  } catch (error) {
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return await withOrgContext(req, async (ctx) => {
      if (!ctx.roles.includes("owner") && !ctx.roles.includes("admin")) {
        return NextResponse.json({ error: "Owners and admins edit the candidate database link" }, { status: 403 });
      }
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON body is required" }, { status: 400 });
      const settings = await updateDeskSettings({
        candidateAtsUrl: typeof body.candidateAtsUrl === "string" || body.candidateAtsUrl === null ? body.candidateAtsUrl : undefined,
        checklist: body.checklist && typeof body.checklist === "object" ? body.checklist as Record<string, boolean> : undefined,
        dismissChecklist: body.dismissChecklist === true,
      });
      return NextResponse.json({ candidateAtsUrl: settings.candidateAtsUrl, checklistDismissed: Boolean(settings.checklistDismissedAt) });
    });
  } catch (error) {
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    const message = error instanceof Error ? error.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
