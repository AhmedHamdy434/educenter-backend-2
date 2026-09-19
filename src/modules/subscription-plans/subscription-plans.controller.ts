import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { SubscriptionPlanQueryDto } from './dto/get-subscription-plans.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansService } from './subscription-plans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';

@ApiTags('Subscription Plans')
@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {}

  @Post()
  @ResponseMessage('تم إنشاء باقة الاشتراك بنجاح.')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'إنشاء باقة اشتراك جديدة للمنصة' })
  @ApiResponse({ status: 201, description: 'تم إنشاء باقة الاشتراك بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({ status: 409, description: 'اسم الباقة مسجل مسبقاً' })
  create(@Body() createSubscriptionPlanDto: CreateSubscriptionPlanDto) {
    return this.subscriptionPlansService.create(createSubscriptionPlanDto);
  }

  @Get()
  @ResponseMessage('تم جلب باقات الاشتراك بنجاح.')
  @ApiOperation({
    summary: 'جلب قائمة باقات الاشتراك مع دعم التصفية والصفحات (متاحة للعامة)',
  })
  @ApiResponse({ status: 200, description: 'تم جلب باقات الاشتراك بنجاح' })
  findAll(@Query() query: SubscriptionPlanQueryDto) {
    return this.subscriptionPlansService.findAll(query);
  }

  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل باقة الاشتراك بنجاح.')
  @ApiOperation({ summary: 'جلب تفاصيل باقة اشتراك محددة بواسطة المعرف ID' })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل الباقة بنجاح' })
  @ApiResponse({ status: 404, description: 'باقة الاشتراك غير موجودة' })
  findOne(@Param('id') id: string) {
    return this.subscriptionPlansService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('تم تحديث باقة الاشتراك بنجاح.')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'تحديث بيانات باقة اشتراك محددة' })
  @ApiResponse({ status: 200, description: 'تم تحديث باقة الاشتراك بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({ status: 404, description: 'باقة الاشتراك غير موجودة' })
  @ApiResponse({ status: 409, description: 'اسم الباقة مستخدم بالفعل' })
  update(
    @Param('id') id: string,
    @Body() updateSubscriptionPlanDto: UpdateSubscriptionPlanDto,
  ) {
    return this.subscriptionPlansService.update(id, updateSubscriptionPlanDto);
  }

  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل الباقة بنجاح.')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'تغيير حالة تفعيل باقة الاشتراك (تفعيل / تعطيل)' })
  @ApiResponse({ status: 200, description: 'تم تحديث حالة تفعيل الباقة بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)',
  })
  @ApiResponse({ status: 404, description: 'باقة الاشتراك غير موجودة' })
  toggleStatus(@Param('id') id: string) {
    return this.subscriptionPlansService.toggleStatus(id);
  }
}
