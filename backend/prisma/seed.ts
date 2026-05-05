import { CustomerType, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const roles = [
    { name: 'ADMIN', permissions: ['*'] },
    { name: 'STOCK_MANAGER', permissions: ['products:*', 'stock:*', 'alerts:*', 'reports:read'] },
    { name: 'SELLER', permissions: ['products:read', 'sales:*', 'customers:*', 'payments:*'] },
    { name: 'PURCHASE_MANAGER', permissions: ['products:read', 'purchases:*', 'suppliers:*', 'payments:*'] },
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
    where: { email: 'admin@stockini.local' },
    update: {
      fullName: 'Stockini Admin',
      roleId: adminRoleId,
      isActive: true,
    },
    create: {
      email: 'admin@stockini.local',
      passwordHash: await bcrypt.hash('Admin123!', 10),
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
      (await prisma.supplier.create({ data: supplier }));
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
      await prisma.customer.create({ data: customer });
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
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: { ...product, deletedAt: null, isActive: true },
      create: product,
    });
  }

  await prisma.setting.upsert({
    where: { key: 'company.name' },
    update: { value: 'Stockini' },
    create: { key: 'company.name', value: 'Stockini' },
  });

  console.log('Stockini seed completed');
  console.log('Admin login: admin@stockini.local / Admin123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
