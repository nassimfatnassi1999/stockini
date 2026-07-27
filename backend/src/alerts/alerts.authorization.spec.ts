import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLES_KEY } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AlertsController } from './alerts.controller';

describe('AlertsController bulk deletion authorization', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const handler = AlertsController.prototype.removeAll;

  function contextFor(role: string) {
    return {
      getHandler: () => handler,
      getClass: () => AlertsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as never;
  }

  it('exige alerts.delete et limite la route aux administrateurs', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      'alerts.delete',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(
      expect.arrayContaining(['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin']),
    );
  });

  it('refuse un rôle non administrateur', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(contextFor('STOCK_MANAGER'))).toBe(false);
    expect(guard.canActivate(contextFor('SUPER_ADMIN'))).toBe(true);
  });
});
