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
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

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

  @RequirePermissions('clients.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.customersService.remove(id, user?.id);
  }
}
