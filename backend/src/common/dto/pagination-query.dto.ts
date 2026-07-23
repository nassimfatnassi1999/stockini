import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(PAGE_SIZE_OPTIONS)
  limit: number = 10;
}
