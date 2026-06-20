import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/auth/api";
import { getOutletAccess } from "@/lib/db/queries";
import { buildTemplateExplanation, resolveHybridExplanation } from "@/lib/xai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExplainRequestBody = {
  outlet?: { id?: string };
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

  const outletId = body.outlet?.id?.trim();
  if (!outletId) {
    return NextResponse.json(
      { error: "Missing outlet id", explanation: "", source: "template" as const },
      { status: 400 }
    );
  }

  try {
    const session = await requireSession();
    const access = await getOutletAccess(outletId, session);
    if (access.kind === "not_found") {
      return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
    }
    if (access.kind === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const outlet = access.outlet;
    const { explanation, source, meta, warning } = await resolveHybridExplanation(outlet, {
      skipOllama: body.skipOllama === true,
    });
    return NextResponse.json({ explanation, source, meta, warning });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return handleApiError(err);
    }
    console.error("[/api/explain]", err);
    return NextResponse.json({
      explanation: buildTemplateExplanation({ id: outletId } as never),
      source: "template" as const,
      warning: "LLM failed; used template fallback",
    });
  }
}
