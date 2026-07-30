const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin']);

export function canShowCashMovementDeletion(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

export function isDeletionReasonValid(reason: string): boolean {
  return reason.trim().length > 0;
}
