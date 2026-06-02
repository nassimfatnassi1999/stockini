import { CustomerOrigin, CustomerType, Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCustomer(overrides: Partial<{
  id: string;
  origin: CustomerOrigin;
  name: string;
  type: CustomerType;
}> = {}) {
  return {
    id: overrides.id ?? 'cust-1',
    reference: 'CLI-001',
    name: overrides.name ?? 'Test Client',
    phone: null,
    email: null,
    address: null,
    type: overrides.type ?? CustomerType.INDIVIDUAL,
    origin: overrides.origin ?? CustomerOrigin.MANUAL,
    taxNumber: null,
    creditBalance: new Prisma.Decimal(0),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
  };
}

function makeInvoice(customerId: string, total: number, paidAmount: number) {
  return {
    customerId,
    total: new Prisma.Decimal(total),
    paidAmount: new Prisma.Decimal(paidAmount),
  };
}

function buildService(customers: ReturnType<typeof makeCustomer>[], invoices: ReturnType<typeof makeInvoice>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    customer: {
      findMany: jest.fn().mockResolvedValue(customers),
      findFirstOrThrow: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(customers.find((c) => c.id === where.id) ?? null),
      ),
      create: jest.fn(),
      update: jest.fn(),
    },
    sale: {
      findMany: jest.fn().mockResolvedValue(invoices),
    },
  };
  const references = { generateForCustomer: jest.fn(), peekNextCustomerReference: jest.fn() } as any;
  const settings = { assertActiveOption: jest.fn() } as any;
  const service = new CustomersService(prisma, references, settings);
  return { service, prisma };
}

// ─── Tests findAll ────────────────────────────────────────────────────────────

describe('CustomersService.findAll — filtrage origin/dette', () => {

  it('retourne un client MANUAL même si dette = 0', async () => {
    const customer = makeCustomer({ id: 'c1', origin: CustomerOrigin.MANUAL });
    const { service } = buildService([customer], []);

    const result = await service.findAll();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
    expect(result[0].debtAmount).toBe(0);
  });

  it('masque un client SALE_COUNTER entièrement payé (dette = 0)', async () => {
    const customer = makeCustomer({ id: 'c2', origin: CustomerOrigin.SALE_COUNTER });
    const invoice = makeInvoice('c2', 200, 200); // total payé
    const { service } = buildService([customer], [invoice]);

    const result = await service.findAll();

    expect(result).toHaveLength(0);
  });

  it('affiche un client SALE_COUNTER avec dette > 0', async () => {
    const customer = makeCustomer({ id: 'c3', origin: CustomerOrigin.SALE_COUNTER });
    const invoice = makeInvoice('c3', 300, 100); // reste 200
    const { service } = buildService([customer], [invoice]);

    const result = await service.findAll();

    expect(result).toHaveLength(1);
    expect(result[0].debtAmount).toBeCloseTo(200);
  });

  it('masque SALE_COUNTER après règlement total de la dette', async () => {
    const customer = makeCustomer({ id: 'c4', origin: CustomerOrigin.SALE_COUNTER });
    // Simule que la facture est entièrement réglée (cas post-paiement)
    const invoice = makeInvoice('c4', 500, 500);
    const { service } = buildService([customer], [invoice]);

    const result = await service.findAll();

    expect(result).toHaveLength(0);
  });

  it('garde toujours les clients MANUAL même avec dette = 0, et affiche la dette pour SALE_COUNTER avec solde', async () => {
    const manual = makeCustomer({ id: 'm1', origin: CustomerOrigin.MANUAL });
    const counter = makeCustomer({ id: 'sc1', origin: CustomerOrigin.SALE_COUNTER });
    const invoices = [
      makeInvoice('m1', 100, 100), // manuel, payé
      makeInvoice('sc1', 400, 250), // comptoir, reste 150
    ];
    const { service } = buildService([manual, counter], invoices);

    const result = await service.findAll();

    expect(result).toHaveLength(2);
    const manualResult = result.find((c) => c.id === 'm1')!;
    const counterResult = result.find((c) => c.id === 'sc1')!;
    expect(manualResult.debtAmount).toBe(0);
    expect(counterResult.debtAmount).toBeCloseTo(150);
  });

  it('ne cache pas un client MANUAL INDIVIDUAL même sans ventes ni dettes', async () => {
    const customer = makeCustomer({ id: 'm2', origin: CustomerOrigin.MANUAL, type: CustomerType.INDIVIDUAL });
    const { service } = buildService([customer], []);

    const result = await service.findAll();

    expect(result).toHaveLength(1);
  });

  it('les documents/historiques ne sont pas affectés — findOne retourne le client SALE_COUNTER', async () => {
    const customer = makeCustomer({ id: 'sc2', origin: CustomerOrigin.SALE_COUNTER });
    // findOne ne filtre pas par origin — le client reste accessible via son id (pour les documents)
    const invoices = [makeInvoice('sc2', 100, 100)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      customer: {
        findFirstOrThrow: jest.fn().mockResolvedValue(customer),
      },
      sale: {
        findMany: jest.fn().mockResolvedValue(invoices),
      },
    };
    const references = {} as any;
    const settings = {} as any;
    const service = new CustomersService(prisma, references, settings);

    const result = await service.findOne('sc2');

    expect(result.id).toBe('sc2');
    expect(result.debtAmount).toBe(0);
  });
});
