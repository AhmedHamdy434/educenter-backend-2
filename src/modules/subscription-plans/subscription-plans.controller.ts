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
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { SubscriptionPlanQueryDto } from './dto/get-subscription-plans.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansService } from './subscription-plans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';

@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {}

  /**
   * إنشاء باقة اشتراك جديدة.
   */
  @Post()
  @ResponseMessage('تم إنشاء باقة الاشتراك بنجاح.')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.SUPER_ADMIN)
  create(@Body() createSubscriptionPlanDto: CreateSubscriptionPlanDto) {
    return this.subscriptionPlansService.create(createSubscriptionPlanDto);
  }

  /**
   * جلب قائمة باقات الاشتراك مع الفلترة والصفحات.
   * // TODO: Protect with SuperAdminGuard
   */
  @Get()
  @ResponseMessage('تم جلب باقات الاشتراك بنجاح.')
  findAll(@Query() query: SubscriptionPlanQueryDto) {
    return this.subscriptionPlansService.findAll(query);
  }

  /**
   * جلب تفاصيل باقة اشتراك محددة.
   * // TODO: Protect with SuperAdminGuard
   */
  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل باقة الاشتراك بنجاح.')
  findOne(@Param('id') id: string) {
    return this.subscriptionPlansService.findOne(id);
  }

  /**
   * تحديث بيانات أو حالة باقة اشتراك محددة.
   * // TODO: Protect with SuperAdminGuard
   */
  @Patch(':id')
  @ResponseMessage('تم تحديث باقة الاشتراك بنجاح.')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.SUPER_ADMIN)
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
  toggleStatus(@Param('id') id: string) {
    return this.subscriptionPlansService.toggleStatus(id);
  }
}
