export function isClerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!pk?.startsWith("pk_")) return false;
  if (typeof window !== "undefined") return true;
  const sk = process.env.CLERK_SECRET_KEY?.trim();
  return Boolean(sk?.startsWith("sk_"));
}

/** When true, auth middleware and API session checks are skipped (local dev without Clerk). */
export function isAuthBypassed(): boolean {
  if (process.env.AUTH_BYPASS === "true") return true;
  if (process.env.AUTH_BYPASS === "false") return false;
  return !isClerkConfigured();
}
