import { IsIn, IsISO8601, IsOptional, IsString, ValidateIf } from 'class-validator';

export const FINANCIAL_PERIODS = ['today', 'yesterday', 'week', 'month', 'year', 'custom'] as const;
export type FinancialPeriod = typeof FINANCIAL_PERIODS[number];

export class FinancialAnalyticsQueryDto {
  @IsOptional() @IsIn(FINANCIAL_PERIODS) period?: FinancialPeriod = 'month';
  @ValidateIf((o: FinancialAnalyticsQueryDto) => o.period === 'custom') @IsISO8601() dateFrom?: string;
  @ValidateIf((o: FinancialAnalyticsQueryDto) => o.period === 'custom') @IsISO8601() dateTo?: string;
  @IsOptional() @IsString() search?: string;
}
