import { NextRequest, NextResponse } from "next/server";
import { authContextErrorResponse, withOrgContext } from "@/lib/auth/context";
import { isLeadEntity } from "@/lib/leads/types";
import { deleteSavedView, listSavedViews, saveLeadView } from "@/lib/leads/savedViews";
import type { FieldFilter } from "@/lib/leads/filters";

export async function GET(req: NextRequest) {
  try {
    return await withOrgContext(req, async (ctx) => {
      const entity = req.nextUrl.searchParams.get("entity") ?? "person";
      if (!isLeadEntity(entity)) return NextResponse.json({ error: "entity must be person or company" }, { status: 400 });
      const views = await listSavedViews(ctx.userId, entity);
      return NextResponse.json({ views });
    });
  } catch (error) {
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    return await withOrgContext(req, async (ctx) => {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || typeof body.name !== "string" || !isLeadEntity(body.entity)) {
        return NextResponse.json({ error: "name and entity are required" }, { status: 400 });
      }
      const view = await saveLeadView(ctx.userId, {
        name: body.name,
        entity: body.entity,
        columns: Array.isArray(body.columns) ? body.columns.filter((item: unknown) => typeof item === "string") : [],
        filters: Array.isArray(body.filters) ? body.filters as FieldFilter[] : [],
        sortKey: typeof body.sortKey === "string" ? body.sortKey : "updated",
        sortDirection: body.sortDirection === "asc" ? "asc" : "desc",
        isDefault: body.isDefault === true,
      });
      return NextResponse.json({ view }, { status: 201 });
    });
  } catch (error) {
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    return await withOrgContext(req, async (ctx) => {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const removed = await deleteSavedView(ctx.userId, id);
      if (!removed) return NextResponse.json({ error: "View not found" }, { status: 404 });
      return NextResponse.json({ deleted: true });
    });
  } catch (error) {
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}
