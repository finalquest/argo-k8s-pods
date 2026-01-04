import { IsInt, IsNotEmpty, IsOptional, IsString, NotEquals } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @NotEquals(0)
  delta: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
