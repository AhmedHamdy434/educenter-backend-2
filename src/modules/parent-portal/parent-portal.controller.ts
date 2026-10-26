import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { ParentPortalService } from './parent-portal.service';

@Controller('p')
export class ParentPortalController {
  constructor(private readonly parentPortalService: ParentPortalService) {}

  /**
   * استرجاع تقرير ولي الأمر عبر الرابط السحري (بدون تسجيل دخول / Public).
   */
  @Get(':token')
  @ResponseMessage('تم استرجاع تقرير الطالب بنجاح.')
  async getStudentReport(@Param('token') token: string) {
    return this.parentPortalService.getStudentReportByToken(token);
  }

  /**
   * توليد رابط سحري جديد لطالب محدد (خاص بإدارة المركز والمعلمين).
   */
  @Post('generate/:studentId')
  @UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم توليد الرابط السحري بنجاح.')
  async generateMagicLink(
    @CurrentUser() user: RequestUser,
    @Param('studentId') studentId: string,
  ) {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.parentPortalService.generateMagicToken(
      studentId,
      user.centerId,
      user.role,
      user.id,
    );
  }
}
