import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StockAdjustmentDto, StockChangeDto } from './dto/stock.dto';
import { StockService } from './stock.service';

@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('entry')
  entry(@Body() dto: StockChangeDto, @CurrentUser() user?: AuthUser) {
    return this.stockService.entry(dto, user?.id);
  }

  @Post('exit')
  exit(@Body() dto: StockChangeDto, @CurrentUser() user?: AuthUser) {
    return this.stockService.exit(dto, user?.id);
  }

  @Post('adjustment')
  adjustment(@Body() dto: StockAdjustmentDto, @CurrentUser() user?: AuthUser) {
    return this.stockService.adjustment(dto, user?.id);
  }

  @Get('movements')
  history(@Query('productId') productId?: string) {
    return this.stockService.history(productId);
  }
}
