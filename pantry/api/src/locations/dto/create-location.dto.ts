import { IsString, IsOptional } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
