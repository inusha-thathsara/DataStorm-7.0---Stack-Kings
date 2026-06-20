import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserScope } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const scope = getUserScope(session);
  return NextResponse.json({
    userId: session.userId,
    role: session.role,
    scope,
    authRequired: false,
  });
}
