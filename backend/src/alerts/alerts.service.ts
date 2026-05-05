import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async create(dto: CreateAlertDto) {
    await this.settings.assertActiveOption('alert_types', dto.type);
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

  async update(id: string, dto: UpdateAlertDto) {
    await this.settings.assertActiveOption('alert_types', dto.type);
    return this.prisma.alert.update({
      where: { id },
      data: dto,
      include: { product: true },
    });
  }

  remove(id: string) {
    return this.prisma.alert.delete({ where: { id } });
  }
}
