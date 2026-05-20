import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { ChangePasswordDto, LoginDto, UpdateProfileDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly rbac: RbacService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const effective = await this.rbac.getEffectivePermissions(user.id);

    const payload = { sub: user.id, email: user.email, role: user.role.name };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as JwtSignOptions['expiresIn'],
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
        isActive: user.isActive,
        permissions: effective.permissions,
        isSuperAdmin: effective.isSuperAdmin,
      },
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        role: string;
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { role: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const effective = await this.rbac.getEffectivePermissions(user.id);
      const newPayload = { sub: user.id, email: user.email, role: user.role.name };
      const accessToken = await this.jwtService.signAsync(newPayload);

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role.name,
          isActive: user.isActive,
          permissions: effective.permissions,
          isSuperAdmin: effective.isSuperAdmin,
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async me(userId: string) {
    const effective = await this.rbac.getEffectivePermissions(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        role: { select: { name: true } },
      },
    });

    const [prenom = '', ...nameParts] = user.fullName.split(' ');
    const nom = nameParts.join(' ') || user.fullName;

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      prenom,
      nom,
      phone: user.phone,
      isActive: user.isActive,
      role: user.role.name,
      permissions: effective.permissions,
      isSuperAdmin: effective.isSuperAdmin,
    };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const fullName =
      (dto.fullName ?? [dto.prenom, dto.nom].filter(Boolean).join(' ').trim()) || undefined;
    await this.prisma.user.update({
      where: { id: userId },
      data: { fullName },
    });
    return this.me(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const passwordMatches = await bcrypt.compare(
      dto.currentPassword ?? dto.oldPassword ?? '',
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid current password');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });

    return { ok: true };
  }
}
