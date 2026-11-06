import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OwnerSettingsService } from './owner-settings.service';
import { CenterSettingsResponse } from './interfaces/owner-settings.interface';
import { UpdateCenterSettingsDto } from './dto/update-center-settings.dto';

@Controller('owner/settings')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class OwnerSettingsController {
  constructor(private readonly settingsService: OwnerSettingsService) {}

  @Get()
  @ResponseMessage('تم جلب إعدادات المركز بنجاح.')
  async getSettings(
    @CurrentCenterId() centerId: string,
  ): Promise<CenterSettingsResponse> {
    return this.settingsService.getSettings(centerId);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم تحديث إعدادات المركز بنجاح.')
  async updateSettings(
    @CurrentCenterId() centerId: string,
    @Body() dto: UpdateCenterSettingsDto,
  ): Promise<CenterSettingsResponse> {
    return this.settingsService.updateSettings(centerId, dto);
  }
}
