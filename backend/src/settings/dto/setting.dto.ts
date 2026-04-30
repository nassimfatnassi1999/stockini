import { IsOptional, IsString } from 'class-validator';

export class CreateSettingDto {
  @IsString()
  key!: string;

  @IsString()
  value!: string;
}

export class UpdateSettingDto {
  @IsOptional()
  @IsString()
  value?: string;
}
