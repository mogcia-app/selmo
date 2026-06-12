import type { UserRole } from "@/types/domain";

export function getRoleHomePath(role: UserRole) {
  return role === "admin" ? "/admin/dashboard" : "/sales/dashboard";
}

export function isPathAllowedForRole(path: string | null | undefined, role: UserRole) {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;

  if (role === "admin") {
    return path.startsWith("/admin") && path !== "/admin/login";
  }

  return path.startsWith("/sales") || path.startsWith("/meetings");
}

export function resolveRoleSafePath(path: string | null | undefined, role: UserRole) {
  return isPathAllowedForRole(path, role) ? path as string : getRoleHomePath(role);
}
