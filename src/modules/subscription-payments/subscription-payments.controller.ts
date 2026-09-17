import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { SubscriptionPaymentsService } from './subscription-payments.service';
import { GetSubscriptionPaymentsDto } from './dto/get-subscription-payments.dto';
import { SubscriptionPaymentSummaryDto } from './dto/subscription-payment-summary.dto';
import {
  SubscriptionPaymentListItem,
  SubscriptionRevenueSummary,
} from './constants/subscription-payment.select';
import { PaginationMeta } from '../../common/utils/buildMeta';

@ApiTags('Subscription Payments')
@ApiBearerAuth('JWT-auth')
@Controller('subscription-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class SubscriptionPaymentsController {
  constructor(
    private readonly subscriptionPaymentsService: SubscriptionPaymentsService,
  ) {}

  @Get('summary')
  @ResponseMessage('تم جلب ملخص أرباح الاشتراكات بنجاح.')
  @ApiOperation({
    summary:
      'جلب ملخص إجمالي أرباح اشتراكات المراكز وتوزيعها شهرياً (خاص بالمدير العام)',
  })
  @ApiResponse({ status: 200, description: 'تم جلب ملخص الإيرادات بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({ status: 403, description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)' })
  async getSummary(
    @Query() query: SubscriptionPaymentSummaryDto,
  ): Promise<SubscriptionRevenueSummary> {
    return this.subscriptionPaymentsService.getSummary(query);
  }

  @Get()
  @ResponseMessage('تم جلب سجل دفعات الاشتراكات بنجاح.')
  @ApiOperation({
    summary:
      'جلب سجل كامل لدفعات اشتراكات المراكز للمنصة مع التصفية والصفحات',
  })
  @ApiResponse({ status: 200, description: 'تم جلب سجل الدفعات بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({ status: 403, description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)' })
  async findAll(
    @Query() query: GetSubscriptionPaymentsDto,
  ): Promise<{ data: SubscriptionPaymentListItem[]; meta: PaginationMeta }> {
    return this.subscriptionPaymentsService.findAll(query);
  }
}
