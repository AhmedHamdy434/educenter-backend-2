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
  Res,
  UseInterceptors,
  UploadedFile,
  DefaultValuePipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  BypassInterceptor,
  ResponseMessage,
} from '../../common/decorators/response-message.decorator';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { ExcelValidationPipe } from '../../shared/excel/pipes/excel-validation.pipe';
import { ExcelImportSummary } from '../../shared/excel/interfaces/excel.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeacherDetails, TeacherListItem } from './constants/teacher.select';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherQueryDto } from './dto/get-teachers.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeachersService } from './teachers.service';

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
    @CurrentCenterId() centerId: string,
    @Body() createTeacherDto: CreateTeacherDto,
  ): Promise<TeacherListItem> {
    return this.teachersService.create(centerId, createTeacherDto);
  }

  /**
   * جلب قائمة المدرسين للمركز الحالي مع دعم البحث، التصفية والفرز.
   */
  @Get()
  @ResponseMessage('تم جلب قائمة المدرسين بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findAll(
    @CurrentCenterId() centerId: string,
    @Query() query: TeacherQueryDto,
  ): Promise<{ data: TeacherListItem[]; meta: any }> {
    return this.teachersService.findAll(centerId, query);
  }

  /**
   * تصدير قائمة المدرسين للمركز الحالي إلى ملف Excel.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/excel')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportExcel(
    @CurrentCenterId() centerId: string,
    @Query() query: TeacherQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.teachersService.exportToExcel(centerId, query, res);
  }

  /**
   * تصدير قائمة المدرسين للمركز الحالي إلى ملف PDF (Cairo Font RTL).
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/pdf')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportPdf(
    @CurrentCenterId() centerId: string,
    @Query() query: TeacherQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.teachersService.exportToPdf(centerId, query, res);
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد بيانات المدرسين مع المواد المعتمدة.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/template')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async getTemplate(
    @CurrentCenterId() centerId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.teachersService.getImportTemplate(centerId, res);
  }

  /**
   * استيراد بيانات المدرسين من ملف Excel المرفوع مع دعم فحص المعاينة (dryRun).
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Post('import/excel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم استيراد بيانات المدرسين بنجاح.')
  @Roles(AppRole.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async importExcel(
    @CurrentCenterId() centerId: string,
    @UploadedFile(new ExcelValidationPipe()) file: Express.Multer.File,
    @Query('dryRun', new DefaultValuePipe(false), ParseBoolPipe)
    dryRun: boolean,
  ): Promise<
    ExcelImportSummary<{
      fullName: string;
      email: string;
      phone?: string;
      subjectNames?: string;
    }>
  > {
    return this.teachersService.importFromExcel(centerId, file.buffer, dryRun);
  }

  /**
   * جلب تفاصيل مدرس معين.
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المدرس بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOne(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<TeacherDetails> {
    return this.teachersService.findOne(centerId, id);
  }

  /**
   * تحديث بيانات مدرس معين.
   */
  @Patch(':id')
  @ResponseMessage('تم تحديث بيانات المدرس بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() updateTeacherDto: UpdateTeacherDto,
  ): Promise<TeacherListItem> {
    return this.teachersService.update(centerId, id, updateTeacherDto);
  }

  /**
   * تفعيل أو تعطيل حساب مدرس معين.
   */
  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل حساب المدرس بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<TeacherListItem> {
    return this.teachersService.toggleStatus(centerId, id);
  }

  /**
   * حذف مدرس معين مع حسابه بعد التحقق من عدم ارتباطه بأي بيانات.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم حذف المدرس بنجاح.')
  @Roles(AppRole.OWNER)
  remove(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.teachersService.remove(centerId, id);
  }
}
