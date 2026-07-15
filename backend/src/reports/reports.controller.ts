import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { ReportsService } from './reports.service';
import { ReportOverviewQueryDto } from './dto/report-overview.dto';
import { ReportFilterQueryDto } from './dto/report-filter-query.dto';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('reports.view')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /reports/overview
   * Comprehensive financial and operational KPIs for the reporting page.
   * Requires: reports.view + reports.financial.view
   */
  @RequirePermissions('reports.view', 'reports.financial.view')
  @Get('overview')
  getOverview(@Query() query: ReportOverviewQueryDto) {
    return this.reportsService.getOverview(query);
  }

  @RequirePermissions('reports.view', 'reports.financial.view')
  @Get('filters/products')
  filterProducts(@Query() query: ReportFilterQueryDto) {
    return this.reportsService.filterProducts(query);
  }

  @RequirePermissions('reports.view', 'reports.financial.view')
  @Get('filters/clients')
  filterClients(@Query() query: ReportFilterQueryDto) {
    return this.reportsService.filterClients(query);
  }

  @RequirePermissions('reports.view', 'reports.financial.view')
  @Get('filters/categories')
  filterCategories(@Query() query: ReportFilterQueryDto) {
    return this.reportsService.filterCategories(query);
  }

  @RequirePermissions('reports.view', 'reports.financial.view')
  @Get('filters/sellers')
  filterSellers(@Query() query: ReportFilterQueryDto) {
    return this.reportsService.filterSellers(query);
  }

  @Get('dashboard')
  @RequirePermissions('dashboard.view')
  dashboard(
    @Query() query: ReportOverviewQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reportsService.dashboard(query, user);
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
