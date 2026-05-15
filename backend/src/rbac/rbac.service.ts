import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  type PermissionDef,
} from '../auth/permissions/permission-map';

export type { PermissionDef };

const SUPER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin'];

export interface EffectivePermissions {
  userId: string;
  role: string;
  permissions: string[];
  isSuperAdmin: boolean;
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Catalogue ────────────────────────────────────────────────────────────────

  permissions(): PermissionDef[] {
    return ALL_PERMISSIONS;
  }

  // ── Effective permissions (source de vérité) ──────────────────────────────────

  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        role: true,
        userPermissions: true,
      },
    });

    if (!user.isActive) {
      return { userId, role: user.role.name, permissions: [], isSuperAdmin: false };
    }

    const roleCodes = this.extractCodes(user.role.permissions);
    const isSuperAdmin =
      SUPER_ROLES.includes(user.role.name) || roleCodes.includes('*');

    if (isSuperAdmin) {
      return { userId, role: user.role.name, permissions: ['*'], isSuperAdmin: true };
    }

    // Expand role permissions (support wildcards: module.*)
    const expanded = new Set<string>();
    for (const p of ALL_PERMISSIONS) {
      if (
        roleCodes.includes(p.code) ||
        roleCodes.includes(`${p.module}.*`) ||
        roleCodes.includes('*')
      ) {
        expanded.add(p.code);
      }
    }

    // Apply user-specific overrides
    for (const override of user.userPermissions) {
      if (override.effect === 'ALLOW') {
        expanded.add(override.permissionCode);
      } else {
        expanded.delete(override.permissionCode);
      }
    }

    return {
      userId,
      role: user.role.name,
      permissions: [...expanded],
      isSuperAdmin: false,
    };
  }

  // ── Role permissions ─────────────────────────────────────────────────────────

  async rolePermissions(role: string): Promise<PermissionDef[]> {
    const savedRole = await this.findRole(role);
    const codes = this.extractCodes(savedRole.permissions);
    if (codes.includes('*')) return this.permissions();

    return this.permissions().filter(
      (p) => codes.includes(p.code) || codes.includes(`${p.module}.*`),
    );
  }

  async updateRolePermissions(role: string, permissionCodes: string[]) {
    const savedRole = await this.findRole(role);
    await this.prisma.role.update({
      where: { id: savedRole.id },
      data: { permissions: permissionCodes },
    });
    return this.rolePermissions(savedRole.name);
  }

  // ── User overrides ───────────────────────────────────────────────────────────

  async userOverrides(userId: string) {
    const overrides = await this.prisma.userPermission.findMany({
      where: { userId },
    });
    return overrides.map((o) => {
      const parts = o.permissionCode.split('.');
      return {
        code: o.permissionCode,
        module: parts[0] ?? o.permissionCode,
        action: parts.slice(1).join('.') || 'view',
        granted: o.effect === 'ALLOW',
      };
    });
  }

  async setUserOverride(input: {
    userId: string;
    permissionCode: string;
    granted: boolean;
  }) {
    const effect = input.granted ? 'ALLOW' : ('DENY' as const);
    await this.prisma.userPermission.upsert({
      where: {
        userId_permissionCode: {
          userId: input.userId,
          permissionCode: input.permissionCode,
        },
      },
      update: { effect },
      create: {
        userId: input.userId,
        permissionCode: input.permissionCode,
        effect,
      },
    });

    const parts = input.permissionCode.split('.');
    return {
      code: input.permissionCode,
      module: parts[0] ?? input.permissionCode,
      action: parts.slice(1).join('.') || 'view',
      granted: input.granted,
    };
  }

  async removeUserOverride(userId: string, permissionCode: string) {
    await this.prisma.userPermission.deleteMany({
      where: { userId, permissionCode },
    });
    return { ok: true };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private findRole(role: string) {
    return this.prisma.role.findFirstOrThrow({
      where: { name: { equals: role, mode: 'insensitive' } },
    });
  }

  private extractCodes(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
