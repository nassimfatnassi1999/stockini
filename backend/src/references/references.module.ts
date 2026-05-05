import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferenceGeneratorService } from './reference-generator.service';

@Module({
  imports: [PrismaModule],
  providers: [ReferenceGeneratorService],
  exports: [ReferenceGeneratorService],
})
export class ReferencesModule {}
