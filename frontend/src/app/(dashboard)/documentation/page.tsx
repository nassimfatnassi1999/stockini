'use client';

import { PermissionGuard } from '@/components/shared/PermissionGuard';
import {
  BookOpen,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Users,
  Package,
  ShoppingCart,
  FileText,
  CreditCard,
  Wallet,
  Truck,
  Boxes,
  BarChart3,
  Bell,
  Settings,
  Lock,
  Trash2,
  Database,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeatureDoc {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  recommendedRoles: string[];
  permissions: string[];
  route: string;
  endpoint: string;
  notes?: string;
}

interface RoleMatrixEntry {
  permission: string;
  description: string;
  admin: boolean;
  stockManager: boolean;
  seller: boolean;
  purchaseManager: boolean;
}

// ─── Features Documentation ───────────────────────────────────────────────────

const FEATURES: FeatureDoc[] = [
  {
    id: 'dashboard',
    name: 'Tableau de bord',
    description: 'Vue d\'ensemble des KPIs : ventes du jour, stock, paiements en attente, alertes.',
    icon: BarChart3,
    recommendedRoles: ['ADMIN', 'SELLER', 'STOCK_MANAGER', 'PURCHASE_MANAGER'],
    permissions: ['dashboard.view'],
    route: '/dashboard',
    endpoint: 'GET /reports/dashboard',
  },
  {
    id: 'clients',
    name: 'Gestion des clients',
    description: 'Créer, modifier et consulter la fiche client. Suivi du solde crédit, historique achats.',
    icon: Users,
    recommendedRoles: ['ADMIN', 'SELLER'],
    permissions: ['clients.view', 'clients.create', 'clients.update', 'clients.delete'],
    route: '/clients',
    endpoint: 'GET/POST/PATCH/DELETE /customers',
  },
  {
    id: 'products',
    name: 'Gestion des produits',
    description: 'Catalogue produits avec prix d\'achat/vente, TVA, stock min, catégorie et marque.',
    icon: Package,
    recommendedRoles: ['ADMIN', 'STOCK_MANAGER', 'SELLER'],
    permissions: ['products.view', 'products.create', 'products.update', 'products.delete'],
    route: '/produits',
    endpoint: 'GET/POST/PATCH/DELETE /products',
  },
  {
    id: 'sales',
    name: 'Ventes (Devis / BL / Factures)',
    description: 'Création de devis, bons de livraison et factures. Calcul automatique des marges, validation, annulation.',
    icon: ShoppingCart,
    recommendedRoles: ['ADMIN', 'SELLER'],
    permissions: ['sales.view', 'sales.create', 'sales.update', 'sales.delete', 'sales.view_details', 'sales.allow_low_margin'],
    route: '/ventes',
    endpoint: 'GET/POST/PATCH/DELETE /sales',
    notes: 'La permission sales.allow_low_margin est requise pour vendre sous la marge minimale de 20%.',
  },
  {
    id: 'documents',
    name: 'Documents PDF',
    description: 'Génération, téléchargement et envoi par email de documents PDF (factures, devis, avoirs).',
    icon: FileText,
    recommendedRoles: ['ADMIN', 'SELLER'],
    permissions: ['documents.view', 'documents.create', 'documents.update', 'documents.delete', 'documents.download', 'documents.email'],
    route: '/documents',
    endpoint: 'GET/POST/PUT/DELETE /documents',
    notes: 'documents.download et documents.email sont des permissions séparées de documents.view.',
  },
  {
    id: 'purchases',
    name: 'Achats',
    description: 'Commandes fournisseurs, réceptions, facturation achat. Mise à jour automatique du stock à réception.',
    icon: Truck,
    recommendedRoles: ['ADMIN', 'PURCHASE_MANAGER'],
    permissions: ['purchases.view', 'purchases.create_order', 'purchases.validate_receipt', 'purchases.update', 'purchases.delete'],
    route: '/achats',
    endpoint: 'GET/POST/PATCH/DELETE /purchases',
  },
  {
    id: 'suppliers',
    name: 'Fournisseurs',
    description: 'Annuaire fournisseurs avec coordonnées, conditions paiement, produits liés.',
    icon: Truck,
    recommendedRoles: ['ADMIN', 'PURCHASE_MANAGER'],
    permissions: ['suppliers.view', 'suppliers.create', 'suppliers.update', 'suppliers.delete'],
    route: '/fournisseurs',
    endpoint: 'GET/POST/PATCH/DELETE /suppliers',
  },
  {
    id: 'stock',
    name: 'Gestion du stock',
    description: 'Entrées/sorties manuelles, ajustements, mouvements et réinitialisation inventaire.',
    icon: Boxes,
    recommendedRoles: ['ADMIN', 'STOCK_MANAGER'],
    permissions: ['stock.view', 'stock.adjust', 'stock.transfer', 'stock.movements.view', 'stock.reset'],
    route: '/stock',
    endpoint: 'GET/POST /stock',
    notes: 'stock.reset remet à zéro toutes les quantités. Action irréversible réservée aux admins.',
  },
  {
    id: 'payments',
    name: 'Paiements clients',
    description: 'Encaissements clients, historique des règlements par vente.',
    icon: CreditCard,
    recommendedRoles: ['ADMIN', 'SELLER'],
    permissions: ['payments.view', 'payments.create', 'payments.receive_client_payment', 'payments.delete'],
    route: '/paiements',
    endpoint: 'GET/POST/DELETE /payments',
  },
  {
    id: 'caisse',
    name: 'Caisse',
    description: 'Solde en temps réel, transactions (ventes, achats, dépôts/retraits manuels), analytics.',
    icon: Wallet,
    recommendedRoles: ['ADMIN', 'SELLER'],
    permissions: ['caisse.view', 'caisse.operate', 'caisse.admin'],
    route: '/caisse',
    endpoint: 'GET /caisse/balance | /caisse/transactions',
    notes: 'caisse.admin permet de configurer le solde négatif autorisé.',
  },
  {
    id: 'expenses',
    name: 'Dépenses / Paiements fournisseurs',
    description: 'Suivi des dépenses et règlements fournisseurs.',
    icon: CreditCard,
    recommendedRoles: ['ADMIN', 'PURCHASE_MANAGER'],
    permissions: ['expenses.view', 'expenses.create', 'expenses.pay_supplier'],
    route: '/depenses',
    endpoint: 'GET/POST /payments/purchases/:id/pay',
  },
  {
    id: 'reports',
    name: 'Rapports',
    description: 'Tableaux de bord financiers, top produits, valeur stock, résumé ventes.',
    icon: BarChart3,
    recommendedRoles: ['ADMIN', 'STOCK_MANAGER'],
    permissions: ['reports.view', 'reports.financial.view', 'reports.export'],
    route: '/rapports',
    endpoint: 'GET /reports/*',
    notes: 'reports.financial.view donne accès aux rapports sensibles (CA, marges).',
  },
  {
    id: 'alerts',
    name: 'Alertes',
    description: 'Alertes stock bas, ruptures, factures impayées. Marquage lu/non-lu.',
    icon: Bell,
    recommendedRoles: ['ADMIN', 'STOCK_MANAGER'],
    permissions: ['alerts.view', 'alerts.create', 'alerts.update', 'alerts.delete'],
    route: '/alertes',
    endpoint: 'GET/POST/PATCH/DELETE /alerts',
  },
  {
    id: 'users',
    name: 'Utilisateurs',
    description: 'Création et gestion des comptes utilisateurs, rôles, statuts actif/inactif.',
    icon: Users,
    recommendedRoles: ['ADMIN'],
    permissions: ['users.view', 'users.create', 'users.update', 'users.delete', 'users.reset_password'],
    route: '/admin/users',
    endpoint: 'GET/POST/PATCH/DELETE /users',
    notes: 'Le dernier administrateur actif ne peut pas être supprimé ou désactivé.',
  },
  {
    id: 'permissions',
    name: 'Permissions',
    description: 'Configuration des droits par rôle et exceptions par utilisateur (ALLOW/DENY).',
    icon: Lock,
    recommendedRoles: ['ADMIN'],
    permissions: ['permissions.view', 'permissions.update'],
    route: '/admin/permissions',
    endpoint: 'GET/PUT /rbac/*',
    notes: 'Les modifications de permissions sont appliquées immédiatement via /auth/me.',
  },
  {
    id: 'trash',
    name: 'Corbeille',
    description: 'Éléments supprimés logiquement. Restauration ou suppression définitive.',
    icon: Trash2,
    recommendedRoles: ['ADMIN', 'STOCK_MANAGER'],
    permissions: ['trash.view', 'trash.restore', 'trash.permanent_delete'],
    route: '/corbeille',
    endpoint: 'GET/PATCH/DELETE /trash',
    notes: 'trash.permanent_delete supprime définitivement sans possibilité de récupération.',
  },
  {
    id: 'settings',
    name: 'Paramètres',
    description: 'Configuration entreprise, options dropdowns, paramètres applicatifs.',
    icon: Settings,
    recommendedRoles: ['ADMIN'],
    permissions: ['settings.view', 'settings.update'],
    route: '/settings',
    endpoint: 'GET/POST/PATCH/DELETE /settings',
  },
  {
    id: 'audit_logs',
    name: 'Audit Logs',
    description: 'Journal des actions : créations, modifications, suppressions, connexions.',
    icon: ShieldCheck,
    recommendedRoles: ['ADMIN'],
    permissions: ['audit_logs.view'],
    route: '/audit-logs',
    endpoint: 'GET /audit-logs',
  },
  {
    id: 'database',
    name: 'Base de données',
    description: 'Interface d\'administration base de données. Backups, restaurations.',
    icon: Database,
    recommendedRoles: ['ADMIN'],
    permissions: ['settings.update'],
    route: '/admin/database',
    endpoint: 'N/A',
    notes: 'Réservé aux administrateurs système.',
  },
];

// ─── Role Matrix ──────────────────────────────────────────────────────────────

const MATRIX_DATA: RoleMatrixEntry[] = [
  { permission: 'dashboard.view', description: 'Tableau de bord', admin: true, stockManager: true, seller: true, purchaseManager: true },
  { permission: 'clients.view', description: 'Voir clients', admin: true, stockManager: false, seller: true, purchaseManager: false },
  { permission: 'clients.create', description: 'Créer client', admin: true, stockManager: false, seller: true, purchaseManager: false },
  { permission: 'products.view', description: 'Voir produits', admin: true, stockManager: true, seller: true, purchaseManager: true },
  { permission: 'products.create', description: 'Créer produit', admin: true, stockManager: true, seller: false, purchaseManager: false },
  { permission: 'sales.view', description: 'Voir ventes', admin: true, stockManager: false, seller: true, purchaseManager: false },
  { permission: 'sales.create', description: 'Créer vente', admin: true, stockManager: false, seller: true, purchaseManager: false },
  { permission: 'documents.view', description: 'Voir documents', admin: true, stockManager: false, seller: true, purchaseManager: true },
  { permission: 'documents.download', description: 'Télécharger PDF', admin: true, stockManager: false, seller: true, purchaseManager: true },
  { permission: 'documents.email', description: 'Envoyer email', admin: true, stockManager: false, seller: true, purchaseManager: false },
  { permission: 'stock.view', description: 'Voir stock', admin: true, stockManager: true, seller: true, purchaseManager: true },
  { permission: 'stock.adjust', description: 'Ajuster stock', admin: true, stockManager: true, seller: false, purchaseManager: false },
  { permission: 'stock.reset', description: 'Reset inventaire', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'purchases.view', description: 'Voir achats', admin: true, stockManager: false, seller: false, purchaseManager: true },
  { permission: 'purchases.create_order', description: 'Créer commande', admin: true, stockManager: false, seller: false, purchaseManager: true },
  { permission: 'payments.view', description: 'Voir paiements', admin: true, stockManager: false, seller: true, purchaseManager: true },
  { permission: 'payments.receive_client_payment', description: 'Encaisser client', admin: true, stockManager: false, seller: true, purchaseManager: false },
  { permission: 'caisse.view', description: 'Voir caisse', admin: true, stockManager: false, seller: true, purchaseManager: false },
  { permission: 'caisse.operate', description: 'Opérations caisse', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'expenses.pay_supplier', description: 'Payer fournisseur', admin: true, stockManager: false, seller: false, purchaseManager: true },
  { permission: 'reports.view', description: 'Rapports', admin: true, stockManager: true, seller: false, purchaseManager: false },
  { permission: 'reports.financial.view', description: 'Rapports financiers', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'alerts.view', description: 'Alertes', admin: true, stockManager: true, seller: false, purchaseManager: false },
  { permission: 'users.view', description: 'Voir utilisateurs', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'permissions.view', description: 'Voir permissions', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'permissions.update', description: 'Modifier permissions', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'settings.view', description: 'Voir paramètres', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'audit_logs.view', description: 'Audit logs', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'trash.view', description: 'Voir corbeille', admin: true, stockManager: true, seller: false, purchaseManager: false },
  { permission: 'trash.permanent_delete', description: 'Suppression définitive', admin: true, stockManager: false, seller: false, purchaseManager: false },
  { permission: 'documentation.view', description: 'Documentation', admin: true, stockManager: true, seller: true, purchaseManager: true },
];

// ─── Components ───────────────────────────────────────────────────────────────

function Check() {
  return <CheckCircle size={16} className="text-green-600 mx-auto" />;
}

function Cross() {
  return <XCircle size={16} className="text-red-400 opacity-50 mx-auto" />;
}

function PermBadge({ code }: { code: string }) {
  return (
    <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
      {code}
    </Badge>
  );
}

export default function DocumentationPage() {
  return (
    <PermissionGuard permission="documentation.view">
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen size={28} className="text-app-primary shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documentation Stockini</h1>
          <p className="text-sm text-app-muted mt-0.5">
            Guide complet des fonctionnalités, permissions et workflows.
          </p>
        </div>
      </div>

      {/* Introduction */}
      <Card>
        <CardHeader>
          <CardTitle>Introduction</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-app-muted">
          <p>
            <strong className="text-app-text">Stockini</strong> est un ERP SaaS de gestion de stock et de vente. Il couvre la gestion des produits, clients, fournisseurs, ventes (devis / BL / factures), achats, documents PDF, paiements, caisse et rapports.
          </p>
          <p>
            Le système utilise un <strong className="text-app-text">RBAC dynamique</strong> (Role-Based Access Control) avec permissions granulaires. Chaque action est protégée par une permission spécifique. Les permissions sont configurables via l&apos;interface <strong>Admin → Permissions</strong> sans redéploiement.
          </p>
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardHeader>
          <CardTitle>Rôles utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {[
              { role: 'ADMIN / SUPER_ADMIN', desc: 'Accès total. Peut modifier les permissions de tous les rôles. Ne peut pas être le seul admin supprimé.', color: 'text-red-600' },
              { role: 'SELLER', desc: 'Ventes, clients, documents, paiements clients, caisse (lecture). Ne peut pas accéder aux achats ni aux paramètres.', color: 'text-blue-600' },
              { role: 'STOCK_MANAGER', desc: 'Gestion stock, produits, alertes, rapports. Ne voit pas les ventes ni les finances.', color: 'text-green-600' },
              { role: 'PURCHASE_MANAGER', desc: 'Achats, fournisseurs, réceptions, paiements fournisseurs. Ne voit pas les ventes clients.', color: 'text-purple-600' },
            ].map((r) => (
              <div key={r.role} className="rounded-lg border p-3">
                <p className={`font-semibold font-mono text-xs mb-1 ${r.color}`}>{r.role}</p>
                <p className="text-app-muted text-xs">{r.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-app-muted">
            Les rôles sont un point de départ. Des exceptions par utilisateur (ALLOW / DENY) peuvent affiner les droits individuellement.
          </p>
        </CardContent>
      </Card>

      {/* Feature docs */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Modules métier</h2>
        <div className="space-y-4">
          {FEATURES.map((f) => (
            <Card key={f.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <f.icon size={18} className="text-app-primary shrink-0" />
                  <CardTitle className="text-base">{f.name}</CardTitle>
                  <span className="ml-auto font-mono text-xs text-app-muted">{f.route}</span>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-app-muted">{f.description}</p>

                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-xs font-medium text-app-text mr-1">Permissions :</span>
                  {f.permissions.map((p) => (
                    <PermBadge key={p} code={p} />
                  ))}
                </div>

                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-xs font-medium text-app-text mr-1">Rôles recommandés :</span>
                  {f.recommendedRoles.map((r) => (
                    <Badge key={r} variant="outline" className="text-xs font-mono">{r}</Badge>
                  ))}
                </div>

                <p className="text-xs text-app-muted font-mono">Endpoint : {f.endpoint}</p>

                {f.notes && (
                  <p className="text-xs bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 rounded p-2 border border-amber-200 dark:border-amber-800">
                    ⚠ {f.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Permission matrix */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Matrice Rôles / Permissions (défaut)</h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-semibold">Permission</th>
                    <th className="text-left px-3 py-3 font-semibold text-app-muted">Description</th>
                    <th className="text-center px-3 py-3 font-semibold text-red-600">Admin</th>
                    <th className="text-center px-3 py-3 font-semibold text-green-600">Stock</th>
                    <th className="text-center px-3 py-3 font-semibold text-blue-600">Vendeur</th>
                    <th className="text-center px-3 py-3 font-semibold text-purple-600">Achats</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX_DATA.map((row, i) => (
                    <tr key={row.permission} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                      <td className="px-4 py-2 font-mono text-[10px] text-app-primary">{row.permission}</td>
                      <td className="px-3 py-2 text-app-muted">{row.description}</td>
                      <td className="px-3 py-2">{row.admin ? <Check /> : <Cross />}</td>
                      <td className="px-3 py-2">{row.stockManager ? <Check /> : <Cross />}</td>
                      <td className="px-3 py-2">{row.seller ? <Check /> : <Cross />}</td>
                      <td className="px-3 py-2">{row.purchaseManager ? <Check /> : <Cross />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-app-muted">
          Cette matrice reflète les permissions par défaut du seed. Elle peut être modifiée via Admin → Permissions.
        </p>
      </div>

      {/* Security notes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-app-primary" />
            Sécurité et Audit
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-app-muted">
          <ul className="space-y-1.5 list-disc pl-4">
            <li>Tous les endpoints sont protégés par <code className="text-app-primary font-mono text-xs">JwtAuthGuard + PermissionsGuard</code>.</li>
            <li>Les permissions sont calculées <strong className="text-app-text">en temps réel</strong> depuis la DB via <code className="font-mono text-xs">getEffectivePermissions(userId)</code>.</li>
            <li>Les overrides utilisateur-spécifiques (ALLOW/DENY) sont persistés en DB et écrasent les permissions du rôle.</li>
            <li>Un utilisateur inactif (<code className="font-mono text-xs">isActive: false</code>) n&apos;a accès à aucune ressource.</li>
            <li>Toutes les créations/modifications/suppressions sont tracées dans les <strong className="text-app-text">Audit Logs</strong>.</li>
            <li>Le hash du mot de passe n&apos;est jamais retourné par aucun endpoint.</li>
            <li>Après modification des permissions, le frontend invalide automatiquement le cache <code className="font-mono text-xs">/auth/me</code>.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
    </PermissionGuard>
  );
}
