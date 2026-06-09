import { NextRequest, NextResponse } from "next/server";
import type { Outlet } from "@/lib/types";
import { buildTemplateExplanation, resolveHybridExplanation } from "@/lib/xai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExplainRequestBody = {
  outlet?: Outlet;
  skipOllama?: boolean;
};

export async function POST(req: NextRequest) {
  let body: ExplainRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", explanation: "", source: "template" as const },
      { status: 400 }
    );
  }

  const outlet = body.outlet;
  if (!outlet?.id) {
    return NextResponse.json(
      { error: "Missing outlet id", explanation: "", source: "template" as const },
      { status: 400 }
    );
  }

  try {
    const { explanation, source, meta, warning } = await resolveHybridExplanation(outlet, {
      skipOllama: body.skipOllama === true,
    });
    return NextResponse.json({ explanation, source, meta, warning });
  } catch (err) {
    console.error("[/api/explain]", err);
    return NextResponse.json({
      explanation: buildTemplateExplanation(outlet),
      source: "template" as const,
      warning: "LLM failed; used template fallback",
    });
  }
}
