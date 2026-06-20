import { auth, currentUser } from "@clerk/nextjs/server";
import { isAuthBypassed } from "@/lib/auth/config";
import type { AppSession, UserRole } from "@/lib/auth/rbac";

const VALID_ROLES: UserRole[] = ["admin", "national", "western", "distributor"];

function parseRole(value: unknown): UserRole {
  if (typeof value === "string" && VALID_ROLES.includes(value as UserRole)) {
    return value as UserRole;
  }
  return "national";
}

export async function getSession(): Promise<AppSession | null> {
  if (isAuthBypassed()) {
    return { userId: "dev", role: "national" };
  }

  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const meta = user?.publicMetadata ?? {};
  const role = parseRole(meta.role);
  const distributorId =
    typeof meta.distributorId === "string" && meta.distributorId.trim()
      ? meta.distributorId.trim()
      : undefined;

  return { userId, role, distributorId };
}
