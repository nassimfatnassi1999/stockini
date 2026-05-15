import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CashTransactionType,
  CashDirection,
  PaymentMethod,
} from '@prisma/client';

export type CashPeriod =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';

const CASH_PERIOD_VALUES: CashPeriod[] = [
  'today',
  'yesterday',
  'week',
  'month',
  'year',
  'custom',
];

// ─── Unified date-filter base ──────────────────────────────────────────────────

export class CashQueryDto {
  @IsOptional()
  @IsEnum(CASH_PERIOD_VALUES)
  period?: CashPeriod;

  /** Required only when period === 'custom' */
  @ValidateIf((o: CashQueryDto) => o.period === 'custom')
  @IsDateString()
  startDate?: string;

  /** Required only when period === 'custom' */
  @ValidateIf((o: CashQueryDto) => o.period === 'custom')
  @IsDateString()
  endDate?: string;
}

// ─── Per-endpoint DTOs ─────────────────────────────────────────────────────────

export class CashSummaryQueryDto extends CashQueryDto {}

export class CashTransactionsQueryDto extends CashQueryDto {
  @IsOptional()
  @IsEnum(CashTransactionType)
  type?: CashTransactionType;

  @IsOptional()
  @IsEnum(CashDirection)
  direction?: CashDirection;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CashAnalyticsQueryDto extends CashQueryDto {}

// ─── Operation DTOs ────────────────────────────────────────────────────────────

export class CaisseOperationDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  montant!: number;

  @IsOptional()
  @IsString()
  motif?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

export class CaisseConfigUpdateDto {
  @IsOptional()
  allowNegative?: boolean;
}
