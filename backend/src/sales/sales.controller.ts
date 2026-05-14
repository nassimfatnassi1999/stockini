import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateSaleDto, UpdateSaleDto } from './dto/sale.dto';
import { SalesService } from './sales.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermissions('sales.create')
  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user?: AuthUser) {
    return this.salesService.create(dto, user);
  }

  @RequirePermissions('sales.view')
  @Get()
  findAll() {
    return this.salesService.findAll();
  }

  @RequirePermissions('sales.view_details')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.salesService.findOne(id, user);
  }

  @RequirePermissions('sales.update')
  @Patch(':id/validate')
  validate(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.salesService.validate(id, user);
  }

  @RequirePermissions('sales.delete')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.salesService.cancel(id, user);
  }

  @RequirePermissions('sales.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.salesService.update(id, dto);
  }

  @RequirePermissions('sales.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.salesService.remove(id, user);
  }
}
