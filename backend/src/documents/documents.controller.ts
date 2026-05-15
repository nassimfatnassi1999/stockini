import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { DocumentsService } from './documents.service';
import {
  GenerateDocumentsDto,
  EmailPreviewDto,
  SendEmailDto,
  SendDocumentEmailDto,
  UpdateDocumentDto,
  ListDocumentsQuery,
} from './dto/document.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  // ── Generation ──────────────────────────────────────────────────────────────

  @Post('generate')
  @RequirePermissions('documents.create')
  generate(@Body() dto: GenerateDocumentsDto, @CurrentUser() user?: AuthUser) {
    return this.svc.generate(dto, user);
  }

  // ── List endpoints (specific routes before :id to avoid conflicts) ───────────

  /** New paginated list with rich filters — used by /documents page */
  @Get()
  @RequirePermissions('documents.view')
  list(@Query() query: ListDocumentsQuery) {
    return this.svc.list(query);
  }

  /** Legacy flat list — kept for backward compat (used by ventes page) */
  @Get('generated')
  @RequirePermissions('documents.view')
  findAll(@Query('invoiceId') invoiceId?: string) {
    return this.svc.findAll(invoiceId);
  }

  // ── Batch email (ventes page) ────────────────────────────────────────────────

  @Post('email-preview')
  @RequirePermissions('documents.view')
  emailPreview(@Body() dto: EmailPreviewDto) {
    return this.svc.emailPreview(dto);
  }

  @Post('send-email')
  @RequirePermissions('documents.email')
  sendEmail(@Body() dto: SendEmailDto, @CurrentUser() user?: AuthUser) {
    return this.svc.sendEmail(dto, user);
  }

  // ── Per-document routes (:id must come after all static paths) ───────────────

  @Get(':id')
  @RequirePermissions('documents.view')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('documents.update')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('documents.delete')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Get(':id/presigned-url')
  @RequirePermissions('documents.view')
  presignedUrl(@Param('id') id: string) {
    return this.svc.getPresignedUrl(id);
  }

  /** Stream PDF inline in browser (view) */
  @Get(':id/view')
  @RequirePermissions('documents.view')
  async view(@Param('id') id: string, @Res() res: Response) {
    const { buffer, fileName } = await this.svc.getDownloadBuffer(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  }

  @Get(':id/download')
  @RequirePermissions('documents.download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { buffer, fileName } = await this.svc.getDownloadBuffer(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post(':id/send-email')
  @RequirePermissions('documents.email')
  sendEmailForDocument(
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.svc.sendEmailForDocument(id, dto, user);
  }

  @Get(':id/email-logs')
  @RequirePermissions('documents.view')
  getEmailLogs(@Param('id') id: string) {
    return this.svc.getEmailLogs(id);
  }

  @Post(':id/regenerate')
  @RequirePermissions('documents.update')
  regenerate(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.svc.regenerate(id, user);
  }
}
