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
import {
  CreateDropdownOptionDto,
  ToggleDropdownOptionDto,
  UpdateDropdownOptionDto,
} from './dto/dropdown-option.dto';
import { CreateSettingDto, UpdateSettingDto } from './dto/setting.dto';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post()
  create(@Body() dto: CreateSettingDto) {
    return this.settingsService.create(dto);
  }

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  @Get('dropdown-options/categories')
  optionCategories() {
    return this.settingsService.categories();
  }

  @Get('dropdown-options')
  options() {
    return this.settingsService.findOptions();
  }

  @Get('dropdown-options/:category')
  optionsByCategory(@Param('category') category: string) {
    return this.settingsService.findOptions(category, true);
  }

  @Post('dropdown-options')
  createOption(@Body() dto: CreateDropdownOptionDto) {
    return this.settingsService.createOption(dto);
  }

  @Put('dropdown-options/:id')
  updateOption(@Param('id') id: string, @Body() dto: UpdateDropdownOptionDto) {
    return this.settingsService.updateOption(id, dto);
  }

  @Patch('dropdown-options/:id/active')
  toggleOption(@Param('id') id: string, @Body() dto: ToggleDropdownOptionDto) {
    return this.settingsService.toggleOption(id, dto);
  }

  @Delete('dropdown-options/:id')
  deleteOption(@Param('id') id: string) {
    return this.settingsService.deleteOption(id);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.settingsService.update(key, dto);
  }

  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.settingsService.remove(key);
  }
}
