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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(AppRole.OWNER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ResponseMessage('تم جلب قائمة المستخدمين بنجاح.')
  @ApiOperation({
    summary:
      'جلب قائمة مستخدمي المركز مع دعم التصفية بالدور وحالة التفعيل والـ Pagination (خاص بمالك المركز)',
  })
  @ApiResponse({ status: 200, description: 'تم جلب قائمة المستخدمين بنجاح' })
  @ApiResponse({
    status: 400,
    description: 'المستخدم الحالي غير مرتبط بأي مركز تعليمي',
  })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا لمالك المركز (OWNER) أو اشتراك المركز منتهي',
  })
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

  @Get(':id')
  @ResponseMessage('تم استرجاع بيانات المستخدم بنجاح.')
  @ApiOperation({
    summary:
      'جلب بيانات مستخدم محدد داخل المركز بواسطة المعرف ID (خاص بمالك المركز)',
  })
  @ApiResponse({ status: 200, description: 'تم استرجاع بيانات المستخدم بنجاح' })
  @ApiResponse({
    status: 400,
    description: 'المستخدم الحالي غير مرتبط بأي مركز تعليمي',
  })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا لمالك المركز (OWNER)',
  })
  @ApiResponse({
    status: 404,
    description: 'المستخدم غير موجود داخل هذا المركز',
  })
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

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم تحديث بيانات المستخدم بنجاح.')
  @ApiOperation({
    summary:
      'تحديث بيانات مستخدم داخل المركز أو تغيير حالته وكلمة مروره (خاص بمالك المركز)',
  })
  @ApiResponse({ status: 200, description: 'تم تحديث بيانات المستخدم بنجاح' })
  @ApiResponse({
    status: 400,
    description: 'بيانات التحديث غير صالحة أو غير مرتبط بمركز',
  })
  @ApiResponse({ status: 401, description: 'غير مصرح بالدخول' })
  @ApiResponse({
    status: 403,
    description: 'غير مسموح إلا لمالك المركز (OWNER) أو اشتراك المركز منتهي',
  })
  @ApiResponse({
    status: 404,
    description: 'المستخدم غير موجود داخل هذا المركز',
  })
  @ApiResponse({
    status: 409,
    description: 'البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل',
  })
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
