import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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

@Controller('subscription-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class SubscriptionPaymentsController {
  constructor(
    private readonly subscriptionPaymentsService: SubscriptionPaymentsService,
  ) {}

  /**
   * جلب ملخص أرباح الاشتراكات مقسمة شهرياً.
   */
  @Get('summary')
  @ResponseMessage('تم جلب ملخص أرباح الاشتراكات بنجاح.')
  async getSummary(
    @Query() query: SubscriptionPaymentSummaryDto,
  ): Promise<SubscriptionRevenueSummary> {
    return this.subscriptionPaymentsService.getSummary(query);
  }

  /**
   * جلب كل دفعات الاشتراكات للمنصة (للمدير العام).
   */
  @Get()
  @ResponseMessage('تم جلب سجل دفعات الاشتراكات بنجاح.')
  async findAll(
    @Query() query: GetSubscriptionPaymentsDto,
  ): Promise<{ data: SubscriptionPaymentListItem[]; meta: PaginationMeta }> {
    return this.subscriptionPaymentsService.findAll(query);
  }
}
