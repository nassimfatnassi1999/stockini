import { Injectable, Logger } from '@nestjs/common';
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
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId ?? null },
    });
    this.logger.log(`Customer ${id} moved to trash by ${userId ?? 'unknown'}`);
    return { id };
  }
}
