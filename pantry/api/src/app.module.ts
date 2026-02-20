import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CategoriesModule } from './categories/categories.module';
import { LocationsModule } from './locations/locations.module';
import { UnitsModule } from './units/units.module';
import { PantryItemsModule } from './pantry-items/pantry-items.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CategoriesModule,
    LocationsModule,
    UnitsModule,
    PantryItemsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
