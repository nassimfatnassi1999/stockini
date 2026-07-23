import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'archive'])
  source?: 'active' | 'archive';
}

export class UpdateRetentionSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 6, 12, 24, 36])
  retentionMonths?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  archiveEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  compressExport?: boolean;
}
