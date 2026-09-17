import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import { subscriptionPlanSelect } from './constants/subscription-plan.select';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { SubscriptionPlanQueryDto } from './dto/get-subscription-plans.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

@Injectable()
export class SubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * إنشاء باقة اشتراك جديدة مع التحقق من عدم تكرار الاسم.
   */
  async create(data: CreateSubscriptionPlanDto) {
    const existingPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { name: data.name },
    });

    if (existingPlan) {
      throw new ConflictException('اسم باقة الاشتراك مستخدم بالفعل.');
    }

    return this.prisma.subscriptionPlan.create({
      data: {
        ...data,
        price: new Prisma.Decimal(data.price),
      },
      select: subscriptionPlanSelect,
    });
  }

  /**
   * جلب قائمة باقات الاشتراك مع دعم البحث، التصفية بالحالة، والـ Pagination الموحد.
   */
  async findAll(query: SubscriptionPlanQueryDto) {
    const { skip, take, active, popular } = query;
    const where = query.getWhere<Prisma.SubscriptionPlanWhereInput>([
      'name',
      'description',
    ]);

    if (active !== undefined) {
      where.isActive = active;
    }

    if (popular !== undefined) {
      where.isPopular = popular;
    }

    const [total, data] = await Promise.all([
      this.prisma.subscriptionPlan.count({ where }),
      this.prisma.subscriptionPlan.findMany({
        where,
        skip,
        take,
        select: subscriptionPlanSelect,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }

  /**
   * جلب تفاصيل باقة اشتراك معينة عن طريق المعرف الفريد.
   */
  async findOne(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      select: subscriptionPlanSelect,
    });

    if (!plan) {
      throw new NotFoundException('باقة الاشتراك المطلوبة غير موجودة.');
    }

    return plan;
  }

  /**
   * تحديث بيانات باقة اشتراك مع التحقق من الاسم الجديد إن تم تغييره.
   */
  async update(id: string, data: UpdateSubscriptionPlanDto) {
    const currentPlan = await this.findOne(id);

    if (data.name && data.name !== currentPlan.name) {
      const existingName = await this.prisma.subscriptionPlan.findUnique({
        where: { name: data.name },
      });

      if (existingName) {
        throw new ConflictException('اسم باقة الاشتراك الجديد مستخدم بالفعل.');
      }
    }

    const updateData: Prisma.SubscriptionPlanUpdateInput = {
      ...data,
      price:
        data.price !== undefined ? new Prisma.Decimal(data.price) : undefined,
    };

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: updateData,
      select: subscriptionPlanSelect,
    });
  }

  /**
   * تبديل حالة تفعيل باقة اشتراك محددة (تفعيل/إلغاء تفعيل).
   */
  async toggleStatus(id: string) {
    const currentPlan = await this.findOne(id);

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: !currentPlan.isActive },
      select: subscriptionPlanSelect,
    });
  }
}
