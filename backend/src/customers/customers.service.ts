import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
  ) {}

  async create(dto: CreateCustomerDto) {
    await this.settings.assertActiveOption('customer_types', dto.type);
    const type = dto.type ?? 'INDIVIDUAL';
    return this.prisma.$transaction(async (tx) =>
      tx.customer.create({
        data: {
          ...dto,
          reference: await this.references.generateForCustomer(type, tx),
        },
      }),
    );
  }

  getNextReference(type: string) {
    return this.references.peekNextCustomerReference(type ?? 'INDIVIDUAL');
  }

  findAll(search?: string) {
    return this.prisma.customer.findMany({
      where: search
        ? {
            deletedAt: null,
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.customer.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.settings.assertActiveOption('customer_types', dto.type);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /customers/${id} called by ${userId ?? 'unknown'}`);
    const [salesCount, paymentsCount] = await Promise.all([
      this.prisma.sale.count({ where: { customerId: id } }),
      this.prisma.payment.count({ where: { customerId: id } }),
    ]);
    if (salesCount > 0 || paymentsCount > 0) {
      throw new BadRequestException(
        'Ce client est lié à des ventes ou paiements. Suppression refusée.',
      );
    }
    await this.prisma.customer.delete({ where: { id } });
    this.logger.log(
      `Customer ${id} permanently deleted by ${userId ?? 'unknown'}`,
    );
    return { id };
  }
}
