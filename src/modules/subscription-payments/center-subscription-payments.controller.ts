import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { SubscriptionPaymentsService } from './subscription-payments.service';
import { CreateSubscriptionPaymentDto } from './dto/create-subscription-payment.dto';
import { GetSubscriptionPaymentsDto } from './dto/get-subscription-payments.dto';
import { SubscriptionPaymentListItem } from './constants/subscription-payment.select';
import { PaginationMeta } from '../../common/utils/buildMeta';

@Controller('centers/:centerId/subscription-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class CenterSubscriptionPaymentsController {
  constructor(
    private readonly subscriptionPaymentsService: SubscriptionPaymentsService,
  ) {}

  /**
   * إنشاء دفعة اشتراك جديدة لمركز تعليمي يدويًا.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم تسجيل دفعة الاشتراك بنجاح.')
  async create(
    @Param('centerId') centerId: string,
    @Body() dto: CreateSubscriptionPaymentDto,
  ): Promise<SubscriptionPaymentListItem> {
    return this.subscriptionPaymentsService.create(centerId, dto);
  }

  /**
   * جلب دفعات اشتراك مركز معين.
   */
  @Get()
  @ResponseMessage('تم جلب دفعات اشتراك المركز بنجاح.')
  async findByCenter(
    @Param('centerId') centerId: string,
    @Query() query: GetSubscriptionPaymentsDto,
  ): Promise<{ data: SubscriptionPaymentListItem[]; meta: PaginationMeta }> {
    return this.subscriptionPaymentsService.findByCenter(centerId, query);
  }
}
