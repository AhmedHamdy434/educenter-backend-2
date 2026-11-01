import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { ScheduleService } from './schedule.service';
import { GetCalendarScheduleDto } from './dto/get-calendar-schedule.dto';
import { GetUpcomingScheduleDto } from './dto/get-upcoming-schedule.dto';

@ApiTags('Schedule')
@ApiBearerAuth()
@Controller('schedule')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('calendar')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم جلب جدول الحصص الشهري بنجاح.')
  @ApiOperation({
    summary: 'جلب جدول الحصص لشهر كامل مفردة على أيامه (لوضع الـ Calendar)',
  })
  @ApiResponse({
    status: 200,
    description: 'تم جلب جدول الحصص للشهر بنجاح.',
  })
  async getCalendarSchedule(
    @CurrentCenterId() centerId: string,
    @Query() query: GetCalendarScheduleDto,
  ) {
    return this.scheduleService.getCalendarSchedule(centerId, query);
  }

  @Get('upcoming')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم جلب الحصص القادمة بنجاح.')
  @ApiOperation({
    summary:
      'جلب الحصص القادمة بدءاً من اليوم حتى نهاية الشهر الحالي (لوضع الـ Accordion)',
  })
  @ApiResponse({
    status: 200,
    description: 'تم جلب الحصص القادمة بنجاح.',
  })
  async getUpcomingSchedule(
    @CurrentCenterId() centerId: string,
    @Query() query: GetUpcomingScheduleDto,
  ) {
    return this.scheduleService.getUpcomingSchedule(centerId, query);
  }
}
