import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentStatus, PurchaseStatus } from '@prisma/client';

export class CreatePurchaseItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;
}

export class CreatePurchaseDto {
  @IsString()
  supplierId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}

export class ReceivePurchaseItemDto {
  @IsString()
  purchaseItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class ReceivePurchaseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseItemDto)
  items!: ReceivePurchaseItemDto[];
}

/** Only status changes via PATCH. Financial state managed through /payments/purchases/:id/pay. */
export class UpdatePurchaseDto {
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;
}

export class PurchasePaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

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
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
