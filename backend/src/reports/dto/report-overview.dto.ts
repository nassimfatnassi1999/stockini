import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export type ReportPeriod =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'week'
  | 'last30'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom';

const REPORT_PERIOD_VALUES: ReportPeriod[] = [
  'today',
  'yesterday',
  'last7',
  'week',
  'last30',
  'month',
  'quarter',
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

  @IsOptional() @IsString() @MaxLength(64) sellerId?: string;
  @IsOptional() @IsString() @MaxLength(64) customerId?: string;
  @IsOptional() @IsString() @MaxLength(64) productId?: string;
  @IsOptional() @IsString() @MaxLength(64) categoryId?: string;
  @IsOptional() @IsIn(['FACTURE', 'BON_LIVRAISON']) documentType?:
    | 'FACTURE'
    | 'BON_LIVRAISON';
  @IsOptional() @IsIn(['PAID', 'PARTIAL', 'UNPAID']) paymentStatus?:
    | 'PAID'
    | 'PARTIAL'
    | 'UNPAID';
}
