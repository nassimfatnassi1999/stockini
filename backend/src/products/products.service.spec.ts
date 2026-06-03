import { ProductsService } from './products.service';
import type { ProductQueryDto } from './dto/product.dto';

/**
 * Tests unitaires pour ProductsService.findAll() — filtres combinés.
 * Tous les appels Prisma sont mockés : aucune BDD nécessaire.
 */
describe('ProductsService.findAll – filtres avancés', () => {
  function makeProduct(overrides: Record<string, unknown> = {}) {
    return {
      id: 'p1',
      idProduct: 'PRD-001',
      reference: 'REF-001',
      sku: 'SKU-001',
      name: 'Produit test',
      quantity: 10,
      minStock: 5,
      isActive: true,
      deletedAt: null,
      categoryId: 'cat1',
      brandId: 'brd1',
      supplierId: 'sup1',
      purchasePrice: { gte: jest.fn(), lte: jest.fn() },
      salePrice: { gte: jest.fn(), lte: jest.fn() },
      category: { id: 'cat1', name: 'Catégorie A' },
      brand: { id: 'brd1', name: 'Marque X' },
      supplier: { id: 'sup1', name: 'Fournisseur Z' },
      ...overrides,
    };
  }

  function buildService(products: unknown[] = [makeProduct()]) {
    const findMany = jest.fn().mockResolvedValue(products);
    const prisma = {
      product: { findMany },
    } as never;
    const service = new ProductsService(prisma, {} as never);
    return { service, findMany };
  }

  async function captureWhere(query: Partial<ProductQueryDto>) {
    const { service, findMany } = buildService();
    await service.findAll(query as ProductQueryDto);
    return findMany.mock.calls[0][0].where as Record<string, unknown>;
  }

  it('filtre par categoryId seul', async () => {
    const where = await captureWhere({ categoryId: 'cat-abc' });
    expect(where.categoryId).toBe('cat-abc');
    expect(where.brandId).toBeUndefined();
    expect(where.supplierId).toBeUndefined();
  });

  it('filtre par brandId seul', async () => {
    const where = await captureWhere({ brandId: 'brd-xyz' });
    expect(where.brandId).toBe('brd-xyz');
    expect(where.categoryId).toBeUndefined();
  });

  it('combine categoryId + brandId', async () => {
    const where = await captureWhere({ categoryId: 'cat-1', brandId: 'brd-1' });
    expect(where.categoryId).toBe('cat-1');
    expect(where.brandId).toBe('brd-1');
  });

  it('combine supplierId + status (inactive)', async () => {
    const where = await captureWhere({ supplierId: 'sup-1', status: 'inactive' });
    expect(where.supplierId).toBe('sup-1');
    expect(where.isActive).toBe(false);
  });

  it('filtre status active => isActive: true', async () => {
    const where = await captureWhere({ status: 'active' });
    expect(where.isActive).toBe(true);
  });

  it('filtre stock "out" => quantity: 0', async () => {
    const where = await captureWhere({ stockStatus: 'out' });
    expect(where.quantity).toBe(0);
  });

  it('filtre stock "available" => quantity > 0', async () => {
    const where = await captureWhere({ stockStatus: 'available' });
    expect(where.quantity).toEqual({ gt: 0 });
  });

  it('filtre stock "low" — filtrage post-query côté service', async () => {
    const products = [
      { ...makeProduct(), quantity: 3, minStock: 5 },   // stock bas (3 <= 5)
      { ...makeProduct(), id: 'p2', quantity: 10, minStock: 5 }, // OK
      { ...makeProduct(), id: 'p3', quantity: 0, minStock: 5 },  // rupture — exclu (0 n'est pas > 0)
    ];
    const { service } = buildService(products);
    const result = await service.findAll({ stockStatus: 'low' } as ProductQueryDto);
    expect(result).toHaveLength(1);
    expect((result[0] as { id: string }).id).toBe('p1');
  });

  it('filtre prix achat min/max', async () => {
    const where = await captureWhere({ purchasePriceMin: 10, purchasePriceMax: 50 });
    expect(where.purchasePrice).toEqual({ gte: 10, lte: 50 });
  });

  it('filtre prix vente min seul', async () => {
    const where = await captureWhere({ salePriceMin: 20 });
    expect(where.salePrice).toEqual({ gte: 20 });
    expect((where.purchasePrice as undefined)).toBeUndefined();
  });

  it('filtre prix vente max seul', async () => {
    const where = await captureWhere({ salePriceMax: 100 });
    expect(where.salePrice).toEqual({ lte: 100 });
  });

  it('sans aucun filtre — pas de champs supplémentaires dans where', async () => {
    const where = await captureWhere({});
    expect(where.categoryId).toBeUndefined();
    expect(where.brandId).toBeUndefined();
    expect(where.supplierId).toBeUndefined();
    expect(where.isActive).toBeUndefined();
    expect(where.purchasePrice).toBeUndefined();
    expect(where.salePrice).toBeUndefined();
    expect(where.deletedAt).toBeNull();
  });

  it('search texte construit le bon OR', async () => {
    const where = await captureWhere({ search: 'frein' });
    expect(Array.isArray(where.OR)).toBe(true);
    const orArr = where.OR as Array<Record<string, unknown>>;
    const fields = orArr.map((c) => Object.keys(c)[0]);
    expect(fields).toContain('reference');
    expect(fields).toContain('name');
  });

  it('search en mode REFERENCE ne cherche pas dans name', async () => {
    const where = await captureWhere({ search: 'REF', searchMode: 'REFERENCE' });
    const orArr = where.OR as Array<Record<string, unknown>>;
    const fields = orArr.map((c) => Object.keys(c)[0]);
    expect(fields).not.toContain('name');
    expect(fields).toContain('reference');
  });

  it('reset filtres — résultat identique à sans filtre', async () => {
    const withFilters = await captureWhere({ categoryId: 'cat-1', brandId: 'brd-1' });
    const withReset = await captureWhere({});
    expect(withReset.categoryId).toBeUndefined();
    expect(withFilters.categoryId).toBe('cat-1');
  });
});
