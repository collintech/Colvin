export const PERMISSIONS = Object.freeze({
  ACCOUNT_READ_SELF: 'account:self:read',
  SESSION_REVOKE_SELF: 'session:self:revoke',
  VEHICLE_LOOKUP: 'vehicle:lookup',
  HISTORY_READ: 'history:read',
  ADMIN_AUDIT_READ: 'admin:audit:read',
  ADMIN_USER_MANAGE: 'admin:user:manage',
});

const USER_PERMISSIONS = Object.freeze([
  PERMISSIONS.ACCOUNT_READ_SELF,
  PERMISSIONS.SESSION_REVOKE_SELF,
  PERMISSIONS.VEHICLE_LOOKUP,
  PERMISSIONS.HISTORY_READ,
]);

export const ROLE_PERMISSIONS = Object.freeze({
  user: USER_PERMISSIONS,
  admin: Object.freeze([
    ...USER_PERMISSIONS,
    PERMISSIONS.ADMIN_AUDIT_READ,
    PERMISSIONS.ADMIN_USER_MANAGE,
  ]),
});

export function roleHasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
