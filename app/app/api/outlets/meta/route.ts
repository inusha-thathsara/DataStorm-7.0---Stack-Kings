import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/auth/api";
import { getOutletMeta } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const province = request.nextUrl.searchParams.get("province") ?? undefined;
    const meta = await getOutletMeta({ province }, session);
    return NextResponse.json(meta);
  } catch (err) {
    return handleApiError(err);
  }
}
