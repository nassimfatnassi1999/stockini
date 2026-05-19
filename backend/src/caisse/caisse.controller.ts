import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CaisseMovementType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CaisseConfigUpdateDto,
  CaisseOperationDto,
  CashAnalyticsQueryDto,
  CashSummaryQueryDto,
  CashTransactionsQueryDto,
} from './dto/caisse.dto';
import { CaisseService } from './caisse.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('caisse')
export class CaisseController {
  constructor(private readonly caisseService: CaisseService) {}

  // ─── Balance ─────────────────────────────────────────────────────────────────

  @RequirePermissions('caisse.view')
  @Get('balance')
  getBalance() {
    return this.caisseService.getBalance();
  }

  // ─── Summary KPIs ─────────────────────────────────────────────────────────────

  @RequirePermissions('caisse.view')
  @Get('summary')
  getSummary(@Query() query: CashSummaryQueryDto) {
    return this.caisseService.getSummary(query);
  }

  // ─── Transactions ─────────────────────────────────────────────────────────────

  @RequirePermissions('caisse.view')
  @Get('transactions')
  getTransactions(@Query() query: CashTransactionsQueryDto) {
    return this.caisseService.getTransactions(query);
  }

  // ─── Analytics ────────────────────────────────────────────────────────────────

  @RequirePermissions('caisse.view')
  @Get('analytics')
  getAnalytics(@Query() query: CashAnalyticsQueryDto) {
    return this.caisseService.getAnalytics(query);
  }

  // ─── Historique (legacy) ──────────────────────────────────────────────────────

  @RequirePermissions('caisse.view')
  @Get('historique')
  historique(@Query('type') type?: CaisseMovementType) {
    return this.caisseService.historique(type);
  }

  // ─── Manual operations ────────────────────────────────────────────────────────

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

  // ─── Backfill (idempotent) ────────────────────────────────────────────────────

  @RequirePermissions('caisse.admin')
  @Post('backfill')
  backfillPayments() {
    return this.caisseService.backfillPayments();
  }
}
