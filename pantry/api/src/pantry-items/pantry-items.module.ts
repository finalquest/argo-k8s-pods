import { Module } from '@nestjs/common';
import { PantryItemsService } from './pantry-items.service';
import { PantryItemsController } from './pantry-items.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LocationsModule } from '../locations/locations.module';
import { UnitsModule } from '../units/units.module';

@Module({
  imports: [PrismaModule, LocationsModule, UnitsModule],
  controllers: [PantryItemsController],
  providers: [PantryItemsService],
})
export class PantryItemsModule {}
