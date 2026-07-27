import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLES_KEY } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditLogsController } from './audit-logs.controller';

describe('AuditLogsController bulk deletion authorization', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const handler = AuditLogsController.prototype.removeAll;
  const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];

  function contextFor(role: string) {
    return {
      getHandler: () => handler,
      getClass: () => AuditLogsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as never;
  }

  it('exige la permission dédiée et un rôle administrateur', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      'audit_logs.delete',
    ]);
    expect(roles).toEqual(
      expect.arrayContaining(['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin']),
    );
  });

  it('refuse un utilisateur non administrateur et autorise un administrateur', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextFor('STOCK_MANAGER'))).toBe(false);
    expect(guard.canActivate(contextFor('ADMIN'))).toBe(true);
  });
});
