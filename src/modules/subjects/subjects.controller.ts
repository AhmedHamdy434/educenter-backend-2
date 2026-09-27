import {
  Body,
  Controller,
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
import { CreateSubjectDto } from './dto/create-subject.dto';
import { SubjectQueryDto } from './dto/get-subjects.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsService } from './subjects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { ExcelValidationPipe } from '../../shared/excel/pipes/excel-validation.pipe';
import { ExcelImportSummary } from '../../shared/excel/interfaces/excel.interface';
import { SubjectListItem } from './constants/subject.select';

@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  /**
   * جلب خيارات المواد الدراسية النشطة لاستخدامها في القوائم المنسدلة (Dropdown selectors).
   * تم وضعه قبل مسارات :id لمنع التعارض في Express.
   */
  @Get('options')
  @ResponseMessage('تم جلب خيارات المواد الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOptions(
    @CurrentCenterId() centerId: string,
    @Query('gradeId') gradeId?: string,
  ): Promise<{ id: string; name: string; grade: { name: string } }[]> {
    return this.subjectsService.findOptions(centerId, gradeId);
  }

  /**
   * تصدير المواد الدراسية لملف Excel مع تطبيق الفلاتر والبحث.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/excel')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async exportExcel(
    @CurrentCenterId() centerId: string,
    @Query() query: SubjectQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.subjectsService.exportToExcel(centerId, query, res);
  }

  /**
   * تصدير المواد الدراسية لملف PDF مع تطبيق الفلاتر والبحث.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/pdf')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async exportPdf(
    @CurrentCenterId() centerId: string,
    @Query() query: SubjectQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.subjectsService.exportToPdf(centerId, query, res);
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد المواد الدراسية.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/template')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async getTemplate(
    @CurrentCenterId() centerId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.subjectsService.getImportTemplate(centerId, res);
  }

  /**
   * استيراد المواد الدراسية من ملف Excel المرفوع.
   */
  @Post('import/excel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم استيراد المواد الدراسية بنجاح.')
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
      name: string;
      gradeId: string;
      gradeName: string;
      description?: string;
    }>
  > {
    return this.subjectsService.importFromExcel(centerId, file.buffer, dryRun);
  }

  /**
   * إنشاء مادة دراسية جديدة للمركز الحالي.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إنشاء المادة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  create(
    @CurrentCenterId() centerId: string,
    @Body() createSubjectDto: CreateSubjectDto,
  ): Promise<SubjectListItem> {
    return this.subjectsService.create(centerId, createSubjectDto);
  }

  /**
   * جلب قائمة المواد الدراسية للمركز الحالي مع الفلترة والترقيم والبحث.
   */
  @Get()
  @ResponseMessage('تم جلب المواد الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findAll(
    @CurrentCenterId() centerId: string,
    @Query() query: SubjectQueryDto,
  ): Promise<{ data: SubjectListItem[]; meta: any }> {
    return this.subjectsService.findAll(centerId, query);
  }

  /**
   * جلب تفاصيل مادة دراسية معينة تابعة للمركز الحالي.
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المادة الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOne(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<SubjectListItem> {
    return this.subjectsService.findOne(centerId, id);
  }

  /**
   * تحديث بيانات مادة دراسية معينة تابعة للمركز الحالي.
   */
  @Patch(':id')
  @ResponseMessage('تم تحديث المادة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() updateSubjectDto: UpdateSubjectDto,
  ): Promise<SubjectListItem> {
    return this.subjectsService.update(centerId, id, updateSubjectDto);
  }

  /**
   * تفعيل أو تعطيل مادة دراسية معينة تابعة للمركز الحالي.
   */
  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل المادة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<SubjectListItem> {
    return this.subjectsService.toggleStatus(centerId, id);
  }
}
