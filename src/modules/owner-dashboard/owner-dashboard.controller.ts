import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OwnerDashboardService } from './owner-dashboard.service';
import { GetOwnerDashboardDto } from './dto/get-owner-dashboard.dto';
import { OwnerDashboardData } from './interfaces/owner-dashboard.interface';

@Controller('owner/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class OwnerDashboardController {
  constructor(private readonly dashboardService: OwnerDashboardService) {}

  @Get()
  @ResponseMessage('تم جلب بيانات لوحة التحكم بنجاح.')
  async getDashboardData(
    @CurrentCenterId() centerId: string,
    @Query() dto: GetOwnerDashboardDto,
  ): Promise<OwnerDashboardData> {
    return this.dashboardService.getDashboardData(centerId, dto);
  }
}
