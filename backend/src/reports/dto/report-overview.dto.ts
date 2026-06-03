import { IsDateString, IsIn, IsOptional, ValidateIf } from 'class-validator';

export type ReportPeriod = 'today' | 'week' | 'month' | 'year' | 'custom';

const REPORT_PERIOD_VALUES: ReportPeriod[] = [
  'today',
  'week',
  'month',
  'year',
  'custom',
];

export class ReportOverviewQueryDto {
  @IsOptional()
  @IsIn(REPORT_PERIOD_VALUES)
  period?: ReportPeriod;

  @ValidateIf((o: ReportOverviewQueryDto) => o.period === 'custom')
  @IsDateString()
  dateFrom?: string;

  @ValidateIf((o: ReportOverviewQueryDto) => o.period === 'custom')
  @IsDateString()
  dateTo?: string;
}
