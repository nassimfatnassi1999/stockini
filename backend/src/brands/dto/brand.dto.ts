import { IsOptional, IsString } from 'class-validator';

export class CreateBrandDto {
  @IsString()
  name!: string;
}

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  name?: string;
}
