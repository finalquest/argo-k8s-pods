import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuggestRecipesDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  prompt?: string;
}
