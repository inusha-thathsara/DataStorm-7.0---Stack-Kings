/** Scope helpers for outlet/explain APIs (default session is national / full access). */
import type { Outlet } from "@/lib/types";

export type UserRole = "admin" | "national" | "western" | "distributor";

export type ScopeFilter = {
  province?: string;
  distributorId?: string;
  westernOnly?: boolean;
};

export type AppSession = {
  userId: string;
  role: UserRole;
  distributorId?: string;
};

export type UserScope = {
  role: UserRole;
  province?: string;
  distributorId?: string;
  westernOnly?: boolean;
  lockProvinceFilter: boolean;
  hideWesternScopeToggle: boolean;
};

export function applyScopeFilter(session: AppSession, query: ScopeFilter): ScopeFilter {
  const scoped: ScopeFilter = { ...query };

  if (session.role === "western") {
    scoped.province = "Western";
    scoped.westernOnly = true;
  }

  if (session.role === "distributor" && session.distributorId) {
    scoped.distributorId = session.distributorId;
  }

  return scoped;
}

export function getUserScope(session: AppSession): UserScope {
  const scoped = applyScopeFilter(session, {});
  return {
    role: session.role,
    province: scoped.province,
    distributorId: scoped.distributorId,
    westernOnly: scoped.westernOnly,
    lockProvinceFilter: session.role === "western",
    hideWesternScopeToggle: session.role === "western",
  };
}

export function outletMatchesScope(outlet: Outlet, scope: ScopeFilter): boolean {
  if (scope.province && outlet.province !== scope.province) return false;
  if (scope.distributorId && outlet.distributorId !== scope.distributorId) return false;
  if (scope.westernOnly && outlet.province !== "Western") return false;
  return true;
}
