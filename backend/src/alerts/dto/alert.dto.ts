import { AlertType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AlertQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  isRead?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

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
