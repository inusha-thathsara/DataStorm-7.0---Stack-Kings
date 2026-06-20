import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/auth/api";
import { getOutletAccess } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    const access = await getOutletAccess(params.id, session);
    if (access.kind === "not_found") {
      return NextResponse.json({ error: `Outlet ${params.id} not found` }, { status: 404 });
    }
    if (access.kind === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ outlet: access.outlet });
  } catch (err) {
    return handleApiError(err);
  }
}
