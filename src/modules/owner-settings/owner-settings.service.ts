import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UpdateCenterSettingsDto } from './dto/update-center-settings.dto';
import { Prisma } from '@prisma/client';
import { CenterSettingsResponse } from './interfaces/owner-settings.interface';

@Injectable()
export class OwnerSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * جلب إعدادات المركز الحالية (أو تهيئتها بالنسب الافتراضية 20% مركز / 80% معلم إن لم تكن موجودة)
   */
  async getSettings(centerId: string): Promise<CenterSettingsResponse> {
    let settings = await this.prisma.centerSettings.findUnique({
      where: { centerId },
    });

    if (!settings) {
      settings = await this.prisma.centerSettings.create({
        data: {
          centerId,
          centerSharePercentage: new Prisma.Decimal(20.0),
          teacherSharePercentage: new Prisma.Decimal(80.0),
          allowStudentCreditAdvance: true,
          currency: 'EGP',
        },
      });
    }

    return settings;
  }

  /**
   * تحديث إعدادات المركز مع التحقق المالي الصارم من أن مجموع النسب = 100%
   */
  async updateSettings(
    centerId: string,
    dto: UpdateCenterSettingsDto,
  ): Promise<CenterSettingsResponse> {
    const centerShare = new Prisma.Decimal(dto.centerSharePercentage);
    const teacherShare = new Prisma.Decimal(dto.teacherSharePercentage);

    const total = centerShare.plus(teacherShare);
    if (!total.equals(new Prisma.Decimal(100.0))) {
      throw new BadRequestException(
        'مجموع نسبة المركز ونسبة المعلم يجب أن يساوي 100% بالضبط.',
      );
    }

    const settings = await this.prisma.centerSettings.upsert({
      where: { centerId },
      create: {
        centerId,
        centerSharePercentage: centerShare,
        teacherSharePercentage: teacherShare,
        allowStudentCreditAdvance: dto.allowStudentCreditAdvance ?? true,
        currency: dto.currency ?? 'EGP',
        receiptNotes: dto.receiptNotes,
      },
      update: {
        centerSharePercentage: centerShare,
        teacherSharePercentage: teacherShare,
        ...(dto.allowStudentCreditAdvance !== undefined && {
          allowStudentCreditAdvance: dto.allowStudentCreditAdvance,
        }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.receiptNotes !== undefined && {
          receiptNotes: dto.receiptNotes,
        }),
      },
    });

    return settings;
  }
}
