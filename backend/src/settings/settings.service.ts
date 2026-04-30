import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSettingDto, UpdateSettingDto } from './dto/setting.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSettingDto) {
    return this.prisma.setting.create({ data: dto });
  }

  findAll() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  update(key: string, dto: UpdateSettingDto) {
    return this.prisma.setting.update({ where: { key }, data: dto });
  }

  remove(key: string) {
    return this.prisma.setting.delete({ where: { key } });
  }
}
