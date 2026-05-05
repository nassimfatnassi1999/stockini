import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateAlertDto) {
    return this.prisma.alert.create({ data: dto });
  }

  findAll(isRead?: string) {
    return this.prisma.alert.findMany({
      where: isRead === undefined ? undefined : { isRead: isRead === 'true' },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  markRead(id: string) {
    return this.prisma.alert.update({ where: { id }, data: { isRead: true } });
  }

  update(id: string, dto: UpdateAlertDto) {
    return this.prisma.alert.update({ where: { id }, data: dto, include: { product: true } });
  }

  remove(id: string) {
    return this.prisma.alert.delete({ where: { id } });
  }
}
