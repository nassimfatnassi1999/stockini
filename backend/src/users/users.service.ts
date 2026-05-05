import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        roleId: dto.roleId,
        isActive: dto.isActive ?? true,
      },
      select: this.safeSelect(),
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      select: this.safeSelect(),
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: this.safeSelect(),
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;
    return this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        fullName: dto.fullName,
        roleId: dto.roleId,
        isActive: dto.isActive,
        passwordHash,
      },
      select: this.safeSelect(),
    });
  }

  remove(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: this.safeSelect(),
    });
  }

  private safeSelect() {
    return {
      id: true,
      email: true,
      fullName: true,
      roleId: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    } as const;
  }
}
