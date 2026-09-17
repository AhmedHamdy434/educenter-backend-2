import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CentersService } from './centers.service';
import { CreateCenterDto } from './dto/create-center.dto';
import { UpdateCenterDto } from './dto/update-center.dto';
import { CenterQueryDto } from './dto/get-centers.dto';
import { UpdateCenterStatusDto } from './dto/update-center-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AppRole } from '../../common/enums/app-role.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageValidationPipe } from '../../shared/cloudinary/pipes/image-validation.pipe';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';

import { SubscribeCenterDto } from './dto/subscribe-center.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { CenterDetails, CenterListItem } from './constants/center.select';
import { PaginationMeta } from '../../common/utils/buildMeta';

@ApiTags('Centers')
@ApiBearerAuth('JWT-auth')
@Controller('centers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CentersController {
  constructor(private readonly centersService: CentersService) {}

  @Post()
  @ResponseMessage('تم إنشاء المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo'))
  @ApiOperation({
    summary:
      'إنشاء مركز تعليمي جديد مع إنشاء حساب المالك والاشتراك الأولي للباقة',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'بيانات المركز والمالك والاشتراك مع الشعار الاختياري',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'سنتر الأوائل التعليمي' },
        slug: { type: 'string', example: 'el-awael-center' },
        email: { type: 'string', example: 'info@elawael.com' },
        phone: { type: 'string', example: '01012345678' },
        description: {
          type: 'string',
          example: 'مركز تعليمي للمرحلة الثانوية',
        },
        address: { type: 'string', example: 'القاهرة - مدينة نصر' },
        ownerFullName: { type: 'string', example: 'أحمد محمود' },
        ownerEmail: { type: 'string', example: 'owner@elawael.com' },
        ownerPassword: { type: 'string', example: 'OwnerP@ssword123' },
        subscriptionPlanId: { type: 'string', example: 'cuid-plan-premium' },
        customPrice: { type: 'number', example: 1200 },
        startDate: {
          type: 'string',
          format: 'date-time',
          example: '2026-09-01T00:00:00.000Z',
        },
        logo: {
          type: 'string',
          format: 'binary',
          description: 'ملف صورة الشعار',
        },
      },
      required: [
        'name',
        'slug',
        'email',
        'phone',
        'ownerFullName',
        'ownerEmail',
        'ownerPassword',
        'subscriptionPlanId',
        'startDate',
      ],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'تم إنشاء المركز وحساب المالك والاشتراك بنجاح',
  })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({
    status: 409,
    description: 'البريد أو الهاتف أو الرابط (slug) مسجل مسبقاً',
  })
  create(
    @Body() createCenterDto: CreateCenterDto,
    @UploadedFile(ImageValidationPipe(false)) logo?: Express.Multer.File,
  ): Promise<CenterDetails> {
    return this.centersService.create(createCenterDto, logo);
  }

  @Get()
  @ResponseMessage('تم جلب المراكز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'جلب قائمة المراكز التعليمية مع دعم التصفية والـ Pagination',
  })
  @ApiResponse({ status: 200, description: 'تم جلب قائمة المراكز بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  findAll(
    @Query() query: CenterQueryDto,
  ): Promise<{ data: CenterListItem[]; meta: PaginationMeta }> {
    return this.centersService.findAll(query);
  }

  @Get('me')
  @ResponseMessage('تم جلب المركز بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  @ApiOperation({ summary: 'جلب بيانات المركز الخاص بالمستخدم الحالي المسجل' })
  @ApiResponse({ status: 200, description: 'تم استرجاع بيانات المركز بنجاح' })
  @ApiResponse({
    status: 400,
    description: 'المستخدم الحالي غير مرتبط بأي مركز',
  })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  getMyCenter(@CurrentUser() user: RequestUser): Promise<CenterDetails> {
    if (!user.centerId) {
      throw new BadRequestException('المستخدم الحالي غير مرتبط بأي مركز.');
    }
    return this.centersService.getMyCenter(user.centerId);
  }

  @Get('my-subscription')
  @ResponseMessage('تم جلب تفاصيل اشتراك المركز بنجاح.')
  @Roles(AppRole.OWNER)
  @ApiOperation({
    summary: 'جلب نظرة عامة وتفاصيل اشتراك المركز الحالي (خاص بالمالك)',
  })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل الاشتراك بنجاح' })
  @ApiResponse({
    status: 400,
    description: 'المستخدم الحالي غير مرتبط بأي مركز',
  })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا لمالك المركز (OWNER)',
  })
  getMySubscription(@CurrentUser() user: RequestUser) {
    if (!user.centerId) {
      throw new BadRequestException('المستخدم الحالي غير مرتبط بأي مركز.');
    }
    return this.centersService.getMySubscriptionOverview(user.centerId);
  }

  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'جلب تفاصيل مركز تعليمي محدد بواسطة المعرف ID' })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل المركز بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({ status: 404, description: 'المركز التعليمي غير موجود' })
  findOne(@Param('id') id: string): Promise<CenterDetails> {
    return this.centersService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('تم تحديث بيانات المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo'))
  @ApiOperation({
    summary: 'تحديث بيانات المركز التعليمي وتحديث الشعار اختياريًا',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'الحقول المراد تحديثها مع إمكانية رفع شعار جديد',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'سنتر الأوائل المطور' },
        slug: { type: 'string', example: 'el-awael-updated' },
        email: { type: 'string', example: 'new-email@elawael.com' },
        phone: { type: 'string', example: '01099998888' },
        description: { type: 'string' },
        address: { type: 'string' },
        logo: {
          type: 'string',
          format: 'binary',
          description: 'ملف الشعار الجديد',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'تم تحديث بيانات المركز بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات التحديث غير صالحة' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({ status: 404, description: 'المركز التعليمي غير موجود' })
  @ApiResponse({
    status: 409,
    description: 'البريد أو الهاتف أو الرابط (slug) مسجل مسبقاً',
  })
  update(
    @Param('id') id: string,
    @Body() updateCenterDto: UpdateCenterDto,
    @UploadedFile(ImageValidationPipe(false)) logo?: Express.Multer.File,
  ): Promise<CenterDetails> {
    return this.centersService.update(id, updateCenterDto, logo);
  }

  @Patch(':id/status')
  @ResponseMessage('تم تحديث حالة تفعيل المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'تعديل حالة تفعيل المركز (تفعيل / تعطيل)' })
  @ApiResponse({ status: 200, description: 'تم تحديث حالة التفعيل بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({ status: 404, description: 'المركز التعليمي غير موجود' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateCenterStatusDto: UpdateCenterStatusDto,
  ): Promise<CenterDetails> {
    return this.centersService.updateStatus(id, updateCenterStatusDto);
  }

  @Post(':id/subscribe')
  @ResponseMessage('تم الاشتراك في الباقة بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'اشتراك المركز في باقة جديدة أو استبدال الباقة' })
  @ApiResponse({ status: 200, description: 'تم الاشتراك في الباقة بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({ status: 404, description: 'المركز أو الباقة غير موجودة' })
  subscribe(
    @Param('id') id: string,
    @Body() subscribeCenterDto: SubscribeCenterDto,
  ): Promise<CenterDetails> {
    return this.centersService.subscribe(
      id,
      subscribeCenterDto.subscriptionPlanId,
      subscribeCenterDto.price,
    );
  }

  @Post(':id/renew')
  @ResponseMessage('تم تجديد اشتراك المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'تجديد اشتراك المركز لعدد معين من الشهور' })
  @ApiResponse({ status: 200, description: 'تم تجديد اشتراك المركز بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({ status: 404, description: 'المركز أو الاشتراك غير موجود' })
  renew(
    @Param('id') id: string,
    @Body() renewSubscriptionDto: RenewSubscriptionDto,
  ): Promise<CenterDetails> {
    return this.centersService.renew(id, renewSubscriptionDto);
  }
}
