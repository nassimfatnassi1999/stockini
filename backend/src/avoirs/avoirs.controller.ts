import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AvoirsService } from './avoirs.service';
import { CreateCreditNoteDto } from './dto/avoir.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('avoirs')
export class AvoirsController {
  constructor(private readonly avoirsService: AvoirsService) {}

  @RequirePermissions('sales.view')
  @Get('sales/:saleId/returnable-items')
  getReturnableItems(@Param('saleId') saleId: string) {
    return this.avoirsService.getReturnableItems(saleId);
  }

  @RequirePermissions('sales.create')
  @Post()
  create(@Body() dto: CreateCreditNoteDto, @CurrentUser() user?: AuthUser) {
    return this.avoirsService.create(dto, user);
  }

  @RequirePermissions('sales.view')
  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('saleId') saleId?: string,
  ) {
    return this.avoirsService.findAll(customerId, saleId);
  }

  @RequirePermissions('sales.view')
  @Get('clients/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.avoirsService.findByCustomer(customerId);
  }

  @RequirePermissions('sales.view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.avoirsService.findOne(id);
  }

  @RequirePermissions('sales.view')
  @Get(':id/pdf')
  async getPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.avoirsService.generatePdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
