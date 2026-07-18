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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, LockCustomerDto, UpdateCustomerDto, UpdateDebtSettingsDto } from './dto/customer.dto';
import { CustomerSalesQueryDto } from './dto/customer-sales-query.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @RequirePermissions('clients.create')
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @RequirePermissions('clients.view')
  @Get()
  findAll(@Query('search') search?: string) {
    return this.customersService.findAll(search);
  }

  @RequirePermissions('clients.view')
  @Get('next-reference')
  async getNextReference(@Query('type') type: string) {
    const reference = await this.customersService.getNextReference(
      type ?? 'INDIVIDUAL',
    );
    return { reference };
  }

  @RequirePermissions('sales.view')
  @Get(':id/sales')
  findSales(@Param('id') id: string, @Query() query: CustomerSalesQueryDto) {
    return this.customersService.findSales(id, query);
  }

  @RequirePermissions('clients.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @RequirePermissions('clients.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @RequirePermissions('clients.lock')
  @Patch(':id/lock')
  lock(@Param('id') id: string, @Body() dto: LockCustomerDto, @CurrentUser() user: AuthUser) {
    return this.customersService.lockCustomer(id, user.id, dto);
  }

  @RequirePermissions('clients.unlock')
  @Patch(':id/unlock')
  unlock(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customersService.unlockCustomer(id, user.id);
  }

  @RequirePermissions('clients.update_debt_due_date')
  @Patch(':id/debt-settings')
  updateDebtSettings(@Param('id') id: string, @Body() dto: UpdateDebtSettingsDto) {
    return this.customersService.updateDebtSettings(id, dto);
  }

  @RequirePermissions('clients.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.customersService.remove(id, user?.id);
  }
}
