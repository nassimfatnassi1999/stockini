import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
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
import { ClearPaymentHistoryDto, PaymentQueryDto, PayPurchaseDto, PaySaleDto } from './dto/payment.dto';
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
    if (dto.acceptAsFullyPaid && !this.canAcceptDifference(user)) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission d'abandonner un reliquat.",
      );
    }
    return this.paymentsService.paySale(saleId, dto, user?.id);
  }

  private canAcceptDifference(user?: AuthUser): boolean {
    if (!user) return false;
    if (['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin'].includes(user.role)) return true;
    return user.permissions.includes('*') ||
      user.permissions.includes('payments.*') ||
      user.permissions.includes('payments.accept_difference');
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

  @RequirePermissions('finance.history.clear')
  @Post('history/clear')
  @HttpCode(200)
  clearCustomerHistory(@Body() dto: ClearPaymentHistoryDto, @CurrentUser() user?: AuthUser) {
    return this.paymentsService.clearCustomerPaymentsHistory(dto, user!.id);
  }

  @RequirePermissions('finance.history.clear')
  @Post('supplier-history/clear')
  @HttpCode(200)
  clearSupplierHistory(@Body() dto: ClearPaymentHistoryDto, @CurrentUser() user?: AuthUser) {
    return this.paymentsService.clearSupplierPaymentsHistory(dto, user!.id);
  }
}
