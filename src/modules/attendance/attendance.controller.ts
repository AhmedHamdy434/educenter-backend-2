import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  BadRequestException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { AttendanceService } from './attendance.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  private validateCenterId(centerId?: string | null): string {
    if (!centerId) {
      throw new BadRequestException(
        'المركز التعريفي غير محدد للمستخدم الحالي.',
      );
    }
    return centerId;
  }

  @Post('groups/:groupId/attendance/session')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم بدء/فتح جلسة الحضور بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async startOrGetSession(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
  ) {
    const centerId = this.validateCenterId(user.centerId);
    const session = await this.attendanceService.startOrGetSession(
      centerId,
      groupId,
      user.role,
      user.id,
    );
    return { success: true, data: session };
  }

  @Get('groups/:groupId/attendance/session/:sessionId')
  @ResponseMessage('تم جلب تفاصيل جلسة الحضور بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async getSessionDetails(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const centerId = this.validateCenterId(user.centerId);
    const data = await this.attendanceService.getSessionDetails(
      centerId,
      groupId,
      sessionId,
      user.role,
      user.id,
    );
    return { success: true, data };
  }

  @Post('groups/:groupId/attendance/session/:sessionId/save')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم حفظ كشف الحضور والغياب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async saveAttendance(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SaveAttendanceDto,
  ) {
    const centerId = this.validateCenterId(user.centerId);
    return this.attendanceService.saveAttendance(
      centerId,
      groupId,
      sessionId,
      dto,
      user.role,
      user.id,
    );
  }

  @Get('groups/:groupId/attendance/sessions')
  @ResponseMessage('تم جلب سجل الجلسات بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async getGroupSessions(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
  ) {
    const centerId = this.validateCenterId(user.centerId);
    const data = await this.attendanceService.getGroupSessions(
      centerId,
      groupId,
      user.role,
      user.id,
    );
    return { success: true, data };
  }

  @Get('groups/:groupId/attendance/report')
  @ResponseMessage('تم جلب تقرير المجموعة بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async getGroupReport(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
  ) {
    const centerId = this.validateCenterId(user.centerId);
    const data = await this.attendanceService.getGroupReport(
      centerId,
      groupId,
      user.role,
      user.id,
    );
    return { success: true, data };
  }

  @Get('students/:studentId/attendance/report')
  @ResponseMessage('تم جلب تقرير الطالب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  async getStudentReport(
    @CurrentUser() user: RequestUser,
    @Param('studentId') studentId: string,
  ) {
    const centerId = this.validateCenterId(user.centerId);
    const data = await this.attendanceService.getStudentReport(
      centerId,
      studentId,
      user.role,
      user.id,
    );
    return { success: true, data };
  }
}
