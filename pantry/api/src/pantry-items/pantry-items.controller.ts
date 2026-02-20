import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PantryItemsService } from './pantry-items.service';
import { CreatePantryItemDto } from './dto/create-pantry-item.dto';
import { UpdatePantryItemDto } from './dto/update-pantry-item.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Controller('pantry-items')
@UseGuards(AuthGuard('jwt'))
export class PantryItemsController {
  constructor(private readonly pantryItemsService: PantryItemsService) {}

  @Post()
  create(@Body() dto: CreatePantryItemDto) {
    return this.pantryItemsService.create(dto);
  }

  @Get()
  findAll(
    @Query('locationId') locationId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.pantryItemsService.findAll(locationId, categoryId);
  }

  @Get('expiring-soon')
  findExpiringSoon(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days, 10) : 7;
    return this.pantryItemsService.findExpiringSoon(daysNum);
  }

  @Get('low-stock')
  findLowStock() {
    return this.pantryItemsService.findLowStock();
  }

  @Get('barcode/:barcode')
  findByBarcode(@Param('barcode') barcode: string) {
    return this.pantryItemsService.findByBarcode(barcode);
  }

  @Get('lookup/:barcode')
  lookupExternal(@Param('barcode') barcode: string) {
    return this.pantryItemsService.lookupExternal(barcode);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pantryItemsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePantryItemDto) {
    return this.pantryItemsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pantryItemsService.remove(id);
  }

  @Post(':id/stock')
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.pantryItemsService.adjustStock(id, dto);
  }

  @Post(':id/freeze')
  freeze(@Param('id') id: string) {
    return this.pantryItemsService.freeze(id);
  }

  @Post(':id/thaw')
  thaw(@Param('id') id: string) {
    return this.pantryItemsService.thaw(id);
  }

  @Post(':id/extract')
  extractOne(@Param('id') id: string) {
    return this.pantryItemsService.extractOne(id);
  }
}
