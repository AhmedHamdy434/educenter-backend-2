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
import { CreateSubscriptionPaymentDto } from './dto/create-subscription-payment.dto';
import { GetSubscriptionPaymentsDto } from './dto/get-subscription-payments.dto';
import { SubscriptionPaymentListItem } from './constants/subscription-payment.select';
import { PaginationMeta } from '../../common/utils/buildMeta';

@ApiTags('Subscription Payments')
@ApiBearerAuth('JWT-auth')
@Controller('centers/:centerId/subscription-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class CenterSubscriptionPaymentsController {
  constructor(
    private readonly subscriptionPaymentsService: SubscriptionPaymentsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم تسجيل دفعة الاشتراك بنجاح.')
  @ApiOperation({
    summary:
      'تسجيل دفعة اشتراك جديدة لمركز تعليمي يدوياً وربطها باشتراك المركز',
  })
  @ApiResponse({ status: 201, description: 'تم تسجيل دفعة الاشتراك بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات الطلب غير صالحة أو الاشتراك لا ينتمي للمركز' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({ status: 403, description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)' })
  @ApiResponse({ status: 404, description: 'المركز التعليمي غير موجود' })
  async create(
    @Param('centerId') centerId: string,
    @Body() dto: CreateSubscriptionPaymentDto,
  ): Promise<SubscriptionPaymentListItem> {
    return this.subscriptionPaymentsService.create(centerId, dto);
  }

  @Get()
  @ResponseMessage('تم جلب دفعات اشتراك المركز بنجاح.')
  @ApiOperation({
    summary:
      'جلب سجل دفعات اشتراك مركز معين مع دعم الفلترة بالتاريخ والصفحات',
  })
  @ApiResponse({ status: 200, description: 'تم جلب سجل دفعات اشتراك المركز بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({ status: 403, description: 'غير مسموح إلا للمدير العام (SUPER_ADMIN)' })
  @ApiResponse({ status: 404, description: 'المركز التعليمي غير موجود' })
  async findByCenter(
    @Param('centerId') centerId: string,
    @Query() query: GetSubscriptionPaymentsDto,
  ): Promise<{ data: SubscriptionPaymentListItem[]; meta: PaginationMeta }> {
    return this.subscriptionPaymentsService.findByCenter(centerId, query);
  }
}
