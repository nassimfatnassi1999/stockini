import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResponse } from '../common/utils/pagination.util';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UsersQueryDto,
} from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(query: UsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (query.search?.trim()) {
      where.OR = [
        { fullName: { contains: query.search.trim(), mode: 'insensitive' } },
        { email: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    if (query.role?.trim()) {
      where.role = { name: query.role.trim() };
    }

    if (query.status === 'active') {
      where.isActive = true;
    } else if (query.status === 'inactive') {
      where.isActive = false;
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.safeSelect(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResponse(data, page, limit, total);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.safeSelect(),
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, currentUserId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const role = await this.prisma.role.findUnique({
      where: { name: dto.roleName },
    });
    if (!role)
      throw new BadRequestException(`Role '${dto.roleName}' not found`);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        roleId: role.id,
        isActive: dto.isActive ?? true,
      },
      select: this.safeSelect(),
    });

    await this.auditLogs.create({
      userId: currentUserId,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id,
      metadata: {
        email: user.email,
        fullName: user.fullName,
        roleName: dto.roleName,
      },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, currentUserId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    // Prevent demoting the last admin
    if (
      dto.roleName &&
      dto.roleName !== 'ADMIN' &&
      existing.role.name === 'ADMIN'
    ) {
      await this.ensureNotLastAdmin(id);
    }

    let roleId: string | undefined;
    if (dto.roleName) {
      const role = await this.prisma.role.findUnique({
        where: { name: dto.roleName },
      });
      if (!role)
        throw new BadRequestException(`Role '${dto.roleName}' not found`);
      roleId = role.id;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(roleId !== undefined && { roleId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: this.safeSelect(),
    });

    await this.auditLogs.create({
      userId: currentUserId,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      metadata: dto as Record<string, unknown>,
    });

    return updated;
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    currentUserId: string,
  ) {
    if (id === currentUserId) {
      throw new ForbiddenException('Cannot change your own account status');
    }

    if (!dto.isActive) {
      await this.ensureNotLastAdmin(id);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
      select: this.safeSelect(),
    });

    await this.auditLogs.create({
      userId: currentUserId,
      action: 'USER_STATUS_CHANGED',
      entity: 'User',
      entityId: id,
      metadata: { isActive: dto.isActive },
    });

    return user;
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    currentUserId: string,
  ) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });

    await this.auditLogs.create({
      userId: currentUserId,
      action: 'USER_PASSWORD_RESET',
      entity: 'User',
      entityId: id,
    });

    return { ok: true };
  }

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    await this.ensureNotLastAdmin(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: this.safeSelect(),
    });

    await this.auditLogs.create({
      userId: currentUserId,
      action: 'USER_DELETED',
      entity: 'User',
      entityId: id,
      metadata: { email: user.email, fullName: user.fullName },
    });

    return user;
  }

  private async ensureNotLastAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user || user.role.name !== 'ADMIN') return;

    const otherActiveAdmins = await this.prisma.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        role: { name: 'ADMIN' },
      },
    });

    if (otherActiveAdmins === 0) {
      throw new ForbiddenException(
        'Cannot remove or deactivate the last active administrator',
      );
    }
  }

  private safeSelect() {
    return {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      role: { select: { id: true, name: true } },
    } as const;
  }
}
