import { CustomerType, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashUserPassword } from '../src/users/password.util';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to seed the database`);
  }

  return value;
}

const connectionString = requireEnv('DATABASE_URL');
const seedAdminEmail = requireEnv('SEED_ADMIN_EMAIL');
const seedAdminPassword = requireEnv('SEED_ADMIN_PASSWORD');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const currentYear = new Date().getFullYear();
  const counters = new Map<string, number>();
  const nextReference = (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${currentYear}-${String(next).padStart(6, '0')}`;
  };

  const roles = [
    // ADMIN / SUPER_ADMIN: wildcard covers everything
    { name: 'ADMIN', permissions: ['*'] },
    { name: 'SUPER_ADMIN', permissions: ['*'] },
    {
      // Responsable stock — gestion physique du stock, produits, alertes, rapports stock
      name: 'STOCK_MANAGER',
      permissions: [
        'dashboard.view',
        // Produits
        'products.view', 'products.create', 'products.update',
        'products.import', 'products.export',
        'products.view_margin',
        // Stock
        'stock.view', 'stock.adjust', 'stock.transfer',
        'stock.movements.view', 'stock.export',
        // Alertes
        'alerts.view', 'alerts.create', 'alerts.update', 'alerts.delete', 'alerts.mark_read',
        // Rapports stock
        'reports.view', 'reports.stock_stats', 'reports.export',
        // Corbeille limitée
        'trash.view', 'trash.restore',
        // Documentation
        'documentation.view',
      ],
    },
    {
      // Vendeur — ventes, clients, documents, paiements clients, caisse
      name: 'SELLER',
      permissions: [
        'dashboard.view',
        // Clients
        'clients.view', 'clients.create', 'clients.update', 'clients.view_history',
        // Produits (consultation uniquement)
        'products.view',
        // Stock (consultation uniquement)
        'stock.view', 'stock.movements.view',
        // Ventes
        'sales.view', 'sales.create', 'sales.update', 'sales.delete',
        'sales.view_details', 'sales.cancel', 'sales.print', 'sales.view_history',
        'sales.consolidate', 'sales.consolidation.cancel',
        'sales.line.edit_unit_price_ht',
        // Documents
        'documents.view', 'documents.create', 'documents.download',
        'documents.email', 'documents.view_history',
        // Paiements clients
        'payments.view', 'payments.create', 'payments.receive_client_payment',
        // Caisse (consultation + opérations)
        'caisse.view', 'caisse.operate',
        // Alertes (consultation)
        'alerts.view', 'alerts.mark_read',
        // Documentation
        'documentation.view',
      ],
    },
    {
      // Caissier — encaissements, consultation clients/factures et opérations de caisse
      name: 'CASHIER',
      permissions: [
        'dashboard.view',
        // Clients et factures (lecture uniquement)
        'clients.view',
        'sales.view', 'sales.view_details', 'sales.print',
        'documents.view', 'documents.download',
        // Encaissements clients
        'payments.view', 'payments.create', 'payments.receive_client_payment',
        // Caisse (mouvements et opérations, sans administration)
        'caisse.view', 'caisse.operate', 'caisse.close',
      ],
    },
    {
      // Responsable achats — fournisseurs, achats, stock réception, paiements fournisseurs
      name: 'PURCHASE_MANAGER',
      permissions: [
        'dashboard.view',
        // Produits (consultation)
        'products.view', 'products.view_margin',
        // Stock (consultation + ajustement réception)
        'stock.view', 'stock.adjust', 'stock.movements.view', 'stock.export',
        // Fournisseurs
        'suppliers.view', 'suppliers.create', 'suppliers.update', 'suppliers.export',
        // Achats
        'purchases.view', 'purchases.create_order', 'purchases.create_receipt',
        'purchases.create_invoice', 'purchases.update', 'purchases.validate_receipt',
        'purchases.cancel', 'purchases.export',
        // Documents
        'documents.view', 'documents.create', 'documents.download', 'documents.email',
        // Paiements
        'payments.view', 'payments.create',
        // Dépenses / Paiements fournisseurs
        'expenses.read', 'expenses.view', 'expenses.create', 'expenses.update',
        'expenses.cancel', 'expenses.pay_supplier', 'expenses.export',
        // Rapports achats
        'reports.view', 'reports.purchases_stats', 'reports.stock_stats', 'reports.export',
        // Documentation
        'documentation.view',
      ],
    },
  ];

  const roleByName = new Map<string, string>();
  for (const role of roles) {
    const saved = await prisma.role.upsert({
      where: { name: role.name },
      update: { permissions: role.permissions },
      create: role,
    });
    roleByName.set(role.name, saved.id);
  }

  const adminRoleId = roleByName.get('ADMIN');
  if (!adminRoleId) {
    throw new Error('ADMIN role was not created');
  }

  await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: {
      fullName: 'Stockini Admin',
      roleId: adminRoleId,
      isActive: true,
    },
    create: {
      email: seedAdminEmail,
      passwordHash: await hashUserPassword(seedAdminPassword),
      fullName: 'Stockini Admin',
      roleId: adminRoleId,
      isActive: true,
    },
  });

  const categoryNames = [
    'Moteur',
    'Freinage',
    'Suspension',
    'Électricité',
    'Filtres',
    'Batteries',
    'Pneus',
    'Accessoires',
  ];
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categories.set(name, category.id);
  }

  const brandNames = ['Bosch', 'NGK', 'Continental', 'Toyota', 'Renault', 'Peugeot', 'Volkswagen'];
  const brands = new Map<string, string>();
  for (const name of brandNames) {
    const brand = await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    brands.set(name, brand.id);
  }

  const supplierData = [
    {
      name: 'Auto Parts SARL',
      contactPerson: 'Karim Ben Ali',
      phone: '+216 71 100 200',
      email: 'contact@autoparts-sarl.tn',
      address: 'Zone industrielle Charguia, Tunis',
      taxNumber: 'TN100200300',
      paymentTerms: '30 jours',
    },
    {
      name: 'Tunis Spare Distribution',
      contactPerson: 'Mouna Trabelsi',
      phone: '+216 70 250 400',
      email: 'sales@tunis-spare.tn',
      address: 'Ariana, Tunis',
      taxNumber: 'TN250400600',
      paymentTerms: '45 jours',
    },
    {
      name: 'Maghreb Pièces Auto',
      contactPerson: 'Hatem Mansour',
      phone: '+216 73 500 600',
      email: 'contact@maghrebpieces.tn',
      address: 'Route de Sousse, Sahloul',
      taxNumber: 'TN500600700',
      paymentTerms: 'Comptant',
    },
  ];
  const suppliers = new Map<string, string>();
  for (const supplier of supplierData) {
    const saved =
      (await prisma.supplier.findFirst({ where: { name: supplier.name } })) ??
      (await prisma.supplier.create({ data: { ...supplier, reference: nextReference('FOU') } }));
    suppliers.set(supplier.name, saved.id);
  }

  const customerData = [
    {
      name: 'Garage Mabrouk',
      phone: '+216 98 111 222',
      email: 'garage.mabrouk@example.tn',
      address: 'Ben Arous',
      type: CustomerType.GARAGE,
      creditBalance: 0,
    },
    {
      name: 'Auto Top SARL',
      phone: '+216 55 333 444',
      email: 'contact@autotop.tn',
      address: 'Lac 2, Tunis',
      type: CustomerType.COMPANY,
      taxNumber: 'TN900800700',
      creditBalance: 125,
    },
    {
      name: 'Sami Mrad',
      phone: '+216 22 555 777',
      email: 'sami.mrad@example.tn',
      address: 'La Marsa',
      type: CustomerType.INDIVIDUAL,
      creditBalance: 0,
    },
  ];
  for (const customer of customerData) {
    const existing = await prisma.customer.findFirst({ where: { name: customer.name } });
    if (existing) {
      await prisma.customer.update({ where: { id: existing.id }, data: customer });
    } else {
      await prisma.customer.create({ data: { ...customer, reference: nextReference('CLI') } });
    }
  }

  const pick = (map: Map<string, string>, key: string) => {
    const value = map.get(key);
    if (!value) {
      throw new Error(`Missing seed reference: ${key}`);
    }
    return value;
  };

  const productData = [
    {
      sku: 'BRK-PAD-001',
      barcode: '6190000000010',
      name: 'Plaquettes de frein avant',
      description: 'Jeu de plaquettes avant compatible citadines compactes.',
      categoryId: pick(categories, 'Freinage'),
      brandId: pick(brands, 'Bosch'),
      supplierId: pick(suppliers, 'Auto Parts SARL'),
      purchasePrice: 38,
      salePrice: 65,
      quantity: 24,
      minStock: 6,
      location: 'A1-01',
    },
    {
      sku: 'FLT-OIL-002',
      barcode: '6190000000027',
      name: 'Filtre à huile moteur',
      description: 'Filtre à huile moteur essence et diesel.',
      categoryId: pick(categories, 'Filtres'),
      brandId: pick(brands, 'Toyota'),
      supplierId: pick(suppliers, 'Tunis Spare Distribution'),
      purchasePrice: 12,
      salePrice: 22,
      quantity: 48,
      minStock: 12,
      location: 'B2-04',
    },
    {
      sku: 'BAT-12V-003',
      barcode: '6190000000034',
      name: 'Batterie 12V 60Ah',
      description: 'Batterie automobile 12V 60Ah.',
      categoryId: pick(categories, 'Batteries'),
      brandId: pick(brands, 'Continental'),
      supplierId: pick(suppliers, 'Maghreb Pièces Auto'),
      purchasePrice: 145,
      salePrice: 219,
      quantity: 9,
      minStock: 4,
      location: 'C1-02',
    },
    {
      sku: 'SUS-AMO-004',
      barcode: '6190000000041',
      name: 'Amortisseur avant gauche',
      description: 'Amortisseur avant gauche pour véhicules compacts.',
      categoryId: pick(categories, 'Suspension'),
      brandId: pick(brands, 'Renault'),
      supplierId: pick(suppliers, 'Auto Parts SARL'),
      purchasePrice: 92,
      salePrice: 148,
      quantity: 6,
      minStock: 3,
      location: 'D1-03',
    },
    {
      sku: 'IGN-NGK-005',
      barcode: '6190000000058',
      name: "Bougie d'allumage NGK",
      description: "Bougie d'allumage haute performance.",
      categoryId: pick(categories, 'Moteur'),
      brandId: pick(brands, 'NGK'),
      supplierId: pick(suppliers, 'Tunis Spare Distribution'),
      purchasePrice: 8.5,
      salePrice: 15,
      quantity: 80,
      minStock: 20,
      location: 'B1-01',
    },
    {
      sku: 'ELE-ALT-006',
      barcode: '6190000000065',
      name: 'Alternateur 90A',
      description: 'Alternateur 90A échange standard.',
      categoryId: pick(categories, 'Électricité'),
      brandId: pick(brands, 'Peugeot'),
      supplierId: pick(suppliers, 'Maghreb Pièces Auto'),
      purchasePrice: 180,
      salePrice: 285,
      quantity: 4,
      minStock: 2,
      location: 'E2-01',
    },
    {
      sku: 'TIR-195-007',
      barcode: '6190000000072',
      name: 'Pneu 195/65 R15',
      description: 'Pneu tourisme 195/65 R15.',
      categoryId: pick(categories, 'Pneus'),
      brandId: pick(brands, 'Continental'),
      supplierId: pick(suppliers, 'Auto Parts SARL'),
      purchasePrice: 135,
      salePrice: 199,
      quantity: 18,
      minStock: 8,
      location: 'P1-01',
    },
  ];

  for (const product of productData) {
    const autoRef = nextReference('PRD');
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: { ...product, deletedAt: null, isActive: true },
      create: { ...product, idProduct: autoRef, reference: product.sku },
    });
  }

  await prisma.setting.upsert({
    where: { key: 'company.name' },
    update: { value: 'Stockini' },
    create: { key: 'company.name', value: 'Stockini' },
  });

  const dropdownOptions = [
    ['customer_types', 'Passager', 'INDIVIDUAL', 1],
    ['customer_types', 'Entreprise', 'COMPANY', 2],
    ['customer_types', 'Garage', 'GARAGE', 3],
    ['payment_methods', 'Espèces', 'CASH', 1],
    ['payment_methods', 'Carte bancaire', 'CARD', 2],
    ['payment_methods', 'Virement', 'BANK_TRANSFER', 3],
    ['payment_methods', 'Chèque', 'CHECK', 4],
    ['payment_methods', 'Crédit', 'CREDIT', 5],
    ['payment_types', 'Paiement client', 'CUSTOMER_PAYMENT', 1],
    ['payment_types', 'Paiement fournisseur', 'SUPPLIER_PAYMENT', 2],
    ['stock_operation_types', 'Entrée', 'ENTRY', 1],
    ['stock_operation_types', 'Sortie', 'EXIT', 2],
    ['stock_operation_types', 'Correction inventaire', 'ADJUSTMENT', 3],
    ['stock_movement_reasons', 'entry', 'entry', 1],
    ['stock_movement_reasons', 'sale', 'sale', 2],
    ['stock_movement_reasons', 'correction', 'correction', 3],
    ['stock_movement_reasons', 'retour', 'retour', 4],
    ['sale_statuses', 'Brouillon', 'DRAFT', 1],
    ['sale_statuses', 'Terminée', 'COMPLETED', 2],
    ['sale_statuses', 'Annulée', 'CANCELLED', 3],
    ['sale_statuses', 'Retournée', 'RETURNED', 4],
    ['purchase_statuses', 'Brouillon', 'DRAFT', 1],
    ['purchase_statuses', 'Commandée', 'ORDERED', 2],
    ['purchase_statuses', 'Partiellement reçue', 'PARTIALLY_RECEIVED', 3],
    ['purchase_statuses', 'Reçue', 'RECEIVED', 4],
    ['purchase_statuses', 'Annulée', 'CANCELLED', 5],
    ['payment_statuses', 'Non payé', 'UNPAID', 1],
    ['payment_statuses', 'Partiel', 'PARTIAL', 2],
    ['payment_statuses', 'Payé', 'PAID', 3],
    ['report_types', 'Tableau de bord', 'dashboard', 1],
    ['report_types', 'Stock', 'stock', 2],
    ['report_types', 'Ventes', 'sales', 3],
    ['report_types', 'Achats', 'purchases', 4],
    ['alert_types', 'Stock faible', 'LOW_STOCK', 1],
    ['alert_types', 'Rupture de stock', 'OUT_OF_STOCK', 2],
    ['alert_types', 'Facture impayée', 'UNPAID_INVOICE', 3],
    ['alert_types', 'Retard achat', 'PURCHASE_DELAY', 4],
    ['alert_types', 'Système', 'SYSTEM', 5],
    ['units', 'Pièce', 'piece', 1],
    ['units', 'Lot', 'lot', 2],
    ['stock_locations', 'A1-01', 'A1-01', 1],
    ['stock_locations', 'B1-01', 'B1-01', 2],
    ['stock_locations', 'B2-04', 'B2-04', 3],
  ] as const;

  for (const [category, label, value, sortOrder] of dropdownOptions) {
    await prisma.dropdownOption.upsert({
      where: { category_value: { category, value } },
      update: { label, sortOrder, active: true },
      create: { category, label, value, sortOrder, active: true },
    });
  }

  console.log('Stockini seed completed');
  console.log(`Admin login: ${seedAdminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
