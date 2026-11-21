import { NextRequest, NextResponse } from "next/server";
import { authContextErrorResponse, withOrgContext } from "@/lib/auth/context";
import { deletePersonRecord, getPersonRecord, LeadRecordError, patchPersonRecord, setPersonDnc } from "@/lib/leads/deskRecords";
import { listLeadActivity } from "@/lib/leads/activity";

type Params = { params: Promise<{ id: string }> };

function fail(error: unknown) {
  if (error instanceof LeadRecordError) return NextResponse.json({ error: error.message }, { status: error.status });
  const auth = authContextErrorResponse(error);
  if (auth) return auth;
  throw error;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    return await withOrgContext(req, async () => {
      const { id } = await params;
      const record = await getPersonRecord(id);
      const activity = await listLeadActivity("person", id);
      return NextResponse.json({ ...record, activity });
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    return await withOrgContext(req, async (ctx) => {
      const { id } = await params;
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON body is required" }, { status: 400 });
      if (typeof body.doNotContact === "boolean") {
        const policy = await setPersonDnc(id, body.doNotContact, ctx.userEmail);
        return NextResponse.json({ doNotContact: policy.doNotContact });
      }
      const person = await patchPersonRecord(id, body, ctx.userEmail);
      return NextResponse.json({ person });
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    return await withOrgContext(req, async () => {
      const { id } = await params;
      const removeIdleEnrollments = req.nextUrl.searchParams.get("removeFromCampaigns") === "1";
      const result = await deletePersonRecord(id, removeIdleEnrollments);
      return NextResponse.json(result);
    });
  } catch (error) {
    return fail(error);
  }
}
