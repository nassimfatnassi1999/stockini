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
import {
  CreatePurchaseDto,
  ReceivePurchaseDto,
  UpdatePurchaseDto,
} from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @RequirePermissions('purchases.create_order')
  @Post()
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user?: AuthUser) {
    return this.purchasesService.create(dto, user?.id);
  }

  @RequirePermissions('purchases.view')
  @Get()
  findAll() {
    return this.purchasesService.findAll();
  }

  @RequirePermissions('purchases.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  @RequirePermissions('purchases.validate_receipt')
  @Patch(':id/receive')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.purchasesService.receive(id, dto, user?.id);
  }

  @RequirePermissions('purchases.update')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.purchasesService.cancel(id);
  }

  @RequirePermissions('purchases.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchasesService.update(id, dto);
  }

  @RequirePermissions('purchases.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.purchasesService.remove(id, user?.id);
  }
}
