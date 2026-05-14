import {
  BadRequestException,
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
import { DocumentType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateSaleDto, SalePaginationDto, UpdateSaleDto } from './dto/sale.dto';
import { SalesService } from './sales.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermissions('sales.create')
  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user?: AuthUser) {
    return this.salesService.create(dto, user);
  }

  @RequirePermissions('sales.view')
  @Get()
  findAll(@Query() query: SalePaginationDto) {
    return this.salesService.findAll(query);
  }

  @RequirePermissions('sales.view')
  @Get('next-reference')
  getNextReference(@Query('documentType') documentType: string) {
    const validTypes = Object.values(DocumentType) as string[];
    if (!documentType || !validTypes.includes(documentType)) {
      throw new BadRequestException(
        `Type de document invalide. Valeurs acceptées: ${validTypes.join(', ')}`,
      );
    }
    return this.salesService.getNextReference(documentType as DocumentType);
  }

  @RequirePermissions('sales.view_details')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.salesService.findOne(id, user);
  }

  @RequirePermissions('sales.update')
  @Patch(':id/validate')
  validate(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.salesService.validate(id, user);
  }

  @RequirePermissions('sales.delete')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.salesService.cancel(id, user);
  }

  @RequirePermissions('sales.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto, @CurrentUser() user?: AuthUser) {
    return this.salesService.update(id, dto, user);
  }

  @RequirePermissions('sales.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.salesService.remove(id, user);
  }
}
