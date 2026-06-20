import { NextRequest, NextResponse } from "next/server";
import { parseOutletQuery } from "@/lib/api/params";
import { handleApiError, requireSession } from "@/lib/auth/api";
import { listOutlets } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const params = parseOutletQuery(request.nextUrl.searchParams);
    const result = await listOutlets(params, session);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
