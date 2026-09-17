import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  readonly fullName!: string;

  @IsNotEmpty()
  @IsEmail()
  readonly email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  readonly password!: string;

  @IsOptional()
  @IsString()
  readonly phone?: string;

  @IsOptional()
  @IsString()
  readonly avatar?: string;

  @IsNotEmpty()
  @IsEnum(UserRole)
  readonly role!: UserRole;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;

  @IsNotEmpty()
  @IsString()
  readonly centerId!: string;
}
