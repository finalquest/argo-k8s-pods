import { PartialType } from '@nestjs/mapped-types';
import { CreatePantryItemDto } from './create-pantry-item.dto';

export class UpdatePantryItemDto extends PartialType(CreatePantryItemDto) {}
