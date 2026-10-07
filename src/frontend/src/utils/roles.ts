export const normalizeRoleName = (roleName?: string | null) => (roleName || '').trim().toLowerCase();

export const hasRole = (user: { role?: { name?: string | null } } | null | undefined, roleName: string) =>
  normalizeRoleName(user?.role?.name) === normalizeRoleName(roleName);
