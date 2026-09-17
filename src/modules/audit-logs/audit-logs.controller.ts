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
import { AuditLogsService, AuditLogItem } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/get-audit-logs.dto';
import { PaginationMeta } from '../../common/utils/buildMeta';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER, AppRole.ADMIN)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  /**
   * استعراض سجل الحركات والتدقيق المالي والإداري للمركز الحالي.
   */
  @Get()
  @ResponseMessage('تم جلب سجل التدقيق بنجاح.')
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: AuditLogQueryDto,
  ): Promise<{ data: AuditLogItem[]; meta: PaginationMeta }> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.auditLogsService.findAll(user.centerId, query);
  }
}
