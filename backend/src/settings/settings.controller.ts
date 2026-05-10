import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import {
  CreateDropdownOptionDto,
  ToggleDropdownOptionDto,
  UpdateDropdownOptionDto,
} from './dto/dropdown-option.dto';
import { CreateSettingDto, UpdateSettingDto } from './dto/setting.dto';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @RequirePermissions('settings.update')
  @Post()
  create(@Body() dto: CreateSettingDto) {
    return this.settingsService.create(dto);
  }

  @RequirePermissions('settings.view')
  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  @RequirePermissions('settings.view')
  @Get('dropdown-options/categories')
  optionCategories() {
    return this.settingsService.categories();
  }

  @RequirePermissions('settings.view')
  @Get('dropdown-options')
  options() {
    return this.settingsService.findOptions();
  }

  @RequirePermissions('settings.view')
  @Get('dropdown-options/:category')
  optionsByCategory(@Param('category') category: string) {
    return this.settingsService.findOptions(category, true);
  }

  @RequirePermissions('settings.update')
  @Post('dropdown-options')
  createOption(@Body() dto: CreateDropdownOptionDto) {
    return this.settingsService.createOption(dto);
  }

  @RequirePermissions('settings.update')
  @Put('dropdown-options/:id')
  updateOption(@Param('id') id: string, @Body() dto: UpdateDropdownOptionDto) {
    return this.settingsService.updateOption(id, dto);
  }

  @RequirePermissions('settings.update')
  @Patch('dropdown-options/:id/active')
  toggleOption(@Param('id') id: string, @Body() dto: ToggleDropdownOptionDto) {
    return this.settingsService.toggleOption(id, dto);
  }

  @RequirePermissions('settings.update')
  @Delete('dropdown-options/:id')
  deleteOption(@Param('id') id: string) {
    return this.settingsService.deleteOption(id);
  }

  @RequirePermissions('settings.update')
  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.settingsService.update(key, dto);
  }

  @RequirePermissions('settings.update')
  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.settingsService.remove(key);
  }
}
