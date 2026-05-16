import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TrashService } from './trash.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('trash')
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @RequirePermissions('trash.view')
  @Get()
  findAll(@Query('entity') entity?: string, @Query('type') type?: string) {
    return this.trashService.findAll(entity ?? type);
  }

  @RequirePermissions('trash.restore')
  @Patch(':entity/:id/restore')
  restore(@Param('entity') entity: string, @Param('id') id: string) {
    return this.trashService.restore(entity, id);
  }

  @RequirePermissions('trash.permanent_delete')
  @Delete(':entity/:id/permanent')
  permanentDelete(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.trashService.permanentDelete(entity, id, user?.id);
  }
}
