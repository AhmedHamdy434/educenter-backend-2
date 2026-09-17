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
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherQueryDto } from './dto/get-teachers.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { TeacherDetails, TeacherListItem } from './constants/teacher.select';

@Controller('teachers')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  /**
   * إضافة مدرس جديد للمركز الحالي.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إضافة المدرس بنجاح.')
  @Roles(AppRole.OWNER)
  create(
    @CurrentUser() user: RequestUser,
    @Body() createTeacherDto: CreateTeacherDto,
  ): Promise<TeacherDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.teachersService.create(user.centerId, createTeacherDto);
  }

  /**
   * جلب قائمة المدرسين للمركز الحالي.
   */
  @Get()
  @ResponseMessage('تم جلب قائمة المدرسين بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: TeacherQueryDto,
  ): Promise<{ data: TeacherListItem[]; meta: any }> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.teachersService.findAll(user.centerId, query);
  }

  /**
   * جلب تفاصيل مدرس معين.
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المدرس بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<TeacherDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.teachersService.findOne(user.centerId, id);
  }

  /**
   * تحديث بيانات مدرس معين.
   */
  @Patch(':id')
  @ResponseMessage('تم تحديث بيانات المدرس بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() updateTeacherDto: UpdateTeacherDto,
  ): Promise<TeacherDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.teachersService.update(user.centerId, id, updateTeacherDto);
  }

  /**
   * تفعيل أو تعطيل حساب مدرس معين.
   */
  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل حساب المدرس بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<TeacherDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.teachersService.toggleStatus(user.centerId, id);
  }
}
