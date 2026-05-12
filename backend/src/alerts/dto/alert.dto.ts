import { AlertType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateAlertDto {
  @IsEnum(AlertType)
  type!: AlertType;

  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsInt()
  currentStock?: number;

  @IsOptional()
  @IsInt()
  minimumStock?: number;
}

export class UpdateAlertDto {
  @IsOptional()
  @IsEnum(AlertType)
  type?: AlertType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsInt()
  currentStock?: number;

  @IsOptional()
  @IsInt()
  minimumStock?: number;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
