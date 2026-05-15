import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import {
  ResetInventoryDto,
  StockAdjustmentDto,
  StockChangeDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @RequirePermissions('stock.adjust')
  @Post('entry')
  entry(@Body() dto: StockChangeDto, @CurrentUser() user?: AuthUser) {
    return this.stockService.entry(dto, user?.id);
  }

  @RequirePermissions('stock.adjust')
  @Post('exit')
  exit(@Body() dto: StockChangeDto, @CurrentUser() user?: AuthUser) {
    return this.stockService.exit(dto, user?.id);
  }

  @RequirePermissions('stock.adjust')
  @Post('adjustment')
  adjustment(@Body() dto: StockAdjustmentDto, @CurrentUser() user?: AuthUser) {
    return this.stockService.adjustment(dto, user?.id);
  }

  @RequirePermissions('stock.movements.view')
  @Get('movements')
  history(@Query('productId') productId?: string) {
    return this.stockService.history(productId);
  }

  /** Admin-only: zero out all product quantities in a single transaction */
  @RequirePermissions('stock.reset')
  @Post('reset-inventory')
  resetInventory(
    @Body() dto: ResetInventoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockService.resetInventory(dto, user.id);
  }
}
