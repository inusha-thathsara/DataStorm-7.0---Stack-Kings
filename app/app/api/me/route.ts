import { NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/auth/api";
import { isAuthBypassed } from "@/lib/auth/config";
import { getUserScope } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const scope = getUserScope(session);
    return NextResponse.json({
      userId: session.userId,
      role: session.role,
      scope,
      authRequired: !isAuthBypassed(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
