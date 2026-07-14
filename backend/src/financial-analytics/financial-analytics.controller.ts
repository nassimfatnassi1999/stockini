import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FinancialAnalyticsQueryDto } from './dto/financial-analytics.dto';
import { FinancialAnalyticsService } from './financial-analytics.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('reports.view', 'reports.financial.view')
@Controller('financial-analytics')
export class FinancialAnalyticsController {
  constructor(private readonly service: FinancialAnalyticsService) {}
  @Get('dashboard') dashboard(@Query() q: FinancialAnalyticsQueryDto) { return this.service.getDashboardMetrics(q); }
  @Get('summary') summary(@Query() q: FinancialAnalyticsQueryDto) { return this.service.getFinancialSummary(q); }
  @Get('profit-by-sale') sales(@Query() q: FinancialAnalyticsQueryDto) { return this.service.getProfitBySale(q); }
  @Get('profit-by-product') products(@Query() q: FinancialAnalyticsQueryDto) { return this.service.getProfitByProduct(q); }
  @Get('profit-by-customer') customers(@Query() q: FinancialAnalyticsQueryDto) { return this.service.getProfitByCustomer(q); }
  @Get('timeline') timeline(@Query() q: FinancialAnalyticsQueryDto) { return this.service.getProfitTimeline(q); }
}
