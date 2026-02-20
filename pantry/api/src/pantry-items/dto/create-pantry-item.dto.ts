import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';

export class CreatePantryItemDto {
  @IsString()
  name: string;

  @IsString()
  barcode: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  externalCategoryName?: string;

  @IsString()
  @IsOptional()
  locationId?: string;

  @IsString()
  @IsOptional()
  externalLocationName?: string;

  @IsString()
  @IsOptional()
  unitId?: string;

  @IsString()
  @IsOptional()
  externalUnitName?: string;

  @IsInt()
  @IsOptional()
  initialQuantity?: number;

  @IsDateString()
  @IsOptional()
  expirationDate?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  minQuantity?: number;
}
