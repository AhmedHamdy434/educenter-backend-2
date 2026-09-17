import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
  HttpStatus,
  HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/get-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { StudentDetails, StudentListItem } from './constants/student.select';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  /**
   * إضافة طالب جديد للمركز الحالي.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إضافة الطالب بنجاح.')
  @Roles(AppRole.OWNER)
  create(
    @CurrentUser() user: RequestUser,
    @Body() createStudentDto: CreateStudentDto,
  ): Promise<StudentDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.studentsService.create(user.centerId, createStudentDto);
  }

  /**
   * جلب قائمة الطلاب للمركز الحالي.
   */
  @Get()
  @ResponseMessage('تم جلب قائمة الطلاب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: StudentQueryDto,
  ): Promise<{ data: StudentListItem[]; meta: any }> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.studentsService.findAll(user.centerId, query);
  }

  /**
   * جلب تفاصيل طالب معين.
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل الطالب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  async findOne(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<StudentDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    const student = await this.studentsService.findOne(user.centerId, id);

    // التحقق من صلاحيات الطالب: يمكنه فقط استعراض حسابه الشخصي
    if (user.role === AppRole.STUDENT && student.user.id !== user.id) {
      throw new ForbiddenException(
        'ليس لديك الصلاحية للوصول لبيانات طالب آخر.',
      );
    }

    return student;
  }

  /**
   * تحديث بيانات طالب معين.
   */
  @Patch(':id')
  @ResponseMessage('تم تحديث بيانات الطالب بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
  ): Promise<StudentDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.studentsService.update(user.centerId, id, updateStudentDto);
  }

  /**
   * تفعيل أو تعطيل حساب طالب معين.
   */
  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل حساب الطالب بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<StudentDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.studentsService.toggleStatus(user.centerId, id);
  }
}
