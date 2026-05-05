import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RbacService } from './rbac.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('permissions')
  permissions() {
    return this.rbacService.permissions();
  }

  @Get('roles/:role/permissions')
  rolePermissions(@Param('role') role: string) {
    return this.rbacService.rolePermissions(role);
  }

  @Put('roles/:role/permissions')
  updateRolePermissions(
    @Param('role') role: string,
    @Body() body: { permissionCodes: string[] },
  ) {
    return this.rbacService.updateRolePermissions(
      role,
      body.permissionCodes ?? [],
    );
  }

  @Get('users/:userId/overrides')
  userOverrides(@Param('userId') userId: string) {
    return this.rbacService.userOverrides(userId);
  }

  @Put('users/overrides')
  setUserOverride(
    @Body() body: { userId: string; permissionCode: string; granted: boolean },
  ) {
    return this.rbacService.setUserOverride(body);
  }

  @Delete('users/:userId/overrides/:permissionCode')
  removeUserOverride(
    @Param('userId') userId: string,
    @Param('permissionCode') permissionCode: string,
  ) {
    return this.rbacService.removeUserOverride(userId, permissionCode);
  }
}
