import { CustomerType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditBalance?: number;

  @IsOptional()
  @IsDateString()
  debtDueDate?: string | null;

  @IsOptional()
  @IsBoolean()
  autoLockEnabled?: boolean;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditBalance?: number;
}

export class LockCustomerDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateDebtSettingsDto {
  @IsOptional()
  @IsDateString()
  debtDueDate?: string | null;

  @IsOptional()
  @IsBoolean()
  autoLockEnabled?: boolean;
}
