import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CaisseMovementType,
  CashDirection,
  PaymentMethod,
  TreasuryAccount,
} from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

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

export class CashQueryDto extends PaginationQueryDto {
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

  @IsOptional()
  @IsEnum(TreasuryAccount)
  account?: TreasuryAccount;
}

// ─── Per-endpoint DTOs ─────────────────────────────────────────────────────────

export class CashSummaryQueryDto extends CashQueryDto {}

export class CashTransactionsQueryDto extends CashQueryDto {
  @IsOptional()
  @IsEnum(CaisseMovementType)
  type?: CaisseMovementType;

  @IsOptional()
  @IsEnum(CashDirection)
  direction?: CashDirection;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
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

  @IsOptional()
  @IsEnum(TreasuryAccount)
  account?: TreasuryAccount;
}

export class CaisseConfigUpdateDto {
  @IsOptional()
  allowNegative?: boolean;

  @IsOptional()
  @IsBoolean()
  allowNegativeBanque?: boolean;

  @IsOptional()
  @IsEnum(TreasuryAccount)
  account?: TreasuryAccount;
}

export class CashResetDto {
  @IsString()
  @IsNotEmpty()
  motif!: string;

  @IsOptional()
  @IsEnum(TreasuryAccount)
  account?: TreasuryAccount;
}

export class ClearCaisseHistoryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(CaisseMovementType)
  type?: CaisseMovementType;

  @IsOptional()
  @IsEnum(TreasuryAccount)
  account?: TreasuryAccount;
}
