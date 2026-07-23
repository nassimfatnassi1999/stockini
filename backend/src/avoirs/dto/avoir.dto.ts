import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreditNoteQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  saleId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export type RefundMethod =
  | 'CASH'
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'CHECK'
  | 'CUSTOMER_CREDIT'
  | 'NONE';

const REFUND_METHODS = [
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'CHECK',
  'CUSTOMER_CREDIT',
  'NONE',
] as const satisfies readonly RefundMethod[];

export class CreditNoteLineDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsOptional()
  saleItemId?: string;

  @IsNumber()
  @Min(1)
  quantiteRetournee!: number;

  @IsString()
  @IsOptional()
  motifLigne?: string;

  /** true = restaurer le stock pour cette ligne (défaut). false = avoir commercial sans retour physique. */
  @IsBoolean()
  @IsOptional()
  restock?: boolean;
}

export class CreateCreditNoteDto {
  @IsString()
  @IsNotEmpty()
  saleId!: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  motif?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsIn(REFUND_METHODS)
  @IsOptional()
  refundMethod?: RefundMethod;

  /** Rembourser le timbre unique, uniquement lorsque toutes les quantités sont retournées. */
  @IsBoolean()
  @IsOptional()
  refundStampDuty?: boolean;

  /** Restaurer le stock globalement. Défaut: true. */
  @IsBoolean()
  @IsOptional()
  restock?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteLineDto)
  items!: CreditNoteLineDto[];
}

export { CreateCreditNoteDto as CreateAvoirDto };
export { CreditNoteLineDto as CreateAvoirItemDto };
