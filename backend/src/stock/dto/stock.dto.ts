import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, Equals } from 'class-validator';

export class StockChangeDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class StockAdjustmentDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newQuantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResetInventoryDto {
  /** Admin plain-text password for re-authentication */
  @IsString()
  adminPassword!: string;

  /** Must equal exactly 'RESET STOCK' to proceed */
  @IsString()
  @Equals('RESET STOCK')
  confirmationText!: string;
}
