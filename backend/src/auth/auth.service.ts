import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, UpdateProfileDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: user.role.name };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret:
        this.config.get<string>('JWT_REFRESH_SECRET') ?? 'change_me_refresh',
      expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
        '7d') as JwtSignOptions['expiresIn'],
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true },
    });

    return this.profilePayload(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const fullName =
      (dto.fullName ??
        [dto.prenom, dto.nom].filter(Boolean).join(' ').trim()) ||
      undefined;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName },
      include: { role: true },
    });

    return this.profilePayload(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
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

  private profilePayload(user: {
    id: string;
    email: string;
    fullName: string;
    role: { name: string };
  }) {
    const [prenom = '', ...nameParts] = user.fullName.split(' ');
    const nom = nameParts.join(' ') || user.fullName;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      prenom,
      nom,
      role: user.role.name,
    };
  }
}
