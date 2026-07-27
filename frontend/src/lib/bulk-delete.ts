export function isAdministratorRole(role: string): boolean {
  return ["ADMIN", "SUPER_ADMIN"].includes(role.toUpperCase());
}

export function isExactConfirmation(typed: string, expected?: string): boolean {
  return !expected || typed === expected;
}
