import { NextResponse } from "next/server";
import { checkDbHealth } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkDbHealth();
  const status = health.ok ? 200 : 503;
  return NextResponse.json(health, { status });
}
