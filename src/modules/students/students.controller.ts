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
  ForbiddenException,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { ExcelValidationPipe } from '../../shared/excel/pipes/excel-validation.pipe';
import { ExcelImportSummary } from '../../shared/excel/interfaces/excel.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { StudentDetails, StudentListItem } from './constants/student.select';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/get-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

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
    @CurrentCenterId() centerId: string,
    @Body() createStudentDto: CreateStudentDto,
  ): Promise<StudentListItem> {
    return this.studentsService.create(centerId, createStudentDto);
  }

  /**
   * جلب قائمة الطلاب للمركز الحالي مع دعم البحث، التصفية والفرز.
   */
  @Get()
  @ResponseMessage('تم جلب قائمة الطلاب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  findAll(
    @CurrentCenterId() centerId: string,
    @Query() query: StudentQueryDto,
  ): Promise<{ data: StudentListItem[]; meta: any }> {
    return this.studentsService.findAll(centerId, query);
  }

  /**
   * تصدير قائمة الطلاب للمركز الحالي إلى ملف Excel.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/excel')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportExcel(
    @CurrentCenterId() centerId: string,
    @Query() query: StudentQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.studentsService.exportToExcel(centerId, query, res);
  }

  /**
   * تصدير قائمة الطلاب للمركز الحالي إلى ملف PDF (Cairo Font RTL).
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/pdf')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportPdf(
    @CurrentCenterId() centerId: string,
    @Query() query: StudentQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.studentsService.exportToPdf(centerId, query, res);
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد بيانات الطلاب مع المراحل المعتمدة.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/template')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async getTemplate(
    @CurrentCenterId() centerId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.studentsService.getImportTemplate(centerId, res);
  }

  /**
   * استيراد بيانات الطلاب من ملف Excel المرفوع مع دعم فحص المعاينة (dryRun).
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Post('import/excel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم استيراد بيانات الطلاب بنجاح.')
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
      gradeName: string;
    }>
  > {
    return this.studentsService.importFromExcel(centerId, file.buffer, dryRun);
  }

  /**
   * جلب تفاصيل طالب معين.
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل الطالب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  async findOne(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<StudentDetails> {
    const student = await this.studentsService.findOne(centerId, id);

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
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
  ): Promise<StudentListItem> {
    return this.studentsService.update(centerId, id, updateStudentDto);
  }

  /**
   * تفعيل أو تعطيل حساب طالب معين.
   */
  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل حساب الطالب بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<StudentListItem> {
    return this.studentsService.toggleStatus(centerId, id);
  }
}
