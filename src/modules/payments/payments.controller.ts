import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  BadRequestException,
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
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { PaymentsService } from './payments.service';
import { PayMonthDto } from './dto/pay-month.dto';
import { GetGroupPaymentsQueryDto } from './dto/get-group-payments.dto';
import {
  StudentPaymentItem,
  GroupPaymentStudentItem,
  GroupPaymentStats,
} from './constants/payment.select';
import { PaginationMeta } from '../../common/utils/buildMeta';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  private validateCenterId(centerId?: string | null): string {
    if (!centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return centerId;
  }

  /**
   * تصدير كشف مصفوفة مدفوعات المجموعة إلى ملف Excel.
   */
  @Get('groups/:groupId/payments/export/excel')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  @BypassInterceptor()
  async exportGroupPayments(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const centerId = this.validateCenterId(user.centerId);
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
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Query() query: GetGroupPaymentsQueryDto,
  ): Promise<{
    data: GroupPaymentStudentItem[];
    meta: PaginationMeta;
    stats: GroupPaymentStats;
  }> {
    const centerId = this.validateCenterId(user.centerId);
    return this.paymentsService.getGroupPayments(centerId, groupId, query);
  }

  @Post('group-students/:groupStudentId/payments')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم تسجيل دفع الاشتراك بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async payMonth(
    @CurrentUser() user: RequestUser,
    @Param('groupStudentId') groupStudentId: string,
    @Body() dto: PayMonthDto,
  ) {
    const centerId = this.validateCenterId(user.centerId);
    const payment = await this.paymentsService.payMonth(
      centerId,
      groupStudentId,
      dto,
    );
    return payment;
  }

  @Get('students/:studentId/payments')
  @ResponseMessage('تم جلب سجل مدفوعات الطالب بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  async getStudentPayments(
    @CurrentUser() user: RequestUser,
    @Param('studentId') studentId: string,
    @Query('groupId') groupId?: string,
  ): Promise<StudentPaymentItem[]> {
    const centerId = this.validateCenterId(user.centerId);
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
    @CurrentUser() user: RequestUser,
    @Param('studentId') studentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const centerId = this.validateCenterId(user.centerId);
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
