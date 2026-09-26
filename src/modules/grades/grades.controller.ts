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
import { ExcelValidationPipe } from '../../shared/excel/pipes/excel-validation.pipe';
import { ExcelImportSummary } from '../../shared/excel/interfaces/excel.interface';
import { GradeListItem } from './constants/grade.select';

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
  ): Promise<GradeListItem> {
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
   * تصدير المراحل الدراسية لملف Excel.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/excel')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async exportExcel(
    @CurrentCenterId() centerId: string,
    @Query() query: GradeQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.gradesService.exportToExcel(centerId, query, res);
  }

  /**
   * تصدير المراحل الدراسية لملف PDF مع تطبيق الفلاتر والبحث.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/pdf')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async exportPdf(
    @CurrentCenterId() centerId: string,
    @Query() query: GradeQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.gradesService.exportToPdf(centerId, query, res);
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد المراحل الدراسية.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/template')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async getTemplate(@Res() res: Response): Promise<void> {
    await this.gradesService.getImportTemplate(res);
  }

  /**
   * استيراد المراحل الدراسية من ملف Excel المرفوع.
   */
  @Post('import/excel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم استيراد المراحل الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async importExcel(
    @CurrentCenterId() centerId: string,
    @UploadedFile(new ExcelValidationPipe()) file: Express.Multer.File,
    @Query('dryRun', new DefaultValuePipe(false), ParseBoolPipe)
    dryRun: boolean,
  ): Promise<
    ExcelImportSummary<{ name: string; order: number; description?: string }>
  > {
    return this.gradesService.importFromExcel(centerId, file.buffer, dryRun);
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
  ): Promise<GradeListItem> {
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
  ): Promise<GradeListItem> {
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
  ): Promise<GradeListItem> {
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
