import type { AppSession } from "@/lib/auth/rbac";

/** Public app — full national access (no authentication). */
export async function getSession(): Promise<AppSession> {
  return { userId: "public", role: "national" };
}
