import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums/app-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { UsersService } from './users.service';
import { UserQueryDto } from './dto/get-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDetails, UserListItem } from './constants/user.select';
import { PaginationMeta } from '../../common/utils/buildMeta';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * جلب قائمة مستخدمي المركز مع دعم التصفية والـ Pagination.
   */
  @Get()
  @ResponseMessage('تم جلب قائمة المستخدمين بنجاح.')
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: UserQueryDto,
  ): Promise<{ data: UserListItem[]; meta: PaginationMeta }> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.usersService.findAll(user.centerId, query);
  }

  /**
   * جلب بيانات مستخدم محدد داخل المركز.
   */
  @Get(':id')
  @ResponseMessage('تم استرجاع بيانات المستخدم بنجاح.')
  async findOne(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<UserDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.usersService.findOne(user.centerId, id);
  }

  /**
   * تحديث بيانات مستخدم أو تغيير حالته داخل المركز.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم تحديث بيانات المستخدم بنجاح.')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.usersService.update(user.centerId, id, dto);
  }
}
