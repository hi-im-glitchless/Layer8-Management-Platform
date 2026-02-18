export type Role = 'NORMAL' | 'PM' | 'MANAGER' | 'ADMIN';

export const ROLE_HIERARCHY: Record<Role, number> = {
  NORMAL: 1,
  PM: 2,
  MANAGER: 3,
  ADMIN: 4,
};

export const ROLE_LABELS: Record<Role, string> = {
  NORMAL: 'Normal',
  PM: 'Project Manager',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
};

/**
 * Check if a user role meets the minimum required role
 * Hierarchical: ADMIN > MANAGER > PM > NORMAL
 */
export function hasRole(userRole: Role | undefined, minimumRole: Role): boolean {
  if (!userRole) return false;
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? Infinity);
}
