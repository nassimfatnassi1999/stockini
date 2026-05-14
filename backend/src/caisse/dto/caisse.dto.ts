import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

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
