import { NextRequest, NextResponse } from "next/server";
import { authContextErrorResponse, withOrgContext } from "@/lib/auth/context";
import { findPeopleAtCompany, findPeopleProviders, saveFoundPeople, type FoundPerson } from "@/lib/leads/findPeople.server";
import { getCompanyRecord, LeadRecordError } from "@/lib/leads/deskRecords";
import { addPeopleToEmailCampaign } from "@/lib/leads/campaignAssignments";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    return await withOrgContext(req, async () => {
      await getCompanyRecord((await params).id);
      return NextResponse.json(await findPeopleProviders());
    });
  } catch (error) {
    if (error instanceof LeadRecordError) return NextResponse.json({ error: error.message }, { status: error.status });
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    return await withOrgContext(req, async () => {
      const company = await getCompanyRecord((await params).id);
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON body is required" }, { status: 400 });
      if (body.enroll === true) {
        const ids = Array.isArray(body.personIds) ? body.personIds.filter((id: unknown) => typeof id === "string") : [];
        if (typeof body.campaignId !== "string") return NextResponse.json({ error: "Choose a campaign" }, { status: 400 });
        const result = await addPeopleToEmailCampaign(body.campaignId, ids);
        return NextResponse.json(result);
      }
      const provider = body.provider === "hunter" ? "hunter" : body.provider === "apollo" ? "apollo" : null;
      const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim() : "";
      if (!provider || !jobTitle) return NextResponse.json({ error: "Choose Apollo or Hunter and a job title" }, { status: 400 });
      try {
        const people = await findPeopleAtCompany({ domain: company.company.domain, jobTitle, provider });
        if (body.save === true) {
          const chosen = Array.isArray(body.indexes)
            ? body.indexes.filter((index: unknown): index is number => typeof index === "number").map((index: number) => people[index]).filter((person: FoundPerson | undefined): person is FoundPerson => Boolean(person))
            : people;
          const personIds = await saveFoundPeople({ domain: company.company.domain, companyName: company.company.name, people: chosen });
          return NextResponse.json({ people, personIds });
        }
        return NextResponse.json({ people });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed" }, { status: 409 });
      }
    });
  } catch (error) {
    if (error instanceof LeadRecordError) return NextResponse.json({ error: error.message }, { status: error.status });
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}
