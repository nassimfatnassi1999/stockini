import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PermissionDef {
  code: string;
  module: string;
  action: string;
  description: string;
}

// Full permission catalogue — uses dot notation (module.action)
const ALL_PERMISSIONS: PermissionDef[] = [
  // ── Dashboard ─────────────────────────────────────────────────────────────
  { code: 'dashboard.view', module: 'dashboard', action: 'view', description: 'Consulter le tableau de bord' },

  // ── Admin ────────────────────────────────────────────────────────────────
  { code: 'admin.recalculate_last_sale_prices', module: 'admin', action: 'recalculate_last_sale_prices', description: 'Recalculer les derniers prix de vente produits' },

  // ── Clients ───────────────────────────────────────────────────────────────
  { code: 'clients.view',   module: 'clients', action: 'view',   description: 'Consulter les clients' },
  { code: 'clients.create', module: 'clients', action: 'create', description: 'Créer un client' },
  { code: 'clients.update', module: 'clients', action: 'update', description: 'Modifier un client' },
  { code: 'clients.delete', module: 'clients', action: 'delete', description: 'Supprimer un client' },

  // ── Produits ──────────────────────────────────────────────────────────────
  { code: 'products.view',   module: 'products', action: 'view',   description: 'Consulter les produits' },
  { code: 'products.create', module: 'products', action: 'create', description: 'Créer un produit' },
  { code: 'products.update', module: 'products', action: 'update', description: 'Modifier un produit' },
  { code: 'products.delete', module: 'products', action: 'delete', description: 'Supprimer un produit' },

  // ── Ventes ────────────────────────────────────────────────────────────────
  { code: 'sales.view',             module: 'sales', action: 'view',             description: 'Consulter les ventes' },
  { code: 'sales.create',           module: 'sales', action: 'create',           description: 'Créer une vente' },
  { code: 'sales.update',           module: 'sales', action: 'update',           description: 'Modifier une vente' },
  { code: 'sales.delete',           module: 'sales', action: 'delete',           description: 'Supprimer une vente' },
  { code: 'sales.allow_low_margin', module: 'sales', action: 'allow_low_margin', description: 'Autoriser vente avec marge < 20%' },
  { code: 'sales.view_details',     module: 'sales', action: 'view_details',     description: "Voir le détail d'une vente" },

  // ── Achats ────────────────────────────────────────────────────────────────
  { code: 'purchases.view',             module: 'purchases', action: 'view',             description: 'Consulter les achats' },
  { code: 'purchases.create_order',     module: 'purchases', action: 'create_order',     description: 'Créer une commande achat' },
  { code: 'purchases.create_receipt',   module: 'purchases', action: 'create_receipt',   description: 'Créer un bon de réception' },
  { code: 'purchases.create_invoice',   module: 'purchases', action: 'create_invoice',   description: 'Créer une facture achat' },
  { code: 'purchases.update',           module: 'purchases', action: 'update',           description: 'Modifier un achat' },
  { code: 'purchases.delete',           module: 'purchases', action: 'delete',           description: 'Supprimer un achat' },
  { code: 'purchases.validate_receipt', module: 'purchases', action: 'validate_receipt', description: 'Valider une réception' },

  // ── Fournisseurs ──────────────────────────────────────────────────────────
  { code: 'suppliers.view',   module: 'suppliers', action: 'view',   description: 'Consulter les fournisseurs' },
  { code: 'suppliers.create', module: 'suppliers', action: 'create', description: 'Créer un fournisseur' },
  { code: 'suppliers.update', module: 'suppliers', action: 'update', description: 'Modifier un fournisseur' },
  { code: 'suppliers.delete', module: 'suppliers', action: 'delete', description: 'Supprimer un fournisseur' },

  // ── Stock ─────────────────────────────────────────────────────────────────
  { code: 'stock.view',           module: 'stock', action: 'view',           description: 'Consulter le stock' },
  { code: 'stock.adjust',         module: 'stock', action: 'adjust',         description: 'Ajuster le stock' },
  { code: 'stock.transfer',       module: 'stock', action: 'transfer',       description: 'Transférer du stock' },
  { code: 'stock.movements.view', module: 'stock', action: 'movements.view', description: 'Voir les mouvements de stock' },

  // ── Paiements clients ─────────────────────────────────────────────────────
  { code: 'payments.view',                   module: 'payments', action: 'view',                   description: 'Consulter les paiements' },
  { code: 'payments.create',                 module: 'payments', action: 'create',                 description: 'Créer un paiement' },
  { code: 'payments.update',                 module: 'payments', action: 'update',                 description: 'Modifier un paiement' },
  { code: 'payments.delete',                 module: 'payments', action: 'delete',                 description: 'Supprimer un paiement' },
  { code: 'payments.receive_client_payment', module: 'payments', action: 'receive_client_payment', description: 'Encaisser un paiement client' },

  // ── Dépenses / paiements fournisseurs ─────────────────────────────────────
  { code: 'expenses.view',         module: 'expenses', action: 'view',         description: 'Consulter les dépenses' },
  { code: 'expenses.create',       module: 'expenses', action: 'create',       description: 'Créer une dépense' },
  { code: 'expenses.update',       module: 'expenses', action: 'update',       description: 'Modifier une dépense' },
  { code: 'expenses.delete',       module: 'expenses', action: 'delete',       description: 'Supprimer une dépense' },
  { code: 'expenses.pay_supplier', module: 'expenses', action: 'pay_supplier', description: 'Payer un fournisseur' },

  // ── Rapports ──────────────────────────────────────────────────────────────
  { code: 'reports.view',           module: 'reports', action: 'view',           description: 'Consulter les rapports' },
  { code: 'reports.financial.view', module: 'reports', action: 'financial.view', description: 'Voir les rapports financiers' },
  { code: 'reports.export',         module: 'reports', action: 'export',         description: 'Exporter les rapports' },

  // ── Alertes ───────────────────────────────────────────────────────────────
  { code: 'alerts.view',   module: 'alerts', action: 'view',   description: 'Consulter les alertes' },
  { code: 'alerts.create', module: 'alerts', action: 'create', description: 'Créer une alerte' },
  { code: 'alerts.update', module: 'alerts', action: 'update', description: 'Modifier une alerte' },
  { code: 'alerts.delete', module: 'alerts', action: 'delete', description: 'Supprimer une alerte' },

  // ── Paramètres ────────────────────────────────────────────────────────────
  { code: 'settings.view',   module: 'settings', action: 'view',   description: 'Consulter les paramètres' },
  { code: 'settings.update', module: 'settings', action: 'update', description: 'Modifier les paramètres' },

  // ── Audit logs ────────────────────────────────────────────────────────────
  { code: 'audit_logs.view', module: 'audit_logs', action: 'view', description: "Voir les journaux d'audit" },

  // ── Permissions ───────────────────────────────────────────────────────────
  { code: 'permissions.view',   module: 'permissions', action: 'view',   description: 'Consulter les permissions' },
  { code: 'permissions.update', module: 'permissions', action: 'update', description: 'Modifier les permissions' },

  // ── Utilisateurs ──────────────────────────────────────────────────────────
  { code: 'users.view',   module: 'users', action: 'view',   description: 'Consulter les utilisateurs' },
  { code: 'users.create', module: 'users', action: 'create', description: 'Créer un utilisateur' },
  { code: 'users.update', module: 'users', action: 'update', description: 'Modifier un utilisateur' },
  { code: 'users.delete', module: 'users', action: 'delete', description: 'Supprimer un utilisateur' },

  // ── Corbeille ─────────────────────────────────────────────────────────────
  { code: 'trash.view',             module: 'trash', action: 'view',             description: 'Voir la corbeille' },
  { code: 'trash.restore',          module: 'trash', action: 'restore',          description: 'Restaurer depuis la corbeille' },
  { code: 'trash.permanent_delete', module: 'trash', action: 'permanent_delete', description: 'Supprimer définitivement' },
];

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  permissions(): PermissionDef[] {
    return ALL_PERMISSIONS;
  }

  async rolePermissions(role: string): Promise<PermissionDef[]> {
    const savedRole = await this.findRole(role);
    const codes = this.extractCodes(savedRole.permissions);
    if (codes.includes('*')) return this.permissions();

    return this.permissions().filter(
      (p) => codes.includes(p.code) || codes.includes(`${p.module}.*`),
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

  setUserOverride(input: { userId: string; permissionCode: string; granted: boolean }) {
    const parts = input.permissionCode.split('.');
    return {
      code: input.permissionCode,
      module: parts[0] ?? input.permissionCode,
      action: parts.slice(1).join('.') || 'view',
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

  private extractCodes(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
