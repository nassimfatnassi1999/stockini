import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PaymentQueryDto, PayPurchaseDto, PaySaleDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RequirePermissions('payments.receive_client_payment')
  @Post('sales/:saleId/pay')
  paySale(
    @Param('saleId') saleId: string,
    @Body() dto: PaySaleDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.paymentsService.paySale(saleId, dto, user?.id);
  }

  @RequirePermissions('expenses.pay_supplier')
  @Post('purchases/:purchaseId/pay')
  payPurchase(
    @Param('purchaseId') purchaseId: string,
    @Body() dto: PayPurchaseDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.paymentsService.payPurchase(purchaseId, dto, user?.id);
  }

  @RequirePermissions('payments.view')
  @Get()
  findAll(@Query() query: PaymentQueryDto) {
    return this.paymentsService.findAll(query);
  }

  @RequirePermissions('payments.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @RequirePermissions('payments.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.paymentsService.remove(id, user?.id);
  }
}
