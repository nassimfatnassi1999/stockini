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
import { PaymentStatus, PurchaseDocumentType, PurchaseStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export type PurchaseTransformTarget = 'BON_RECEPTION' | 'FACTURE_FOURNISSEUR';

export class CreatePurchaseItemDto {
  @IsOptional() @IsString() id?: string;
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

  @IsOptional() @IsString() designation?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) tvaPercent?: number;
}

export class CreatePurchaseDto {
  @IsString()
  supplierId!: string;

  @IsOptional() @IsDateString() date?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stampDuty?: number;

  @IsOptional()
  @IsString()
  supplierReference?: string;

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

  @IsOptional()
  @IsString()
  supplierReference?: string;
}

/**
 * Transforme un Bon de commande en Bon de réception ou Facture fournisseur.
 * C'est à partir de ce moment que la dette fournisseur est créée et le document payable.
 */
export class TransformPurchaseDto {
  @IsIn(['BON_RECEPTION', 'FACTURE_FOURNISSEUR'])
  targetType!: PurchaseTransformTarget;
}

/** Only status changes via PATCH. Financial state managed through /payments/purchases/:id/pay. */
export class UpdatePurchaseDto {
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @IsOptional()
  @IsString()
  supplierReference?: string;

  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsEnum(PurchaseDocumentType) documentType?: PurchaseDocumentType;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stampDuty?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paidAmount?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items?: CreatePurchaseItemDto[];
}

/**
 * Filtres pour la liste des factures fournisseurs « à payer ».
 * L'agrégation (reste à payer, exclusion des annulées/payées) se fait côté backend.
 */
export class PayablePurchaseQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
}

export class PurchasePaginationDto extends PaginationQueryDto {
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
