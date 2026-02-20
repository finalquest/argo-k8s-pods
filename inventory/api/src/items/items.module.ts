import { Module } from '@nestjs/common';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LocationsModule } from '../locations/locations.module';

@Module({
  imports: [PrismaModule, LocationsModule],
  providers: [ItemsService],
  controllers: [ItemsController],
})
export class ItemsModule {}
