import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { AppSession } from "@/lib/auth/rbac";

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function requireSession(): Promise<AppSession> {
  return getSession();
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiHttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}
