import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('reports.view')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  dashboard() {
    return this.reportsService.dashboard();
  }

  @RequirePermissions('reports.financial.view')
  @Get('stock-value')
  stockValue() {
    return this.reportsService.stockValue();
  }

  @Get('low-stock')
  lowStockProducts() {
    return this.reportsService.lowStockProducts();
  }

  @Get('top-selling')
  topSellingProducts(@Query('limit') limit?: string) {
    return this.reportsService.topSellingProducts(limit ? Number(limit) : 10);
  }

  @RequirePermissions('reports.financial.view')
  @Get('sales-summary')
  salesSummary() {
    return this.reportsService.salesSummary();
  }
}
