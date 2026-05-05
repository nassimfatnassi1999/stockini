import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto, UpdatePaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePaymentDto) {
    return this.prisma.payment.create({ data: dto });
  }

  findAll() {
    return this.prisma.payment.findMany({
      include: { sale: true, purchase: true, customer: true, supplier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.payment.findUniqueOrThrow({
      where: { id },
      include: { sale: true, purchase: true, customer: true, supplier: true },
    });
  }

  update(id: string, dto: UpdatePaymentDto) {
    return this.prisma.payment.update({
      where: { id },
      data: dto,
      include: { sale: true, purchase: true, customer: true, supplier: true },
    });
  }

  remove(id: string) {
    return this.prisma.payment.delete({ where: { id } });
  }
}
