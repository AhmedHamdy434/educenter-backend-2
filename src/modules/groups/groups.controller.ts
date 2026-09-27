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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { ExcelValidationPipe } from '../../shared/excel/pipes/excel-validation.pipe';
import { ExcelImportSummary } from '../../shared/excel/interfaces/excel.interface';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupQueryDto } from './dto/get-groups.dto';
import { GroupStudentsDto } from './dto/group-students.dto';
import { GroupDetails, GroupListItem } from './constants/group.select';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إنشاء المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  create(
    @CurrentCenterId() centerId: string,
    @Body() createGroupDto: CreateGroupDto,
  ): Promise<GroupListItem> {
    return this.groupsService.create(centerId, createGroupDto);
  }

  @Get()
  @ResponseMessage('تم جلب المجموعات الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findAll(
    @CurrentUser() user: RequestUser,
    @CurrentCenterId() centerId: string,
    @Query() query: GroupQueryDto,
  ): Promise<{ data: GroupListItem[]; meta: any }> {
    return this.groupsService.findAll(centerId, query, user.role, user.id);
  }

  /**
   * تصدير قائمة المجموعات الدراسية إلى ملف Excel مع تطبيق الفلاتر والبحث.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/excel')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportExcel(
    @CurrentUser() user: RequestUser,
    @CurrentCenterId() centerId: string,
    @Query() query: GroupQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.groupsService.exportToExcel(
      centerId,
      query,
      user.role,
      user.id,
      res,
    );
  }

  /**
   * تصدير قائمة المجموعات الدراسية إلى ملف PDF مع تطبيق الفلاتر والبحث.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/pdf')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportPdf(
    @CurrentUser() user: RequestUser,
    @CurrentCenterId() centerId: string,
    @Query() query: GroupQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.groupsService.exportToPdf(
      centerId,
      query,
      user.role,
      user.id,
      res,
    );
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد بيانات المجموعات الدراسية.
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Get('export/template')
  @Roles(AppRole.OWNER)
  @BypassInterceptor()
  async getTemplate(
    @CurrentCenterId() centerId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.groupsService.getImportTemplate(centerId, res);
  }

  /**
   * استيراد بيانات المجموعات الدراسية من ملف Excel المرفوع مع دعم فحص المعاينة (dryRun).
   * تم وضعه قبل مسار :id لتجنب تعارض المسارات في Express.
   */
  @Post('import/excel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم استيراد بيانات المجموعات بنجاح.')
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
      subjectId: string;
      subjectName: string;
      teacherId: string;
      teacherName: string;
      monthlyFee: number;
    }>
  > {
    return this.groupsService.importFromExcel(centerId, file.buffer, dryRun);
  }

  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOne(
    @CurrentUser() user: RequestUser,
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<GroupDetails> {
    return this.groupsService.findOne(centerId, id, user.role, user.id);
  }

  @Patch(':id')
  @ResponseMessage('تم تحديث المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<GroupListItem> {
    return this.groupsService.update(centerId, id, updateGroupDto);
  }

  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<GroupListItem> {
    return this.groupsService.toggleStatus(centerId, id);
  }

  @Post(':id/students')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم إضافة الطلاب للمجموعة بنجاح.')
  @Roles(AppRole.OWNER)
  addStudents(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() groupStudentsDto: GroupStudentsDto,
  ): Promise<GroupDetails> {
    return this.groupsService.addStudents(centerId, id, groupStudentsDto);
  }

  @Delete(':id/students')
  @ResponseMessage('تم إزالة الطلاب من المجموعة بنجاح.')
  @Roles(AppRole.OWNER)
  removeStudents(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() groupStudentsDto: GroupStudentsDto,
  ): Promise<GroupDetails> {
    return this.groupsService.removeStudents(centerId, id, groupStudentsDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ResponseMessage('تم حذف المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  remove(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.groupsService.remove(centerId, id);
  }
}
