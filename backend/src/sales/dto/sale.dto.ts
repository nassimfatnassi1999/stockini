import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsEmail,
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

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  designation?: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1000)
  @Max(1000)
  marginPercent?: number;
}

export class CreateSaleDto {
  @IsIn(SALES_DOCUMENT_TYPES, {
    message:
      'documentType must be one of the following values: DEVIS, BON_COMMANDE, BON_LIVRAISON, FACTURE, AVOIR',
  })
  documentType!: DocumentType;

  @IsOptional()
  @IsDateString()
  date?: string;

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
  @IsEmail()
  counterClientEmail?: string;

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

export class CreateConsolidationDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  sourceIds!: string[];

  @IsEnum(DocumentType)
  targetType!: DocumentType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CancelConsolidationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateSaleDto {
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsIn(SALES_DOCUMENT_TYPES)
  documentType?: DocumentType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsIn(['PERSISTENT', 'COMPTOIR'])
  clientType?: 'PERSISTENT' | 'COMPTOIR';

  @IsOptional() @IsString() counterClientFirstName?: string | null;
  @IsOptional() @IsString() counterClientLastName?: string | null;
  @IsOptional() @IsString() counterClientFullName?: string | null;
  @IsOptional() @IsEmail() counterClientEmail?: string | null;
  @IsOptional() @IsString() counterClientPhone?: string | null;
  @IsOptional() @IsString() counterClientAddress?: string | null;
  @IsOptional() @IsString() counterClientTaxId?: string | null;
  @IsOptional() @IsString() counterClientNote?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items?: CreateSaleItemDto[];

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paidAmount?: number;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
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
