import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';

@Module({
  imports: [PrismaModule],
  controllers: [TrashController],
  providers: [TrashService],
})
export class TrashModule {}
