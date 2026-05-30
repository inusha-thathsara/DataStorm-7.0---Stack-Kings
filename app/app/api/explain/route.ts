import { NextRequest, NextResponse } from "next/server";
import type { Outlet } from "@/lib/types";
import { buildTemplateExplanation, resolveHybridExplanation } from "@/lib/xai";

export async function POST(req: NextRequest) {
  let outlet: Outlet;
  try {
    outlet = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", explanation: "", source: "template" as const },
      { status: 400 }
    );
  }

  if (!outlet?.id) {
    return NextResponse.json(
      { error: "Missing outlet id", explanation: "", source: "template" as const },
      { status: 400 }
    );
  }

  try {
    const { explanation, source } = await resolveHybridExplanation(outlet);
    return NextResponse.json({ explanation, source });
  } catch (err) {
    console.error("[/api/explain]", err);
    return NextResponse.json({
      explanation: buildTemplateExplanation(outlet),
      source: "template" as const,
      warning: "LLM failed; used template fallback",
    });
  }
}
