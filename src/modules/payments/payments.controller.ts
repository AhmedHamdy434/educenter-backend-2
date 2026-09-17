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
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { PaymentsService } from './payments.service';
import { PayMonthDto } from './dto/pay-month.dto';

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

  @Get('groups/:groupId/payments')
  @ResponseMessage('تم جلب مدفوعات المجموعة بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER)
  async getGroupPayments(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
  ) {
    const centerId = this.validateCenterId(user.centerId);
    const data = await this.paymentsService.getGroupPayments(centerId, groupId);
    return data;
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
  ) {
    const centerId = this.validateCenterId(user.centerId);
    const data = await this.paymentsService.getStudentPayments(
      centerId,
      studentId,
      user.role,
      user.id,
    );
    return data;
  }
}
