import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
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
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
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
    @CurrentCenterId() centerId: string,
    @Body() createGradeDto: CreateGradeDto,
  ): Promise<GradeDetails> {
    return this.gradesService.create(centerId, createGradeDto);
  }

  /**
   * جلب قائمة المراحل الدراسية للمركز الحالي.
   */
  @Get()
  @ResponseMessage('تم جلب المراحل الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findAll(
    @CurrentCenterId() centerId: string,
    @Query() query: GradeQueryDto,
  ): Promise<{ data: GradeListItem[]; meta: any }> {
    return this.gradesService.findAll(centerId, query);
  }

  /**
   * جلب تفاصيل مرحلة دراسية معينة.
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المرحلة الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOne(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<GradeDetails> {
    return this.gradesService.findOne(centerId, id);
  }

  /**
   * تحديث بيانات مرحلة دراسية معينة.
   */
  @Patch(':id')
  @ResponseMessage('تم تحديث المرحلة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() updateGradeDto: UpdateGradeDto,
  ): Promise<GradeDetails> {
    return this.gradesService.update(centerId, id, updateGradeDto);
  }

  /**
   * تفعيل أو تعطيل مرحلة دراسية معينة.
   */
  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل المرحلة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<GradeDetails> {
    return this.gradesService.toggleStatus(centerId, id);
  }

  /**
   * حذف مرحلة دراسية معينة.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم حذف المرحلة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  remove(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.gradesService.remove(centerId, id);
  }
}
