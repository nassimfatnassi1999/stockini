import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DocumentType, DocumentStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class GenerateDocumentsDto {
  @IsArray()
  @IsString({ each: true })
  invoiceIds!: string[];

  @IsEnum(DocumentType)
  documentType!: DocumentType;
}

export class EmailPreviewDto {
  @IsArray()
  @IsString({ each: true })
  documentIds!: string[];
}

export class SendEmailDto {
  @IsArray()
  @IsString({ each: true })
  documentIds!: string[];

  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  cc?: string;

  @IsOptional()
  @IsString()
  bcc?: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  body!: string;
}

export class SendDocumentEmailDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  cc?: string;

  @IsOptional()
  @IsString()
  bcc?: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;
}

export class ListDocumentsQuery {
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxSize?: number;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  /** legacy filter kept for backward compat (used from ventes page) */
  @IsOptional()
  @IsString()
  invoiceId?: string;
}
