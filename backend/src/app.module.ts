import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertsModule } from './alerts/alerts.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { AvoirsModule } from './avoirs/avoirs.module';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PurchasesModule } from './purchases/purchases.module';
import { RbacModule } from './rbac/rbac.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { SettingsModule } from './settings/settings.module';
import { StockModule } from './stock/stock.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { DocumentsModule } from './documents/documents.module';
import { TrashModule } from './trash/trash.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    BrandsModule,
    StockModule,
    SalesModule,
    CustomersModule,
    SuppliersModule,
    PurchasesModule,
    PaymentsModule,
    ReportsModule,
    AlertsModule,
    SettingsModule,
    AuditLogsModule,
    RbacModule,
    TrashModule,
    DocumentsModule,
    AvoirsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
