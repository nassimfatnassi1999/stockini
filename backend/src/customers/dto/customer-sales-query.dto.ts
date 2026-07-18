import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { DocumentType, PaymentStatus, SaleStatus } from '@prisma/client';

export class CustomerSalesQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(DocumentType) documentType?: DocumentType;
  @IsOptional() @IsEnum(SaleStatus) documentStatus?: SaleStatus;
  @IsOptional() @IsEnum(PaymentStatus) paymentStatus?: PaymentStatus;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}
