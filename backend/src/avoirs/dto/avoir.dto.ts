import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAvoirItemDto {
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
}

export class CreateAvoirDto {
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAvoirItemDto)
  items!: CreateAvoirItemDto[];
}
