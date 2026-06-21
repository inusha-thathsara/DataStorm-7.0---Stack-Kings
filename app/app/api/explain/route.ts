import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/auth/api";
import { getCachedExplanation, getOutletAccess, upsertExplanation } from "@/lib/db/queries";
import { explainErrorMessage } from "@/lib/explainErrors";
import { stableStringifyExplanation } from "@/lib/explainSchema";
import type { Outlet } from "@/lib/types";
import { buildTemplateJson, buildTemplateStructured, resolveHybridExplanation } from "@/lib/xai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExplainRequestBody = {
  outlet?: { id?: string };
  skipOllama?: boolean;
  refresh?: boolean;
};

export async function GET(req: NextRequest) {
  const outletId = req.nextUrl.searchParams.get("outletId")?.trim();
  if (!outletId) {
    return NextResponse.json({ error: "Missing outletId query parameter" }, { status: 400 });
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

    const cached = await getCachedExplanation(outletId);
    if (!cached) {
      return NextResponse.json({ error: "No cached explanation" }, { status: 404 });
    }

    return NextResponse.json({
      explanation: stableStringifyExplanation(cached.payload),
      payload: cached.payload,
      source: cached.source,
      model: cached.model,
      generatedAt: cached.generatedAt,
      cached: true,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

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

  let outlet: Outlet | null = null;

  try {
    const session = await requireSession();
    const access = await getOutletAccess(outletId, session);
    if (access.kind === "not_found") {
      return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
    }
    if (access.kind === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    outlet = access.outlet;

    if (!body.refresh) {
      const cached = await getCachedExplanation(outletId);
      if (cached) {
        return NextResponse.json({
          explanation: stableStringifyExplanation(cached.payload),
          payload: cached.payload,
          source: cached.source,
          model: cached.model,
          generatedAt: cached.generatedAt,
          cached: true,
        });
      }
    }

    const result = await resolveHybridExplanation(outlet, {
      skipOllama: body.skipOllama === true,
    });

    if (result.source !== "template") {
      try {
        await upsertExplanation(
          outletId,
          result.payload,
          result.source,
          result.meta?.model ?? null
        );
      } catch (cacheErr) {
        console.warn("[/api/explain] cache write failed:", cacheErr);
      }
    }

    return NextResponse.json({
      explanation: result.explanation,
      payload: result.payload,
      source: result.source,
      meta: result.meta,
      warning: result.warning,
      errorCode: result.errorCode,
      errorMessage: result.errorCode ? explainErrorMessage(result.errorCode) : undefined,
      cached: false,
    });
  } catch (err) {
    console.error("[/api/explain]", err);
    if (outlet) {
      const template = buildTemplateStructured(outlet);
      return NextResponse.json({
        explanation: buildTemplateJson(outlet),
        payload: template,
        source: "template" as const,
        warning: "LLM failed; used pipeline template fallback.",
      });
    }
    return handleApiError(err);
  }
}
