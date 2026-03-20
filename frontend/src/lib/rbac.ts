export type Role = 'NORMAL' | 'PM' | 'ADMIN';

export const ROLE_HIERARCHY: Record<Role, number> = {
  NORMAL: 1,
  PM: 2,
  ADMIN: 3,
};

export const ROLE_LABELS: Record<Role, string> = {
  NORMAL: 'Normal',
  PM: 'Project Manager',
  ADMIN: 'Admin',
};

/**
 * Check if a user role meets the minimum required role
 * Hierarchical: ADMIN > PM > NORMAL
 */
export function hasRole(userRole: Role | undefined, minimumRole: Role): boolean {
  if (!userRole) return false;
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? Infinity);
}
