import { IsIn, IsOptional, IsString, IsUUID, Equals } from 'class-validator';

export class PostgresRestoreDto {
  @IsIn(['server', 'import'])
  source!: 'server' | 'import';

  @IsOptional()
  @IsUUID()
  importId?: string;

  @Equals('RESTAURER')
  confirmation!: string;
}

export class MinioRestoreDto extends PostgresRestoreDto {
  @IsIn(['MERGE', 'REPLACE'])
  mode: 'MERGE' | 'REPLACE' = 'MERGE';
}

export class RecreateExportDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
