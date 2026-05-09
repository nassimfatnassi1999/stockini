import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MODULES = [
  'dashboard',
  'clients',
  'produits',
  'ventes',
  'achats',
  'fournisseurs',
  'stock',
  'paiements',
  'rapports',
  'alertes',
  'settings',
  'audit-logs',
  'users',
  'permissions',
] as const;

const ACTIONS = ['read', 'create', 'update', 'delete'] as const;

/** Special business-rule permissions that supplement the standard CRUD matrix. */
const SPECIAL_PERMISSIONS = [
  {
    code: 'sales.allow_low_margin',
    module: 'ventes',
    action: 'allow_low_margin',
    description: 'Autoriser vente avec marge inférieure à 20%',
  },
] as const;

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  permissions() {
    const standard = MODULES.flatMap((module) =>
      ACTIONS.map((action) => ({
        code: `${module}:${action}`,
        module,
        action,
        description: `${action} ${module}`,
      })),
    );
    return [...standard, ...SPECIAL_PERMISSIONS];
  }

  async rolePermissions(role: string) {
    const savedRole = await this.findRole(role);
    const codes = this.extractCodes(savedRole.permissions);
    if (codes.includes('*')) {
      return this.permissions();
    }
    return this.permissions().filter(
      (permission) =>
        codes.includes(permission.code) ||
        codes.includes(`${permission.module}:*`),
    );
  }

  async updateRolePermissions(role: string, permissionCodes: string[]) {
    const savedRole = await this.findRole(role);
    await this.prisma.role.update({
      where: { id: savedRole.id },
      data: { permissions: permissionCodes },
    });
    return this.rolePermissions(savedRole.name);
  }

  userOverrides(_userId: string) {
    return [];
  }

  setUserOverride(input: {
    userId: string;
    permissionCode: string;
    granted: boolean;
  }) {
    return {
      code: input.permissionCode,
      module: input.permissionCode.split(':')[0] ?? input.permissionCode,
      action: input.permissionCode.split(':')[1] ?? 'read',
      granted: input.granted,
    };
  }

  removeUserOverride(_userId: string, _permissionCode: string) {
    return { ok: true };
  }

  private findRole(role: string) {
    return this.prisma.role.findFirstOrThrow({
      where: { name: { equals: role, mode: 'insensitive' } },
    });
  }

  private extractCodes(value: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
