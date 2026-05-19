import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DocumentType,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
} from '@prisma/client';

export const SALES_DOCUMENT_TYPES = [
  'DEVIS',
  'BON_COMMANDE',
  'BON_LIVRAISON',
  'FACTURE',
  'AVOIR',
] as const;

export type SalesDocumentType = (typeof SALES_DOCUMENT_TYPES)[number];

export class CreateSaleItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class CreateSaleDto {
  @IsIn(SALES_DOCUMENT_TYPES, {
    message:
      'documentType must be one of the following values: DEVIS, BON_COMMANDE, BON_LIVRAISON, FACTURE, AVOIR',
  })
  documentType!: DocumentType;

  @IsOptional()
  @IsBoolean()
  reserveStock?: boolean;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsIn(['PERSISTENT', 'COMPTOIR'])
  clientType?: 'PERSISTENT' | 'COMPTOIR';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  counterClientFirstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  counterClientLastName?: string;

  @IsOptional()
  @IsString()
  counterClientFullName?: string;

  @IsOptional()
  @IsString()
  counterClientPhone?: string;

  @IsOptional()
  @IsString()
  counterClientAddress?: string;

  @IsOptional()
  @IsString()
  counterClientTaxId?: string;

  @IsOptional()
  @IsString()
  counterClientNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}

export class TransformDocumentDto {
  @IsEnum(DocumentType, {
    message:
      'targetType doit être : DEVIS, BON_COMMANDE, BON_LIVRAISON, FACTURE ou AVOIR',
  })
  targetType!: DocumentType;
}

/** Only status changes are allowed via PATCH. Financial state is managed through payment endpoints. */
export class UpdateSaleDto {
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;
}

export class SalePaginationDto {
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
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  /**
   * Quand true : retourne uniquement les documents réellement payables
   * (FACTURE ou BON_LIVRAISON non transformé) dont le paiement est incomplet.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  payableOnly?: boolean;
}
