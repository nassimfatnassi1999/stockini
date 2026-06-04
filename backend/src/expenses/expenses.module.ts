import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CaisseModule } from '../caisse/caisse.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferencesModule } from '../references/references.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [PrismaModule, ReferencesModule, CaisseModule, AuditLogsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
