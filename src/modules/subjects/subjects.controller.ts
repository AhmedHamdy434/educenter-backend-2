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
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { SubjectQueryDto } from './dto/get-subjects.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsService } from './subjects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { SubjectDetails, SubjectListItem } from './constants/subject.select';

@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  /**
   * جلب خيارات المواد الدراسية النشطة لاستخدامها في القوائم المنسدلة (Dropdown selectors).
   * يتم تحديد المسار قبل المسارات المتغيرة `:id` لمنع التعارض.
   */
  @Get('options')
  @ResponseMessage('تم جلب خيارات المواد الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOptions(
    @CurrentUser() user: RequestUser,
    @Query('gradeId') gradeId?: string,
  ): Promise<{ id: string; name: string; grade: { name: string } }[]> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.subjectsService.findOptions(user.centerId, gradeId);
  }

  /**
   * إنشاء مادة دراسية جديدة للمركز الحالي.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إنشاء المادة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  create(
    @CurrentUser() user: RequestUser,
    @Body() createSubjectDto: CreateSubjectDto,
  ): Promise<SubjectDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.subjectsService.create(user.centerId, createSubjectDto);
  }

  /**
   * جلب قائمة المواد الدراسية للمركز الحالي مع الفلترة والترقيم والبحث.
   */
  @Get()
  @ResponseMessage('تم جلب المواد الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: SubjectQueryDto,
  ): Promise<{ data: SubjectListItem[]; meta: any }> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.subjectsService.findAll(user.centerId, query);
  }

  /**
   * جلب تفاصيل مادة دراسية معينة تابعة للمركز الحالي.
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المادة الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<SubjectDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.subjectsService.findOne(user.centerId, id);
  }

  /**
   * تحديث بيانات مادة دراسية معينة تابعة للمركز الحالي.
   */
  @Patch(':id')
  @ResponseMessage('تم تحديث المادة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() updateSubjectDto: UpdateSubjectDto,
  ): Promise<SubjectDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.subjectsService.update(user.centerId, id, updateSubjectDto);
  }

  /**
   * تفعيل أو تعطيل مادة دراسية معينة تابعة للمركز الحالي.
   */
  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل المادة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<SubjectDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.subjectsService.toggleStatus(user.centerId, id);
  }
}
