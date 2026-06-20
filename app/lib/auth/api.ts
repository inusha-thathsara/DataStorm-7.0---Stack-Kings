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
  const session = await getSession();
  if (!session) {
    throw new ApiHttpError(401, "Unauthorized");
  }
  return session;
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiHttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}
