import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { ExtraSessionsService } from './extra-sessions.service';
import { UpdateExtraSessionDto } from './dto/update-extra-session.dto';
import { CancelExtraSessionDto } from './dto/cancel-extra-session.dto';
import { AddExtraSessionStudentsDto } from './dto/add-extra-session-students.dto';
import { PayExtraSessionStudentDto } from './dto/pay-extra-session-student.dto';
import { WaiveExtraSessionStudentDto } from './dto/waive-extra-session-student.dto';

@ApiTags('Extra Sessions')
@ApiBearerAuth()
@Controller('extra-sessions')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class ExtraSessionsController {
  constructor(private readonly extraSessionsService: ExtraSessionsService) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'تفاصيل حصة إضافية محددة مع قائمة الطلاب والملخص المالي وجلسة الحضور',
  })
  @ResponseMessage('تم جلب تفاصيل الحصة الإضافية بنجاح.')
  async findOne(@CurrentCenterId() centerId: string, @Param('id') id: string) {
    return this.extraSessionsService.findOne(centerId, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تعديل بيانات الحصة الإضافية ورسومها' })
  @ResponseMessage('تم تعديل بيانات الحصة الإضافية بنجاح.')
  async update(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExtraSessionDto,
  ) {
    return this.extraSessionsService.update(centerId, id, dto);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'إلغاء الحصة الإضافية مع إشعار أولياء الأمور وتسجيل ملاحظات الاسترداد',
  })
  @ResponseMessage('تم إلغاء الحصة الإضافية بنجاح.')
  async cancel(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() dto: CancelExtraSessionDto,
  ) {
    return this.extraSessionsService.cancel(centerId, id, dto);
  }

  @Post(':id/students')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إضافة طلاب جدد للحصة الإضافية (للجمهور SELECTED)' })
  @ResponseMessage('تمت إضافة الطلاب إلى الحصة الإضافية بنجاح.')
  async addStudents(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() dto: AddExtraSessionStudentsDto,
  ) {
    return this.extraSessionsService.addStudents(centerId, id, dto);
  }

  @Post(':id/students/:studentId/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'تسجيل دفع كاش لطالب في الحصة الإضافية وإرسال إيصال واتساب',
  })
  @ResponseMessage('تم تسجيل سداد رسوم الحصة الإضافية بنجاح.')
  async payStudent(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Body() dto: PayExtraSessionStudentDto,
  ) {
    return this.extraSessionsService.payStudent(centerId, id, studentId, dto);
  }

  @Patch(':id/students/:studentId/waive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إعفاء طالب من رسوم الحصة الإضافية' })
  @ResponseMessage('تم إعفاء الطالب من رسوم الحصة الإضافية بنجاح.')
  async waiveStudent(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Body() dto: WaiveExtraSessionStudentDto,
  ) {
    return this.extraSessionsService.waiveStudent(centerId, id, studentId, dto);
  }

  @Post(':id/session')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'بدء وفتح جلسة الحضور للحصة الإضافية (في نفس اليوم أو بعده فقط)',
  })
  @ResponseMessage('تم بدء جلسة الحضور للحصة الإضافية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async startAttendanceSession(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.extraSessionsService.startAttendanceSession(
      centerId,
      id,
      user.role,
      user.id,
    );
  }
}
