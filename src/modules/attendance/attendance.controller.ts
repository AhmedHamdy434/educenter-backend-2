import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
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
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { AttendanceService } from './attendance.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('groups/:groupId/attendance/session')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم بدء/فتح جلسة الحضور بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async startOrGetSession(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
  ) {
    return this.attendanceService.startOrGetSession(
      centerId,
      groupId,
      user.role,
      user.id,
    );
  }

  @Get('groups/:groupId/attendance/sessions')
  @ResponseMessage('تم جلب سجل الجلسات بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async getGroupSessions(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
  ) {
    return this.attendanceService.getGroupSessions(
      centerId,
      groupId,
      user.role,
      user.id,
    );
  }

  @Get('groups/:groupId/attendance/report')
  @ResponseMessage('تم جلب تقرير المجموعة بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async getGroupReport(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
  ) {
    return this.attendanceService.getGroupReport(
      centerId,
      groupId,
      user.role,
      user.id,
    );
  }

  @Get('students/:studentId/attendance/report')
  @ResponseMessage('تم جلب تقرير الطالب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  async getStudentReport(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('studentId') studentId: string,
  ) {
    return this.attendanceService.getStudentReport(
      centerId,
      studentId,
      user.role,
      user.id,
    );
  }

  @Get('groups/:groupId/attendance/session/:sessionId')
  @ResponseMessage('تم جلب تفاصيل جلسة الحضور بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async getSessionDetails(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.attendanceService.getSessionDetails(
      centerId,
      groupId,
      sessionId,
      user.role,
      user.id,
    );
  }

  @Post('groups/:groupId/attendance/session/:sessionId/save')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم حفظ كشف الحضور والغياب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async saveAttendance(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SaveAttendanceDto,
  ) {
    return this.attendanceService.saveAttendance(
      centerId,
      groupId,
      sessionId,
      dto,
      user.role,
      user.id,
    );
  }
}
