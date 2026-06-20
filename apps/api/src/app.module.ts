import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ExpensesModule } from './expenses/expenses.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { ReportsModule } from './reports/reports.module';
import { DeliveryZonesModule } from './delivery-zones/delivery-zones.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { RoutesModule } from './routes/routes.module';
import { MaintenanceModule } from './maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    CatalogModule,
    OrdersModule,
    WhatsappModule,
    ExpensesModule,
    IngredientsModule,
    ReportsModule,
    DeliveryZonesModule,
    GeocodingModule,
    RoutesModule,
    MaintenanceModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    // El orden importa: primero autentica, luego verifica el rol.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
