import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CaisseMovementType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CaisseConfigUpdateDto, CaisseOperationDto } from './dto/caisse.dto';
import { CaisseService } from './caisse.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('caisse')
export class CaisseController {
  constructor(private readonly caisseService: CaisseService) {}

  @RequirePermissions('caisse.view')
  @Get('balance')
  getBalance() {
    return this.caisseService.getBalance();
  }

  @RequirePermissions('caisse.view')
  @Get('historique')
  historique(@Query('type') type?: CaisseMovementType) {
    return this.caisseService.historique(type);
  }

  @RequirePermissions('caisse.operate')
  @Post('retrait')
  retrait(@Body() dto: CaisseOperationDto, @CurrentUser() user?: AuthUser) {
    return this.caisseService.retrait(dto.montant, dto.motif, user?.id);
  }

  @RequirePermissions('caisse.operate')
  @Post('depot')
  depot(@Body() dto: CaisseOperationDto, @CurrentUser() user?: AuthUser) {
    return this.caisseService.depot(dto.montant, dto.motif, user?.id);
  }

  @RequirePermissions('caisse.admin')
  @Patch('config')
  updateConfig(@Body() dto: CaisseConfigUpdateDto) {
    return this.caisseService.setAllowNegative(dto.allowNegative ?? false);
  }
}
