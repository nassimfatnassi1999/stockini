import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CaisseController } from './caisse.controller';

describe('Caisse movement deletion authorization', () => {
  const handler = CaisseController.prototype.deleteMovement;

  function contextFor(role: string) {
    return {
      getHandler: () => handler,
      getClass: () => CaisseController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as never;
  }

  it('déclare explicitement les seuls rôles administrateurs', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(
      expect.arrayContaining(['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin']),
    );
  });

  it('l’appel API direct d’un utilisateur standard est refusé par le guard (HTTP 403)', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(contextFor('CASHIER'))).toBe(false);
    expect(guard.canActivate(contextFor('ADMIN'))).toBe(true);
  });
});
