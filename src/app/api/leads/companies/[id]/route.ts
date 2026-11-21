import { NextRequest, NextResponse } from "next/server";
import { authContextErrorResponse, withOrgContext } from "@/lib/auth/context";
import { listLeadActivity } from "@/lib/leads/activity";
import { deleteCompanyRecord, getCompanyRecord, LeadRecordError, patchCompanyRecord } from "@/lib/leads/deskRecords";

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
      const record = await getCompanyRecord(id);
      const activity = await listLeadActivity("company", id);
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
      const company = await patchCompanyRecord(id, body, ctx.userEmail);
      return NextResponse.json({ company });
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    return await withOrgContext(req, async () => {
      const { id } = await params;
      return NextResponse.json(await deleteCompanyRecord(id));
    });
  } catch (error) {
    return fail(error);
  }
}
