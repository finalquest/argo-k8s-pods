import { IsInt, IsString, IsOptional } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  delta: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
