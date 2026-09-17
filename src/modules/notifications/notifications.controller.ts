import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import type { Notification } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/get-notifications.dto';
import { PaginationMeta } from '../../common/utils/buildMeta';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * استعراض سجل الإشعارات للمركز التعليمي الحالي.
   */
  @Get()
  @ResponseMessage('تم جلب قائمة الإشعارات بنجاح.')
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: NotificationQueryDto,
  ): Promise<{ data: Notification[]; meta: PaginationMeta }> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.notificationsService.findAll(user.centerId, query);
  }
}
