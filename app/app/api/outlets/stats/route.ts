import { NextRequest, NextResponse } from "next/server";
import { parseOutletQuery } from "@/lib/api/params";
import { handleApiError, requireSession } from "@/lib/auth/api";
import { getOutletStats } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const params = parseOutletQuery(request.nextUrl.searchParams);
    const stats = await getOutletStats(params, session);
    return NextResponse.json(stats);
  } catch (err) {
    return handleApiError(err);
  }
}
