import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferencesModule } from '../references/references.module';
import { CaisseController } from './caisse.controller';
import { CaisseService } from './caisse.service';

@Module({
  imports: [PrismaModule, ReferencesModule],
  controllers: [CaisseController],
  providers: [CaisseService],
  exports: [CaisseService],
})
export class CaisseModule {}
