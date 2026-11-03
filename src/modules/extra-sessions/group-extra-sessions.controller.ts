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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentCenterId } from '../../common/decorators/current-center-id.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ExtraSessionsService } from './extra-sessions.service';
import { CreateExtraSessionDto } from './dto/create-extra-session.dto';
import { GetExtraSessionsDto } from './dto/get-extra-sessions.dto';

@Controller('groups/:groupId/extra-sessions')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class GroupExtraSessionsController {
  constructor(private readonly extraSessionsService: ExtraSessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إنشاء الحصة الإضافية بنجاح.')
  async create(
    @CurrentCenterId() centerId: string,
    @Param('groupId') groupId: string,
    @Body() dto: CreateExtraSessionDto,
  ) {
    return this.extraSessionsService.create(centerId, groupId, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم جلب قائمة الحصص الإضافية للمجموعة بنجاح.')
  async findAllForGroup(
    @CurrentCenterId() centerId: string,
    @Param('groupId') groupId: string,
    @Query() query: GetExtraSessionsDto,
  ) {
    return this.extraSessionsService.findAllForGroup(centerId, groupId, query);
  }
}
