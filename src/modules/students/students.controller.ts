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
import { ExcelValidationPipe } from '../../shared/excel/pipes/excel-validation.pipe';
import { ExcelImportSummary } from '../../shared/excel/interfaces/excel.interface';
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
   * تصدير قائمة الطلاب للمركز الحالي إلى ملف Excel.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/excel')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportExcel(
    @CurrentUser() user: RequestUser,
    @Query() query: StudentQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    const buffer = await this.studentsService.exportToExcel(
      user.centerId,
      query,
    );
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="students-${dateStr}.xlsx"`,
    );
    res.send(buffer);
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد بيانات الطلاب.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/template')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async getTemplate(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    const buffer = await this.studentsService.getImportTemplate(user.centerId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="students-template.xlsx"',
    );
    res.send(buffer);
  }

  /**
   * استيراد بيانات الطلاب من ملف Excel المرفوع.
   */
  @Post('import/excel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم استيراد بيانات الطلاب بنجاح.')
  @Roles(AppRole.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async importExcel(
    @CurrentUser() user: RequestUser,
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
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.studentsService.importFromExcel(
      user.centerId,
      file.buffer,
      dryRun,
    );
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
