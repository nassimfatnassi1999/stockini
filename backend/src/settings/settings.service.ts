import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDropdownOptionDto,
  ToggleDropdownOptionDto,
  UpdateDropdownOptionDto,
} from './dto/dropdown-option.dto';
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

  categories() {
    return this.prisma.dropdownOption.groupBy({
      by: ['category'],
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
  }

  findOptions(category?: string, activeOnly = false) {
    return this.prisma.dropdownOption.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  createOption(dto: CreateDropdownOptionDto) {
    return this.prisma.dropdownOption.create({
      data: {
        category: dto.category,
        label: dto.label,
        value: dto.value,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  updateOption(id: string, dto: UpdateDropdownOptionDto) {
    return this.prisma.dropdownOption.update({ where: { id }, data: dto });
  }

  toggleOption(id: string, dto: ToggleDropdownOptionDto) {
    return this.prisma.dropdownOption.update({
      where: { id },
      data: { active: dto.active },
    });
  }

  async deleteOption(id: string) {
    const option = await this.prisma.dropdownOption.findUniqueOrThrow({
      where: { id },
    });
    if (await this.optionIsUsed(option.category, option.value)) {
      throw new BadRequestException(
        'Option already used. Disable it instead of deleting it.',
      );
    }
    return this.prisma.dropdownOption.delete({ where: { id } });
  }

  async assertActiveOption(category: string, value?: string | null) {
    if (!value) {
      return;
    }
    const option = await this.prisma.dropdownOption.findUnique({
      where: { category_value: { category, value } },
    });
    if (option && !option.active) {
      throw new BadRequestException(
        `Option ${value} is disabled for ${category}`,
      );
    }
  }

  private async optionIsUsed(category: string, value: string) {
    switch (category) {
      case 'customer_types':
        return (
          (await this.prisma.customer.count({
            where: { type: value as any },
          })) > 0
        );
      case 'payment_methods':
        return (
          (await this.prisma.payment.count({
            where: { method: value as any },
          })) > 0
        );
      case 'payment_types':
        return (
          (await this.prisma.payment.count({ where: { type: value as any } })) >
          0
        );
      case 'sale_statuses':
        return (
          (await this.prisma.sale.count({ where: { status: value as any } })) >
          0
        );
      case 'purchase_statuses':
        return (
          (await this.prisma.purchase.count({
            where: { status: value as any },
          })) > 0
        );
      case 'payment_statuses':
        return (
          (await this.prisma.sale.count({
            where: { paymentStatus: value as any },
          })) +
            (await this.prisma.purchase.count({
              where: { paymentStatus: value as any },
            })) >
          0
        );
      case 'alert_types':
        return (
          (await this.prisma.alert.count({ where: { type: value as any } })) > 0
        );
      case 'stock_operation_types':
        return (
          (await this.prisma.stockMovement.count({
            where: { type: value as any },
          })) > 0
        );
      case 'stock_movement_reasons':
        return (
          (await this.prisma.stockMovement.count({
            where: { reason: value },
          })) > 0
        );
      case 'stock_locations':
        return (
          (await this.prisma.product.count({ where: { location: value } })) > 0
        );
      default:
        return false;
    }
  }
}
