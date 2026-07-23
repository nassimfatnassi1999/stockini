import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AlertQueryDto, CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';
import { buildPaginatedResponse } from '../common/utils/pagination.util';

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

  async findAll(query: AlertQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = {
      ...(query.isRead !== undefined && { isRead: query.isRead === 'true' }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' as const } },
          { message: { contains: query.search, mode: 'insensitive' as const } },
          { reference: { contains: query.search, mode: 'insensitive' as const } },
          { designation: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where,
        include: { product: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.alert.count({ where }),
    ]);
    return buildPaginatedResponse(data, page, limit, total);
  }

  markRead(id: string) {
    return this.prisma.alert.update({ where: { id }, data: { isRead: true } });
  }

  async update(id: string, dto: UpdateAlertDto) {
    if (dto.type) {
      await this.settings.assertActiveOption('alert_types', dto.type);
    }
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
