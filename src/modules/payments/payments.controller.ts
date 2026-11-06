import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  HttpStatus,
  HttpCode,
  Res,
  Query,
} from '@nestjs/common';
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
import { PaymentsService } from './payments.service';
import { PayMonthDto } from './dto/pay-month.dto';
import { GetGroupPaymentsQueryDto } from './dto/get-group-payments.dto';
import {
  StudentPaymentItem,
  GroupPaymentStudentItem,
  GroupPaymentStats,
  StudentPaymentsSummaryData,
  PayMonthResponse,
} from './interfaces/payment.interface';
import { PaginationMeta } from '../../common/utils/buildMeta';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * تصدير كشف مصفوفة مدفوعات المجموعة إلى ملف Excel.
   */
  @Get('groups/:groupId/payments/export/excel')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportGroupPayments(
    @CurrentCenterId() centerId: string,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.paymentsService.exportGroupPaymentsToExcel(
      centerId,
      groupId,
    );
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="group-payments-${groupId}-${dateStr}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get('groups/:groupId/payments')
  @ResponseMessage('تم جلب مدفوعات المجموعة بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async getGroupPayments(
    @CurrentCenterId() centerId: string,
    @Param('groupId') groupId: string,
    @Query() query: GetGroupPaymentsQueryDto,
  ): Promise<{
    data: GroupPaymentStudentItem[];
    meta: PaginationMeta;
    stats: GroupPaymentStats;
  }> {
    return this.paymentsService.getGroupPayments(centerId, groupId, query);
  }

  @Post('group-students/:groupStudentId/payments')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم تسجيل دفع الاشتراك بنجاح.')
  @Roles(AppRole.OWNER)
  async payMonth(
    @CurrentCenterId() centerId: string,
    @Param('groupStudentId') groupStudentId: string,
    @Body() dto: PayMonthDto,
  ): Promise<PayMonthResponse> {
    const payment = await this.paymentsService.payMonth(
      centerId,
      groupStudentId,
      dto,
    );
    return payment;
  }

  @Get([
    'payments/students/:studentId/summary',
    'students/:studentId/payments/summary',
  ])
  @ResponseMessage('تم جلب ملخص مدفوعات الطالب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  async getStudentPaymentsSummary(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('studentId') studentId: string,
    @Query('groupId') groupId?: string,
  ): Promise<StudentPaymentsSummaryData> {
    return this.paymentsService.getStudentPaymentsSummary(
      centerId,
      studentId,
      user.role,
      user.id,
      groupId,
    );
  }

  @Get('students/:studentId/payments')
  @ResponseMessage('تم جلب سجل مدفوعات الطالب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  async getStudentPayments(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('studentId') studentId: string,
    @Query('groupId') groupId?: string,
  ): Promise<StudentPaymentItem[]> {
    const data = await this.paymentsService.getStudentPayments(
      centerId,
      studentId,
      user.role,
      user.id,
      groupId,
    );
    return data;
  }

  /**
   * تصدير كشف حساب مدفوعات طالب محدد إلى ملف Excel.
   */
  @Get('students/:studentId/payments/export/excel')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  @BypassInterceptor()
  async exportStudentPayments(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('studentId') studentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.paymentsService.exportStudentPaymentsToExcel(
      centerId,
      studentId,
      user.role,
      user.id,
    );
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="student-payments-${studentId}-${dateStr}.xlsx"`,
    );
    res.send(buffer);
  }
}
