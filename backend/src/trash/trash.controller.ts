import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TrashService } from './trash.service';

@UseGuards(JwtAuthGuard)
@Controller('trash')
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get()
  findAll(@Query('entity') entity?: string, @Query('type') type?: string) {
    return this.trashService.findAll(entity ?? type);
  }

  @Patch(':entity/:id/restore')
  restore(@Param('entity') entity: string, @Param('id') id: string) {
    return this.trashService.restore(entity, id);
  }

  @Delete(':entity/:id/permanent')
  permanentDelete(@Param('entity') entity: string, @Param('id') id: string) {
    return this.trashService.permanentDelete(entity, id);
  }
}
