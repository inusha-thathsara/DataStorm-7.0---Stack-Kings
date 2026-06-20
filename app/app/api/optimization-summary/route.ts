import { NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/auth/api";
import { getDataSource } from "@/lib/db/client";
import { getGeneratedAt, getOptimizationSummary } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const summary = await getOptimizationSummary();
    const generatedAt = await getGeneratedAt();
    return NextResponse.json({
      summary,
      generatedAt,
      dataSource: getDataSource(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
