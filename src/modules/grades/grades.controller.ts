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
import { CreateGradeDto } from './dto/create-grade.dto';
import { GradeQueryDto } from './dto/get-grades.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { GradesService } from './grades.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { GradeDetails, GradeListItem } from './constants/grade.select';

@Controller('grades')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  /**
   * إنشاء مرحلة دراسية جديدة للمركز الحالي.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إنشاء المرحلة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  create(
    @CurrentUser() user: RequestUser,
    @Body() createGradeDto: CreateGradeDto,
  ): Promise<GradeDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.gradesService.create(user.centerId, createGradeDto);
  }

  /**
   * جلب قائمة المراحل الدراسية للمركز الحالي.
   */
  @Get()
  @ResponseMessage('تم جلب المراحل الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: GradeQueryDto,
  ): Promise<{ data: GradeListItem[]; meta: any }> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.gradesService.findAll(user.centerId, query);
  }

  /**
   * جلب تفاصيل مرحلة دراسية معينة.
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المرحلة الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<GradeDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.gradesService.findOne(user.centerId, id);
  }

  /**
   * تحديث بيانات مرحلة دراسية معينة.
   */
  @Patch(':id')
  @ResponseMessage('تم تحديث المرحلة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() updateGradeDto: UpdateGradeDto,
  ): Promise<GradeDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.gradesService.update(user.centerId, id, updateGradeDto);
  }

  /**
   * تفعيل أو تعطيل مرحلة دراسية معينة.
   */
  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل المرحلة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<GradeDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.gradesService.toggleStatus(user.centerId, id);
  }
}
