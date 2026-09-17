import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupQueryDto } from './dto/get-groups.dto';
import { GroupStudentsDto } from './dto/group-students.dto';
import { GroupDetails, GroupListItem } from './constants/group.select';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('تم إنشاء المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  create(
    @CurrentUser() user: RequestUser,
    @Body() createGroupDto: CreateGroupDto,
  ): Promise<GroupDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.groupsService.create(user.centerId, createGroupDto);
  }

  @Get()
  @ResponseMessage('تم جلب المجموعات الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: GroupQueryDto,
  ): Promise<{ data: GroupListItem[]; meta: any }> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.groupsService.findAll(user.centerId, query, user.role, user.id);
  }

  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<GroupDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.groupsService.findOne(user.centerId, id, user.role, user.id);
  }

  @Patch(':id')
  @ResponseMessage('تم تحديث المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<GroupDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.groupsService.update(user.centerId, id, updateGroupDto);
  }

  @Patch(':id/toggle-status')
  @ResponseMessage('تم تحديث حالة تفعيل المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  toggleStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<GroupDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.groupsService.toggleStatus(user.centerId, id);
  }

  @Post(':id/students')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('تم إضافة الطلاب للمجموعة بنجاح.')
  @Roles(AppRole.OWNER)
  addStudents(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() groupStudentsDto: GroupStudentsDto,
  ): Promise<GroupDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.groupsService.addStudents(user.centerId, id, groupStudentsDto);
  }

  @Delete(':id/students')
  @ResponseMessage('تم إزالة الطلاب من المجموعة بنجاح.')
  @Roles(AppRole.OWNER)
  removeStudents(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() groupStudentsDto: GroupStudentsDto,
  ): Promise<GroupDetails> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.groupsService.removeStudents(
      user.centerId,
      id,
      groupStudentsDto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ResponseMessage('تم حذف المجموعة الدراسية بنجاح.')
  @Roles(AppRole.OWNER)
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    if (!user.centerId) {
      throw new BadRequestException(
        'المستخدم الحالي غير مرتبط بأي مركز تعليمي.',
      );
    }
    return this.groupsService.remove(user.centerId, id);
  }
}
