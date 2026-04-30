import { AlertType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

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
}
