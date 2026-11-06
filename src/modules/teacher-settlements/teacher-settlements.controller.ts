import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import {
  BypassInterceptor,
  ResponseMessage,
} from '../../common/decorators/response-message.decorator';
import { TeacherSettlementsService } from './teacher-settlements.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { GetSettlementsDto } from './dto/get-settlements.dto';
import { GetTeachersOverviewDto } from './dto/get-teachers-overview.dto';
import { CancelSettlementDto } from './dto/cancel-settlement.dto';
import { CreateRefundDto } from './dto/create-refund.dto';

@Controller('owner/settlements')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class TeacherSettlementsController {
  constructor(private readonly settlementsService: TeacherSettlementsService) {}

  @Get('teachers-overview')
  @ResponseMessage('تم جلب النظرة المالية لمستحقات المعلمين بنجاح.')
  async getTeachersFinancialOverview(
    @CurrentCenterId() centerId: string,
    @Query() query: GetTeachersOverviewDto,
  ) {
    return this.settlementsService.getTeachersFinancialOverview(
      centerId,
      query,
    );
  }

  @Get('teachers/:teacherId/unsettled')
  @ResponseMessage('تم جلب بنود المستحقات غير المسواة بنجاح.')
  async getTeacherUnsettledEarnings(
    @CurrentCenterId() centerId: string,
    @Param('teacherId') teacherId: string,
  ) {
    return this.settlementsService.getTeacherUnsettledEarnings(
      centerId,
      teacherId,
    );
  }

  @Get('export/excel')
  @BypassInterceptor()
  async exportSettlementsToExcel(
    @CurrentCenterId() centerId: string,
    @Query() query: GetSettlementsDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.settlementsService.exportSettlementsToExcel(
      centerId,
      query,
    );
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="teacher-settlements-${dateStr}.xlsx"`,
    );
    res.send(buffer);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إنشاء التسوية المالية بنجاح.')
  async createSettlement(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.settlementsService.createSettlement(centerId, user.id, dto);
  }

  @Get()
  @ResponseMessage('تم جلب سجل التسويات المالية بنجاح.')
  async getSettlements(
    @CurrentCenterId() centerId: string,
    @Query() query: GetSettlementsDto,
  ) {
    return this.settlementsService.getSettlements(centerId, query);
  }

  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل التسوية بنجاح.')
  async getSettlementById(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ) {
    return this.settlementsService.getSettlementById(centerId, id);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم تأكيد وصرف التسوية بنجاح.')
  async completeSettlement(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
  ) {
    return this.settlementsService.completeSettlement(centerId, id);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم إلغاء التسوية المعلقة بنجاح.')
  async cancelSettlement(
    @CurrentCenterId() centerId: string,
    @Param('id') id: string,
    @Body() dto: CancelSettlementDto,
  ) {
    return this.settlementsService.cancelSettlement(centerId, id, dto);
  }

  @Post('refunds')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم تسجيل الاسترداد المالي وتسوية المستحقات بنجاح.')
  async createRefund(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateRefundDto,
  ) {
    return this.settlementsService.createRefund(centerId, user.id, dto);
  }
}
