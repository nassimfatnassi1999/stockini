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
import { CreatePaymentDto, PayPurchaseDto, PaySaleDto, UpdatePaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RequirePermissions('payments.create')
  @Post()
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @RequirePermissions('payments.receive_client_payment')
  @Post('sales/:saleId/pay')
  paySale(@Param('saleId') saleId: string, @Body() dto: PaySaleDto) {
    return this.paymentsService.paySale(saleId, dto);
  }

  @RequirePermissions('expenses.pay_supplier')
  @Post('purchases/:purchaseId/pay')
  payPurchase(@Param('purchaseId') purchaseId: string, @Body() dto: PayPurchaseDto) {
    return this.paymentsService.payPurchase(purchaseId, dto);
  }

  @RequirePermissions('payments.view')
  @Get()
  findAll() {
    return this.paymentsService.findAll();
  }

  @RequirePermissions('payments.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @RequirePermissions('payments.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.paymentsService.update(id, dto);
  }

  @RequirePermissions('payments.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.paymentsService.remove(id, user?.id);
  }
}
