import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateAuditLogDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  action!: string;

  @IsString()
  entity!: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
