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
  'corbeille',
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
  {
    code: 'sales.view_details',
    module: 'ventes',
    action: 'view_details',
    description: "Voir les détails d'une vente",
  },
  {
    code: 'sales.delete',
    module: 'ventes',
    action: 'delete_sale',
    description: 'Annuler / supprimer une vente',
  },
  {
    code: 'trash.view',
    module: 'corbeille',
    action: 'view',
    description: 'Voir la corbeille',
  },
  {
    code: 'trash.restore',
    module: 'corbeille',
    action: 'restore',
    description: 'Restaurer un élément de la corbeille',
  },
  {
    code: 'trash.permanent_delete',
    module: 'corbeille',
    action: 'permanent_delete',
    description: 'Supprimer définitivement un élément',
  },
  {
    code: 'products.delete',
    module: 'produits',
    action: 'delete_product',
    description: 'Envoyer un produit à la corbeille',
  },
  {
    code: 'clients.delete',
    module: 'clients',
    action: 'delete_client',
    description: 'Envoyer un client à la corbeille',
  },
  {
    code: 'suppliers.delete',
    module: 'fournisseurs',
    action: 'delete_supplier',
    description: 'Envoyer un fournisseur à la corbeille',
  },
  {
    code: 'purchases.delete',
    module: 'achats',
    action: 'delete_purchase',
    description: 'Envoyer un achat à la corbeille',
  },
  {
    code: 'payments.delete',
    module: 'paiements',
    action: 'delete_payment',
    description: 'Envoyer un paiement à la corbeille',
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
