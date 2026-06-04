import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CancelExpenseDto, CreateExpenseDto, ExpenseQueryDto } from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @RequirePermissions('expenses.read')
  @Get()
  findAll(@Query() query: ExpenseQueryDto) {
    return this.expensesService.findAll(query);
  }

  @RequirePermissions('expenses.create')
  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user?: AuthUser) {
    return this.expensesService.create(dto, user?.id);
  }

  @RequirePermissions('expenses.cancel')
  @Patch(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelExpenseDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.expensesService.cancel(id, dto, user?.id);
  }
}
