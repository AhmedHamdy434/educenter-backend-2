import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { CentersService } from './centers.service';
import { CreateCenterDto } from './dto/create-center.dto';
import { UpdateCenterDto } from './dto/update-center.dto';
import { CenterQueryDto } from './dto/get-centers.dto';
import { UpdateCenterStatusDto } from './dto/update-center-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AppRole } from '../../common/enums/app-role.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageValidationPipe } from '../../shared/cloudinary/pipes/image-validation.pipe';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';

import { SubscribeCenterDto } from './dto/subscribe-center.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { CenterDetails, CenterListItem } from './constants/center.select';
import { PaginationMeta } from '../../common/utils/buildMeta';

@Controller('centers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CentersController {
  constructor(private readonly centersService: CentersService) {}

  @Post()
  @ResponseMessage('تم إنشاء المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo'))
  create(
    @Body() createCenterDto: CreateCenterDto,
    @UploadedFile(ImageValidationPipe(false)) logo?: Express.Multer.File,
  ): Promise<CenterDetails> {
    return this.centersService.create(createCenterDto, logo);
  }

  @Get()
  @ResponseMessage('تم جلب المراكز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  findAll(
    @Query() query: CenterQueryDto,
  ): Promise<{ data: CenterListItem[]; meta: PaginationMeta }> {
    return this.centersService.findAll(query);
  }

  @Get('me')
  @ResponseMessage('تم جلب المركز بنجاح.')
  @Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)
  getMyCenter(@CurrentUser() user: RequestUser): Promise<CenterDetails> {
    if (!user.centerId) {
      throw new BadRequestException('المستخدم الحالي غير مرتبط بأي مركز.');
    }
    return this.centersService.getMyCenter(user.centerId);
  }

  @Get('my-subscription')
  @ResponseMessage('تم جلب تفاصيل اشتراك المركز بنجاح.')
  @Roles(AppRole.OWNER)
  getMySubscription(@CurrentUser() user: RequestUser) {
    if (!user.centerId) {
      throw new BadRequestException('المستخدم الحالي غير مرتبط بأي مركز.');
    }
    return this.centersService.getMySubscriptionOverview(user.centerId);
  }

  @Get(':id')
  @ResponseMessage('تم جلب تفاصيل المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  findOne(@Param('id') id: string): Promise<CenterDetails> {
    return this.centersService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('تم تحديث بيانات المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo'))
  update(
    @Param('id') id: string,
    @Body() updateCenterDto: UpdateCenterDto,
    @UploadedFile(ImageValidationPipe(false)) logo?: Express.Multer.File,
  ): Promise<CenterDetails> {
    return this.centersService.update(id, updateCenterDto, logo);
  }

  @Patch(':id/status')
  @ResponseMessage('تم تحديث حالة تفعيل المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body() updateCenterStatusDto: UpdateCenterStatusDto,
  ): Promise<CenterDetails> {
    return this.centersService.updateStatus(id, updateCenterStatusDto);
  }

  @Post(':id/subscribe')
  @ResponseMessage('تم الاشتراك في الباقة بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  subscribe(
    @Param('id') id: string,
    @Body() subscribeCenterDto: SubscribeCenterDto,
  ): Promise<CenterDetails> {
    return this.centersService.subscribe(
      id,
      subscribeCenterDto.subscriptionPlanId,
      subscribeCenterDto.price,
    );
  }

  @Post(':id/renew')
  @ResponseMessage('تم تجديد اشتراك المركز بنجاح.')
  @Roles(AppRole.SUPER_ADMIN)
  renew(
    @Param('id') id: string,
    @Body() renewSubscriptionDto: RenewSubscriptionDto,
  ): Promise<CenterDetails> {
    return this.centersService.renew(id, renewSubscriptionDto);
  }
}
