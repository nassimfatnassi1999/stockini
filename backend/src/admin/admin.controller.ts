import { Controller, Post, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SalesService } from '../sales/sales.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermissions('admin.recalculate_last_sale_prices')
  @Post('recalculate-last-sale-prices')
  recalculateLastSalePrices() {
    return this.salesService.recalculateLastSalePrices();
  }
}
