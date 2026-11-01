import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { ExtraSessionsService } from './extra-sessions.service';
import { CreateExtraSessionDto } from './dto/create-extra-session.dto';
import { GetExtraSessionsDto } from './dto/get-extra-sessions.dto';

@ApiTags('Extra Sessions')
@ApiBearerAuth()
@Controller('groups/:groupId/extra-sessions')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class GroupExtraSessionsController {
  constructor(private readonly extraSessionsService: ExtraSessionsService) {}

  @Post()
  @ApiOperation({
    summary:
      'إنشاء حصة إضافية جديدة لمجموعة محددة مع فحص التعارضات وفتح جلسة الحضور',
  })
  @ResponseMessage('تمت معالجة طلب إنشاء الحصة الإضافية بنجاح.')
  async create(
    @CurrentCenterId() centerId: string,
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateExtraSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.extraSessionsService.create(
      centerId,
      groupId,
      dto,
      user.id,
    );
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'استعراض الحصص الإضافية لمجموعة محددة مع التصفية والصفحات',
  })
  @ResponseMessage('تم جلب قائمة الحصص الإضافية للمجموعة بنجاح.')
  async findAllForGroup(
    @CurrentCenterId() centerId: string,
    @Param('groupId') groupId: string,
    @Query() query: GetExtraSessionsDto,
  ) {
    return this.extraSessionsService.findAllForGroup(centerId, groupId, query);
  }
}
