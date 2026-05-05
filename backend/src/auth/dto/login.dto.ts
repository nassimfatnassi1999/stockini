import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  prenom?: string;
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  currentPassword!: string;

  @IsOptional()
  @IsString()
  oldPassword?: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
