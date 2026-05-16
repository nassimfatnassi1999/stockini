export const PERMISSIONS = {
  // ── Dashboard ────────────────────────────────────────────────────────────────
  DASHBOARD_VIEW: 'dashboard.view',

  // ── Admin ─────────────────────────────────────────────────────────────────────
  ADMIN_RECALCULATE_LAST_SALE_PRICES: 'admin.recalculate_last_sale_prices',

  // ── Clients ───────────────────────────────────────────────────────────────────
  CLIENTS_VIEW: 'clients.view',
  CLIENTS_CREATE: 'clients.create',
  CLIENTS_UPDATE: 'clients.update',
  CLIENTS_DELETE: 'clients.delete',
  CLIENTS_EXPORT: 'clients.export',
  CLIENTS_VIEW_HISTORY: 'clients.view_history',

  // ── Produits ──────────────────────────────────────────────────────────────────
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',
  PRODUCTS_IMPORT: 'products.import',
  PRODUCTS_EXPORT: 'products.export',
  PRODUCTS_VIEW_MARGIN: 'products.view_margin',
  PRODUCTS_UPDATE_PRICE: 'products.update_price',
  PRODUCTS_UPDATE_DISCOUNT: 'products.update_discount',

  // ── Ventes ────────────────────────────────────────────────────────────────────
  SALES_VIEW: 'sales.view',
  SALES_CREATE: 'sales.create',
  SALES_UPDATE: 'sales.update',
  SALES_DELETE: 'sales.delete',
  SALES_VIEW_DETAILS: 'sales.view_details',
  SALES_ALLOW_LOW_MARGIN: 'sales.allow_low_margin',
  SALES_EXPORT: 'sales.export',
  SALES_PRINT: 'sales.print',
  SALES_CANCEL: 'sales.cancel',
  SALES_VIEW_HISTORY: 'sales.view_history',

  // ── Achats ────────────────────────────────────────────────────────────────────
  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_CREATE_ORDER: 'purchases.create_order',
  PURCHASES_CREATE_RECEIPT: 'purchases.create_receipt',
  PURCHASES_CREATE_INVOICE: 'purchases.create_invoice',
  PURCHASES_UPDATE: 'purchases.update',
  PURCHASES_DELETE: 'purchases.delete',
  PURCHASES_VALIDATE_RECEIPT: 'purchases.validate_receipt',
  PURCHASES_EXPORT: 'purchases.export',
  PURCHASES_CANCEL: 'purchases.cancel',

  // ── Fournisseurs ──────────────────────────────────────────────────────────────
  SUPPLIERS_VIEW: 'suppliers.view',
  SUPPLIERS_CREATE: 'suppliers.create',
  SUPPLIERS_UPDATE: 'suppliers.update',
  SUPPLIERS_DELETE: 'suppliers.delete',
  SUPPLIERS_EXPORT: 'suppliers.export',

  // ── Stock ─────────────────────────────────────────────────────────────────────
  STOCK_VIEW: 'stock.view',
  STOCK_ADJUST: 'stock.adjust',
  STOCK_TRANSFER: 'stock.transfer',
  STOCK_MOVEMENTS_VIEW: 'stock.movements.view',
  STOCK_MOVEMENTS_DELETE: 'stock.movements.delete',
  STOCK_RESET: 'stock.reset',
  STOCK_EXPORT: 'stock.export',

  // ── Documents ─────────────────────────────────────────────────────────────────
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_CREATE: 'documents.create',
  DOCUMENTS_UPDATE: 'documents.update',
  DOCUMENTS_DELETE: 'documents.delete',
  DOCUMENTS_DOWNLOAD: 'documents.download',
  DOCUMENTS_EMAIL: 'documents.email',
  DOCUMENTS_VIEW_HISTORY: 'documents.view_history',

  // ── Paiements clients ─────────────────────────────────────────────────────────
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_CREATE: 'payments.create',
  PAYMENTS_UPDATE: 'payments.update',
  PAYMENTS_DELETE: 'payments.delete',
  PAYMENTS_RECEIVE_CLIENT: 'payments.receive_client_payment',
  PAYMENTS_EXPORT: 'payments.export',

  // ── Caisse ────────────────────────────────────────────────────────────────────
  CAISSE_VIEW: 'caisse.view',
  CAISSE_OPERATE: 'caisse.operate',
  CAISSE_CLOSE: 'caisse.close',
  CAISSE_ADMIN: 'caisse.admin',
  CAISSE_EXPORT: 'caisse.export',

  // ── Dépenses / paiements fournisseurs ─────────────────────────────────────────
  EXPENSES_VIEW: 'expenses.view',
  EXPENSES_CREATE: 'expenses.create',
  EXPENSES_UPDATE: 'expenses.update',
  EXPENSES_DELETE: 'expenses.delete',
  EXPENSES_PAY_SUPPLIER: 'expenses.pay_supplier',
  EXPENSES_EXPORT: 'expenses.export',

  // ── Rapports ──────────────────────────────────────────────────────────────────
  REPORTS_VIEW: 'reports.view',
  REPORTS_FINANCIAL_VIEW: 'reports.financial.view',
  REPORTS_EXPORT: 'reports.export',
  REPORTS_SALES_STATS: 'reports.sales_stats',
  REPORTS_PURCHASES_STATS: 'reports.purchases_stats',
  REPORTS_STOCK_STATS: 'reports.stock_stats',
  REPORTS_MARGINS: 'reports.margins',

  // ── Alertes ───────────────────────────────────────────────────────────────────
  ALERTS_VIEW: 'alerts.view',
  ALERTS_CREATE: 'alerts.create',
  ALERTS_UPDATE: 'alerts.update',
  ALERTS_DELETE: 'alerts.delete',
  ALERTS_MARK_READ: 'alerts.mark_read',

  // ── Paramètres ────────────────────────────────────────────────────────────────
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',

  // ── Audit logs ────────────────────────────────────────────────────────────────
  AUDIT_LOGS_VIEW: 'audit_logs.view',
  AUDIT_LOGS_EXPORT: 'audit_logs.export',

  // ── Permissions ───────────────────────────────────────────────────────────────
  PERMISSIONS_VIEW: 'permissions.view',
  PERMISSIONS_UPDATE: 'permissions.update',

  // ── Utilisateurs ──────────────────────────────────────────────────────────────
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  USERS_RESET_PASSWORD: 'users.reset_password',

  // ── Corbeille ─────────────────────────────────────────────────────────────────
  TRASH_VIEW: 'trash.view',
  TRASH_RESTORE: 'trash.restore',
  TRASH_PERMANENT_DELETE: 'trash.permanent_delete',
  TRASH_EMPTY: 'trash.empty',

  // ── Documentation ─────────────────────────────────────────────────────────────
  DOCUMENTATION_VIEW: 'documentation.view',
  DOCUMENTATION_CREATE: 'documentation.create',
  DOCUMENTATION_UPDATE: 'documentation.update',
  DOCUMENTATION_DELETE: 'documentation.delete',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDef {
  code: PermissionKey;
  module: string;
  action: string;
  label: string;
  description: string;
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  // ── Dashboard ────────────────────────────────────────────────────────────────
  { code: 'dashboard.view', module: 'dashboard', action: 'view', label: 'Consulter', description: 'Consulter le tableau de bord' },

  // ── Admin ─────────────────────────────────────────────────────────────────────
  { code: 'admin.recalculate_last_sale_prices', module: 'admin', action: 'recalculate_last_sale_prices', label: 'Recalculer prix', description: 'Recalculer les derniers prix de vente produits' },

  // ── Clients ───────────────────────────────────────────────────────────────────
  { code: 'clients.view', module: 'clients', action: 'view', label: 'Consulter', description: 'Consulter les clients' },
  { code: 'clients.create', module: 'clients', action: 'create', label: 'Créer', description: 'Créer un client' },
  { code: 'clients.update', module: 'clients', action: 'update', label: 'Modifier', description: 'Modifier un client' },
  { code: 'clients.delete', module: 'clients', action: 'delete', label: 'Supprimer', description: 'Supprimer un client' },
  { code: 'clients.export', module: 'clients', action: 'export', label: 'Exporter', description: 'Exporter la liste des clients' },
  { code: 'clients.view_history', module: 'clients', action: 'view_history', label: 'Voir historique', description: "Voir l'historique d'un client" },

  // ── Produits ──────────────────────────────────────────────────────────────────
  { code: 'products.view', module: 'products', action: 'view', label: 'Consulter', description: 'Consulter les produits' },
  { code: 'products.create', module: 'products', action: 'create', label: 'Créer', description: 'Créer un produit' },
  { code: 'products.update', module: 'products', action: 'update', label: 'Modifier', description: 'Modifier un produit' },
  { code: 'products.delete', module: 'products', action: 'delete', label: 'Supprimer', description: 'Supprimer un produit' },
  { code: 'products.import', module: 'products', action: 'import', label: 'Importer', description: 'Importer des produits depuis un fichier' },
  { code: 'products.export', module: 'products', action: 'export', label: 'Exporter', description: 'Exporter la liste des produits' },
  { code: 'products.view_margin', module: 'products', action: 'view_margin', label: 'Voir marge', description: 'Voir la marge bénéficiaire des produits' },
  { code: 'products.update_price', module: 'products', action: 'update_price', label: 'Modifier prix', description: 'Modifier le prix de vente' },
  { code: 'products.update_discount', module: 'products', action: 'update_discount', label: 'Modifier remise', description: 'Modifier la remise produit' },

  // ── Ventes ────────────────────────────────────────────────────────────────────
  { code: 'sales.view', module: 'sales', action: 'view', label: 'Consulter', description: 'Consulter les ventes' },
  { code: 'sales.create', module: 'sales', action: 'create', label: 'Créer', description: 'Créer une vente (devis, bon de commande, bon de livraison, facture)' },
  { code: 'sales.update', module: 'sales', action: 'update', label: 'Modifier', description: 'Modifier une vente' },
  { code: 'sales.delete', module: 'sales', action: 'delete', label: 'Supprimer', description: 'Supprimer une vente' },
  { code: 'sales.view_details', module: 'sales', action: 'view_details', label: 'Voir détails', description: "Voir le détail d'une vente" },
  { code: 'sales.allow_low_margin', module: 'sales', action: 'allow_low_margin', label: 'Marge < 20%', description: 'Autoriser vente avec marge < 20%' },
  { code: 'sales.export', module: 'sales', action: 'export', label: 'Exporter', description: 'Exporter les ventes' },
  { code: 'sales.print', module: 'sales', action: 'print', label: 'Imprimer', description: 'Imprimer un document de vente' },
  { code: 'sales.cancel', module: 'sales', action: 'cancel', label: 'Annuler', description: 'Annuler une vente' },
  { code: 'sales.view_history', module: 'sales', action: 'view_history', label: 'Voir historique', description: "Voir l'historique des documents d'une vente" },

  // ── Achats ────────────────────────────────────────────────────────────────────
  { code: 'purchases.view', module: 'purchases', action: 'view', label: 'Consulter', description: 'Consulter les achats' },
  { code: 'purchases.create_order', module: 'purchases', action: 'create_order', label: 'Créer commande', description: 'Créer une commande achat' },
  { code: 'purchases.create_receipt', module: 'purchases', action: 'create_receipt', label: 'Créer réception', description: 'Créer un bon de réception' },
  { code: 'purchases.create_invoice', module: 'purchases', action: 'create_invoice', label: 'Créer facture', description: 'Créer une facture achat' },
  { code: 'purchases.update', module: 'purchases', action: 'update', label: 'Modifier', description: 'Modifier un achat' },
  { code: 'purchases.delete', module: 'purchases', action: 'delete', label: 'Supprimer', description: 'Supprimer un achat' },
  { code: 'purchases.validate_receipt', module: 'purchases', action: 'validate_receipt', label: 'Valider réception', description: 'Valider une réception' },
  { code: 'purchases.export', module: 'purchases', action: 'export', label: 'Exporter', description: 'Exporter les achats' },
  { code: 'purchases.cancel', module: 'purchases', action: 'cancel', label: 'Annuler', description: 'Annuler un achat' },

  // ── Fournisseurs ──────────────────────────────────────────────────────────────
  { code: 'suppliers.view', module: 'suppliers', action: 'view', label: 'Consulter', description: 'Consulter les fournisseurs' },
  { code: 'suppliers.create', module: 'suppliers', action: 'create', label: 'Créer', description: 'Créer un fournisseur' },
  { code: 'suppliers.update', module: 'suppliers', action: 'update', label: 'Modifier', description: 'Modifier un fournisseur' },
  { code: 'suppliers.delete', module: 'suppliers', action: 'delete', label: 'Supprimer', description: 'Supprimer un fournisseur' },
  { code: 'suppliers.export', module: 'suppliers', action: 'export', label: 'Exporter', description: 'Exporter la liste des fournisseurs' },

  // ── Stock ─────────────────────────────────────────────────────────────────────
  { code: 'stock.view', module: 'stock', action: 'view', label: 'Consulter', description: 'Consulter le stock' },
  { code: 'stock.adjust', module: 'stock', action: 'adjust', label: 'Ajuster', description: 'Ajuster / corriger le stock' },
  { code: 'stock.transfer', module: 'stock', action: 'transfer', label: 'Transférer', description: 'Transférer du stock entre emplacements' },
  { code: 'stock.movements.view', module: 'stock', action: 'movements.view', label: 'Voir mouvements', description: 'Voir les mouvements de stock' },
  { code: 'stock.movements.delete', module: 'stock', action: 'movements.delete', label: 'Suppr. mouvement', description: 'Supprimer un mouvement de stock' },
  { code: 'stock.reset', module: 'stock', action: 'reset', label: 'Réinitialiser', description: 'Remettre à zéro tout le stock (inventaire)' },
  { code: 'stock.export', module: 'stock', action: 'export', label: 'Exporter', description: 'Exporter les données de stock' },

  // ── Documents ─────────────────────────────────────────────────────────────────
  { code: 'documents.view', module: 'documents', action: 'view', label: 'Consulter', description: 'Consulter les documents générés' },
  { code: 'documents.create', module: 'documents', action: 'create', label: 'Générer', description: 'Générer un document PDF' },
  { code: 'documents.update', module: 'documents', action: 'update', label: 'Modifier', description: 'Modifier un document' },
  { code: 'documents.delete', module: 'documents', action: 'delete', label: 'Supprimer', description: 'Supprimer un document' },
  { code: 'documents.download', module: 'documents', action: 'download', label: 'Télécharger', description: 'Télécharger un document PDF' },
  { code: 'documents.email', module: 'documents', action: 'email', label: 'Envoyer email', description: 'Envoyer un document par email' },
  { code: 'documents.view_history', module: 'documents', action: 'view_history', label: 'Voir historique', description: 'Voir les logs emails des documents' },

  // ── Paiements clients ─────────────────────────────────────────────────────────
  { code: 'payments.view', module: 'payments', action: 'view', label: 'Consulter', description: 'Consulter les paiements' },
  { code: 'payments.create', module: 'payments', action: 'create', label: 'Créer', description: 'Créer un paiement' },
  { code: 'payments.update', module: 'payments', action: 'update', label: 'Modifier', description: 'Modifier un paiement' },
  { code: 'payments.delete', module: 'payments', action: 'delete', label: 'Supprimer', description: 'Supprimer un paiement' },
  { code: 'payments.receive_client_payment', module: 'payments', action: 'receive_client_payment', label: 'Encaisser client', description: 'Encaisser un paiement client' },
  { code: 'payments.export', module: 'payments', action: 'export', label: 'Exporter', description: 'Exporter les paiements' },

  // ── Caisse ────────────────────────────────────────────────────────────────────
  { code: 'caisse.view', module: 'caisse', action: 'view', label: 'Consulter', description: 'Consulter la caisse et les transactions' },
  { code: 'caisse.operate', module: 'caisse', action: 'operate', label: 'Opérations', description: 'Effectuer des dépôts/retraits manuels' },
  { code: 'caisse.close', module: 'caisse', action: 'close', label: 'Clôturer', description: 'Clôturer la caisse en fin de journée' },
  { code: 'caisse.admin', module: 'caisse', action: 'admin', label: 'Administrer', description: 'Configurer la caisse (solde négatif, paramètres avancés)' },
  { code: 'caisse.export', module: 'caisse', action: 'export', label: 'Exporter', description: 'Exporter les données de caisse' },

  // ── Dépenses / paiements fournisseurs ─────────────────────────────────────────
  { code: 'expenses.view', module: 'expenses', action: 'view', label: 'Consulter', description: 'Consulter les dépenses' },
  { code: 'expenses.create', module: 'expenses', action: 'create', label: 'Créer', description: 'Créer une dépense' },
  { code: 'expenses.update', module: 'expenses', action: 'update', label: 'Modifier', description: 'Modifier une dépense' },
  { code: 'expenses.delete', module: 'expenses', action: 'delete', label: 'Supprimer', description: 'Supprimer une dépense' },
  { code: 'expenses.pay_supplier', module: 'expenses', action: 'pay_supplier', label: 'Payer fournisseur', description: 'Enregistrer un paiement fournisseur' },
  { code: 'expenses.export', module: 'expenses', action: 'export', label: 'Exporter', description: 'Exporter les dépenses' },

  // ── Rapports ──────────────────────────────────────────────────────────────────
  { code: 'reports.view', module: 'reports', action: 'view', label: 'Consulter', description: 'Consulter les rapports' },
  { code: 'reports.financial.view', module: 'reports', action: 'financial.view', label: 'Rapports financiers', description: 'Voir les rapports financiers et marges' },
  { code: 'reports.export', module: 'reports', action: 'export', label: 'Exporter', description: 'Exporter les rapports' },
  { code: 'reports.sales_stats', module: 'reports', action: 'sales_stats', label: 'Stats ventes', description: 'Consulter les statistiques de ventes' },
  { code: 'reports.purchases_stats', module: 'reports', action: 'purchases_stats', label: 'Stats achats', description: 'Consulter les statistiques d\'achats' },
  { code: 'reports.stock_stats', module: 'reports', action: 'stock_stats', label: 'Stats stock', description: 'Consulter les statistiques de stock' },
  { code: 'reports.margins', module: 'reports', action: 'margins', label: 'Bénéfices / Marges', description: 'Voir les bénéfices et marges' },

  // ── Alertes ───────────────────────────────────────────────────────────────────
  { code: 'alerts.view', module: 'alerts', action: 'view', label: 'Consulter', description: 'Consulter les alertes' },
  { code: 'alerts.create', module: 'alerts', action: 'create', label: 'Créer', description: 'Créer une alerte' },
  { code: 'alerts.update', module: 'alerts', action: 'update', label: 'Modifier', description: 'Modifier une alerte' },
  { code: 'alerts.delete', module: 'alerts', action: 'delete', label: 'Supprimer', description: 'Supprimer une alerte' },
  { code: 'alerts.mark_read', module: 'alerts', action: 'mark_read', label: 'Marquer lue', description: 'Marquer une alerte comme lue' },

  // ── Paramètres ────────────────────────────────────────────────────────────────
  { code: 'settings.view', module: 'settings', action: 'view', label: 'Consulter', description: 'Consulter les paramètres' },
  { code: 'settings.update', module: 'settings', action: 'update', label: 'Modifier', description: 'Modifier les paramètres (nom entreprise, couleurs, etc.)' },

  // ── Audit logs ────────────────────────────────────────────────────────────────
  { code: 'audit_logs.view', module: 'audit_logs', action: 'view', label: 'Consulter', description: "Voir les journaux d'audit" },
  { code: 'audit_logs.export', module: 'audit_logs', action: 'export', label: 'Exporter', description: "Exporter les journaux d'audit" },

  // ── Permissions ───────────────────────────────────────────────────────────────
  { code: 'permissions.view', module: 'permissions', action: 'view', label: 'Consulter', description: 'Consulter les permissions des rôles' },
  { code: 'permissions.update', module: 'permissions', action: 'update', label: 'Modifier', description: 'Modifier les permissions des rôles et utilisateurs' },

  // ── Utilisateurs ──────────────────────────────────────────────────────────────
  { code: 'users.view', module: 'users', action: 'view', label: 'Consulter', description: 'Consulter les utilisateurs' },
  { code: 'users.create', module: 'users', action: 'create', label: 'Créer', description: 'Créer un utilisateur' },
  { code: 'users.update', module: 'users', action: 'update', label: 'Modifier', description: 'Modifier un utilisateur' },
  { code: 'users.delete', module: 'users', action: 'delete', label: 'Supprimer', description: 'Supprimer un utilisateur' },
  { code: 'users.reset_password', module: 'users', action: 'reset_password', label: 'Reset mot de passe', description: 'Réinitialiser le mot de passe d\'un utilisateur' },

  // ── Corbeille ─────────────────────────────────────────────────────────────────
  { code: 'trash.view', module: 'trash', action: 'view', label: 'Consulter', description: 'Voir la corbeille' },
  { code: 'trash.restore', module: 'trash', action: 'restore', label: 'Restaurer', description: 'Restaurer un élément depuis la corbeille' },
  { code: 'trash.permanent_delete', module: 'trash', action: 'permanent_delete', label: 'Suppr. définitive', description: 'Supprimer définitivement un élément' },
  { code: 'trash.empty', module: 'trash', action: 'empty', label: 'Vider la corbeille', description: 'Supprimer définitivement tous les éléments de la corbeille' },

  // ── Documentation ─────────────────────────────────────────────────────────────
  { code: 'documentation.view', module: 'documentation', action: 'view', label: 'Consulter', description: 'Consulter la documentation Stockini' },
  { code: 'documentation.create', module: 'documentation', action: 'create', label: 'Créer', description: 'Créer un article de documentation' },
  { code: 'documentation.update', module: 'documentation', action: 'update', label: 'Modifier', description: 'Modifier un article de documentation' },
  { code: 'documentation.delete', module: 'documentation', action: 'delete', label: 'Supprimer', description: 'Supprimer un article de documentation' },
];

export const PERMISSION_CODES = ALL_PERMISSIONS.map((p) => p.code);
