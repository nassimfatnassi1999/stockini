import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
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
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.customer.findUniqueOrThrow({ where: { id } });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.settings.assertActiveOption('customer_types', dto.type);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.customer.delete({ where: { id } });
  }
}
