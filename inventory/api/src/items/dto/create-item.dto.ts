import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(64)
  barcode: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  unit?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  photoPath?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  externalCategoryName?: string;

  @IsInt()
  @IsOptional()
  initialQuantity?: number;
}
