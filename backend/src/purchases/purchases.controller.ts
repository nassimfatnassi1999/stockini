import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreatePurchaseDto,
  PayablePurchaseQueryDto,
  PurchasePaginationDto,
  ReceivePurchaseDto,
  TransformPurchaseDto,
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
  findAll(@Query() query: PurchasePaginationDto) {
    return this.purchasesService.findAll(query);
  }

  /** Factures fournisseurs à payer — exclut les BON_COMMANDE. Doit précéder ':id'. */
  @RequirePermissions('purchases.view')
  @Get('payable')
  findPayable(@Query() query: PayablePurchaseQueryDto) {
    return this.purchasesService.findPayable(query);
  }

  /** Rapport d'intégrité : détecte les BC ayant des paiements liés (anomalie). */
  @RequirePermissions('purchases.view')
  @Get('integrity-check')
  integrityCheck() {
    return this.purchasesService.integrityCheck();
  }

  @RequirePermissions('purchases.view')
  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, fileName } = await this.purchasesService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @RequirePermissions('purchases.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  /** Transforme un BON_COMMANDE en BON_RECEPTION ou FACTURE_FOURNISSEUR. */
  @RequirePermissions('purchases.update')
  @Post(':id/transform')
  transform(
    @Param('id') id: string,
    @Body() dto: TransformPurchaseDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.purchasesService.transform(id, dto, user?.id);
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
  cancel(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.purchasesService.cancel(id, user?.id);
  }

  @RequirePermissions('purchases.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.purchasesService.update(id, dto, user?.id);
  }

  @RequirePermissions('purchases.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.purchasesService.remove(id, user?.id);
  }
}
