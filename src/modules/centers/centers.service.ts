import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta, PaginationMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import { hashPassword } from '../../common/utils/password.util';
import {
  centerDetailsSelect,
  centerListSelect,
  CenterDetails,
  CenterListItem,
} from './constants/center.select';
import { CreateCenterDto } from './dto/create-center.dto';
import { CenterQueryDto } from './dto/get-centers.dto';
import { UpdateCenterDto } from './dto/update-center.dto';
import { UpdateCenterStatusDto } from './dto/update-center-status.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import {
  getFirstDayOfMonth,
  getFirstDayOfNextMonth,
  getLastDayOfMonth,
} from '../../common/utils/date.util';
import { PlanType } from '../../common/enums/plan-type.enum';
import { CloudinaryService } from '../../shared/cloudinary/cloudinary.service';
import { UploadFolder } from '../../shared/cloudinary/enums/upload-folder.enum';

@Injectable()
export class CentersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    data: CreateCenterDto,
    logoFile?: Express.Multer.File,
  ): Promise<CenterDetails> {
    // 1. تشفير كلمة مرور المالك قبل بدء المعاملة
    const passwordHash = await hashPassword(data.ownerPassword);

    let logoUrl = data.logo;

    if (logoFile) {
      try {
        const uploadResult = await this.cloudinaryService.uploadImage(
          logoFile,
          UploadFolder.CENTERS,
        );
        logoUrl = uploadResult.secure_url;
      } catch {
        throw new BadRequestException('فشل رفع شعار المركز.');
      }
    }

    try {
      // 2. تنفيذ المعاملة لضمان التراجع الكامل في حال حدوث أي فشل
      return await this.prisma.$transaction(async (tx) => {
        // أ. جلب باقة الاشتراك والتحقق من صلاحيتها ونشاطها
        const plan = await this.getSubscriptionPlan(
          tx,
          data.subscriptionPlanId,
        );

        // ب. التحقق التوكيدي من تفرد الرابط البديل والبريد الإلكتروني للمركز والمالك
        await this.ensureSlugIsUnique(tx, data.slug);
        await this.ensureCenterEmailIsUnique(tx, data.email);
        await this.ensureOwnerEmailIsUnique(tx, data.ownerEmail);

        // ج. إنشاء المركز التعليمي
        const center = await tx.center.create({
          data: {
            name: data.name,
            slug: data.slug,
            email: data.email,
            phone: data.phone,
            description: data.description,
            logo: logoUrl,
            address: data.address,
          },
        });

        // د. إنشاء حساب مالك المركز (Role: OWNER) المرتبط بالمركز المنشأ
        await tx.user.create({
          data: {
            fullName: data.ownerFullName,
            email: data.ownerEmail,
            password: passwordHash,
            role: 'OWNER',
            centerId: center.id,
          },
        });

        // هـ. إنشاء الاشتراك الفعلي الأولي للمركز بالباقة المحددة (من أول الشهر إلى آخره)
        const startDate = getFirstDayOfMonth(data.startDate);
        const endDate = getLastDayOfMonth(
          startDate,
          plan.type === PlanType.MONTHLY ? 0 : 11,
        );
        const subscriptionPrice =
          data.customPrice !== undefined ? data.customPrice : plan.price;

        const initialSubscription = await tx.centerSubscription.create({
          data: {
            centerId: center.id,
            subscriptionPlanId: plan.id,
            customPrice: subscriptionPrice,
            startDate,
            endDate,
            status: 'ACTIVE',
          },
        });

        await tx.subscriptionPayment.create({
          data: {
            centerSubscriptionId: initialSubscription.id,
            centerId: center.id,
            paid: subscriptionPrice,
            periodStart: startDate,
            periodEnd: endDate,
            paymentMethod: 'system',
            notes:
              data.customPrice !== undefined
                ? `الاشتراك الأولي بسعر مخصص: ${subscriptionPrice.toString()}`
                : 'الاشتراك الأولي عند إنشاء المركز',
          },
        });

        // و. استرجاع تفاصيل المركز بالكامل مع المالك والاشتراك النشط
        const result = await tx.center.findUnique({
          where: { id: center.id },
          select: centerDetailsSelect,
        });

        if (!result) {
          throw new NotFoundException('فشل استرجاع بيانات المركز بعد الإنشاء.');
        }

        return result;
      });
    } catch (dbError) {
      if (logoFile && logoUrl) {
        await this.cloudinaryService.deleteFile(logoUrl).catch(() => {});
      }
      throw dbError;
    }
  }

  /**
   * جلب قائمة المراكز مع دعم البحث، التصفية بالحالة، والـ Pagination (قائمة مختصرة).
   */
  async findAll(
    query: CenterQueryDto,
  ): Promise<{ data: CenterListItem[]; meta: PaginationMeta }> {
    const { skip, take, active } = query;
    const where = query.getWhere<Prisma.CenterWhereInput>([
      'name',
      'slug',
      'email',
    ]);

    if (active !== undefined) {
      where.isActive = active;
    }

    const orderBy = query.getOrderBy<Prisma.CenterOrderByWithRelationInput>(
      ['name', 'slug', 'createdAt'],
      { createdAt: 'desc' },
    );

    const [total, data] = await Promise.all([
      this.prisma.center.count({ where }),
      this.prisma.center.findMany({
        where,
        skip,
        take,
        select: centerListSelect,
        orderBy,
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }

  /**
   * جلب تفاصيل مركز معين باستخدام المعرف الفريد (تفاصيل كاملة).
   */
  async findOne(id: string): Promise<CenterDetails> {
    const center = await this.prisma.center.findUnique({
      where: { id },
      select: centerDetailsSelect,
    });

    if (!center) {
      throw new NotFoundException('المركز المطلوب غير موجود.');
    }

    return center;
  }

  /**
   * تحديث بيانات مركز معين مع التحقق من عدم تكرار البريد الإلكتروني والـ Slug في حال تغييرهما.
   */
  async update(
    id: string,
    data: UpdateCenterDto,
    logoFile?: Express.Multer.File,
  ): Promise<CenterDetails> {
    const currentCenter = await this.findOne(id);

    if (data.slug && data.slug !== currentCenter.slug) {
      const existingSlug = await this.prisma.center.findUnique({
        where: { slug: data.slug },
      });

      if (existingSlug) {
        throw new ConflictException(
          'الرابط البديل (slug) الجديد للمركز مستخدم بالفعل.',
        );
      }
    }

    if (data.email && data.email !== currentCenter.email) {
      const existingEmail = await this.prisma.center.findUnique({
        where: { email: data.email },
      });

      if (existingEmail) {
        throw new ConflictException(
          'البريد الإلكتروني الجديد للمركز مستخدم بالفعل.',
        );
      }
    }

    let logoUrl = data.logo;
    const oldLogoUrl = currentCenter.logo;

    if (logoFile) {
      try {
        const uploadResult = await this.cloudinaryService.uploadImage(
          logoFile,
          UploadFolder.CENTERS,
        );
        logoUrl = uploadResult.secure_url;
      } catch {
        throw new BadRequestException('فشل رفع شعار المركز الجديد.');
      }
    }

    const centerUpdateData: Prisma.CenterUpdateInput = {
      name: data.name,
      slug: data.slug,
      email: data.email,
      phone: data.phone,
      description: data.description,
      logo: logoUrl,
      address: data.address,
    };

    try {
      const updatedCenter = await this.prisma.center.update({
        where: { id },
        data: centerUpdateData,
        select: centerDetailsSelect,
      });

      // If update was successful and a new logo was uploaded, delete the old logo from Cloudinary
      if (logoFile && oldLogoUrl) {
        await this.cloudinaryService.deleteFile(oldLogoUrl).catch(() => {});
      }

      return updatedCenter;
    } catch (dbError) {
      // Rollback newly uploaded file on DB error
      if (logoFile && logoUrl) {
        await this.cloudinaryService.deleteFile(logoUrl).catch(() => {});
      }
      throw dbError;
    }
  }

  /**
   * تحديث حالة تفعيل مركز معين (نشط/معطل).
   */
  async updateStatus(
    id: string,
    data: UpdateCenterStatusDto,
  ): Promise<CenterDetails> {
    await this.findOne(id);

    return this.prisma.center.update({
      where: { id },
      data: { isActive: data.isActive },
      select: centerDetailsSelect,
    });
  }

  /**
   * اشتراك مركز في باقة معينة مع دعم السعر المخصص.
   */
  async subscribe(
    centerId: string,
    planId: string,
    customPrice?: number,
  ): Promise<CenterDetails> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('باقة الاشتراك المطلوبة غير موجودة.');
    }

    if (!plan.isActive) {
      throw new BadRequestException('باقة الاشتراك المطلوبة غير نشطة.');
    }

    await this.findOne(centerId);

    const now = new Date();
    const startDate = getFirstDayOfMonth(now);
    const endDate = getLastDayOfMonth(
      startDate,
      plan.type === PlanType.MONTHLY ? 0 : 11,
    );
    const subscriptionPrice =
      customPrice !== undefined ? new Prisma.Decimal(customPrice) : plan.price;

    await this.prisma.$transaction(async (tx) => {
      // Deactivate existing active subscriptions
      await tx.centerSubscription.updateMany({
        where: {
          centerId,
          status: 'ACTIVE',
        },
        data: {
          status: 'EXPIRED',
        },
      });

      const newSubscription = await tx.centerSubscription.create({
        data: {
          centerId,
          subscriptionPlanId: planId,
          customPrice: subscriptionPrice,
          startDate,
          endDate,
          status: 'ACTIVE',
        },
      });

      await tx.subscriptionPayment.create({
        data: {
          centerSubscriptionId: newSubscription.id,
          centerId,
          paid: subscriptionPrice,
          periodStart: startDate,
          periodEnd: endDate,
          paymentMethod: 'manual',
          notes:
            customPrice !== undefined
              ? `اشتراك في باقة جديدة بسعر مخصص: ${subscriptionPrice.toString()}`
              : `اشتراك في باقة ${plan.type === PlanType.MONTHLY ? 'شهرية' : 'سنوية'} جديدة`,
        },
      });
    });

    return this.findOne(centerId);
  }

  /**
   * تجديد اشتراك مركز بناءً على نوع الباقة (شهري / سنوي) مع التمديد الذكي للأيام المتبقية إن وجدت ودعم السعر المخصص.
   */
  async renew(
    centerId: string,
    dto?: RenewSubscriptionDto,
  ): Promise<CenterDetails> {
    await this.findOne(centerId);

    const now = new Date();

    // 1. جلب الاشتراك النشط حالياً للمركز (إن وجد وسارٍ)
    const activeSubscription = await this.prisma.centerSubscription.findFirst({
      where: {
        centerId,
        status: 'ACTIVE',
        endDate: { gte: now },
      },
      orderBy: { endDate: 'desc' },
      include: { subscriptionPlan: true },
    });

    // 2. إذا لم يوجد اشتراك نشط سارٍ، جلب أحدث اشتراك لمعرفة الباقة السابقة
    const lastSubscription =
      activeSubscription ||
      (await this.prisma.centerSubscription.findFirst({
        where: { centerId },
        orderBy: { endDate: 'desc' },
        include: { subscriptionPlan: true },
      }));

    // 3. تحديد باقة الاشتراك المستهدفة (المرسلة في الـ DTO أو باقة الاشتراك الحالي)
    const targetPlanId =
      dto?.subscriptionPlanId || lastSubscription?.subscriptionPlanId;

    if (!targetPlanId) {
      throw new BadRequestException(
        'لا يوجد باقة اشتراك سابقة لتجديدها، يرجى تحديد باقة الاشتراك.',
      );
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: targetPlanId },
    });

    if (!plan) {
      throw new NotFoundException('باقة الاشتراك المطلوبة غير موجودة.');
    }

    if (!plan.isActive) {
      throw new BadRequestException('باقة الاشتراك المطلوبة غير نشطة.');
    }

    // 4. حساب تواريخ الاشتراك وفترة الدفعة بناءً على نوع الباقة (MONTHLY / YEARLY)
    const count = dto?.monthsCount ?? 1;
    const isYearly = plan.type === PlanType.YEARLY;
    const totalMonthsToAdd = isYearly ? count * 12 : count;

    const isCurrentlyActive = !!activeSubscription;

    let subscriptionStartDate: Date;
    let subscriptionEndDate: Date;
    let paymentPeriodStart: Date;
    let paymentPeriodEnd: Date;

    if (isCurrentlyActive && activeSubscription) {
      // تمديد اشتراك سارٍ:
      // فترة الدفعة تبدأ من أول يوم في الشهر التالي لانتهاء الاشتراك الحالي (أو التاريخ المحدد إن وجد)
      paymentPeriodStart = dto?.startDate
        ? getFirstDayOfMonth(new Date(dto.startDate))
        : getFirstDayOfNextMonth(activeSubscription.endDate);
      paymentPeriodEnd = getLastDayOfMonth(
        paymentPeriodStart,
        totalMonthsToAdd - 1,
      );
      // تاريخ نهاية الاشتراك يمتد ليشمل المدة المجددة كاملة
      subscriptionEndDate = paymentPeriodEnd;
      subscriptionStartDate = paymentPeriodStart;
    } else {
      // اشتراك جديد أو منتهٍ: يبدأ من أول يوم في الشهر الحالي (أو التاريخ المحدد) وحتى آخر يوم في المدة المستهدفة
      subscriptionStartDate = dto?.startDate
        ? getFirstDayOfMonth(new Date(dto.startDate))
        : getFirstDayOfMonth(now);
      subscriptionEndDate = getLastDayOfMonth(
        subscriptionStartDate,
        totalMonthsToAdd - 1,
      );
      paymentPeriodStart = subscriptionStartDate;
      paymentPeriodEnd = subscriptionEndDate;
    }

    const inputPrice =
      dto?.customPrice !== undefined ? dto.customPrice : dto?.price;
    const totalPrice =
      inputPrice !== undefined
        ? new Prisma.Decimal(inputPrice)
        : new Prisma.Decimal(plan.price).mul(count);

    let periodDescription: string;
    if (isYearly) {
      periodDescription = count === 1 ? 'سنة واحدة' : `${count} سنوات`;
    } else {
      periodDescription = count === 1 ? 'شهر واحد' : `${count} أشهر`;
    }

    const notes =
      inputPrice !== undefined
        ? `تجديد اشتراك ${isYearly ? 'سنوي' : 'شهري'} (${periodDescription}) بسعر مخصص: ${totalPrice.toString()}`
        : `تجديد اشتراك ${isYearly ? 'سنوي' : 'شهري'} (${periodDescription})`;

    // 5. تنفيذ العملية داخل معاملة لضمان سلامة البيانات
    await this.prisma.$transaction(async (tx) => {
      let targetSubscriptionId: string;

      if (
        isCurrentlyActive &&
        activeSubscription &&
        plan.id === activeSubscription.subscriptionPlanId
      ) {
        // تمديد نفس الاشتراك النشط بتحديث تاريخ البداية وتاريخ الانتهاء
        const updatedSubscription = await tx.centerSubscription.update({
          where: { id: activeSubscription.id },
          data: {
            startDate: subscriptionStartDate,
            endDate: subscriptionEndDate,
            status: 'ACTIVE',
          },
        });
        targetSubscriptionId = updatedSubscription.id;
      } else {
        // في حال تغيير الباقة أو إذا كان الاشتراك منتهياً:
        // إنهاء حالة الاشتراكات السابقة النشطة
        await tx.centerSubscription.updateMany({
          where: {
            centerId,
            status: 'ACTIVE',
          },
          data: {
            status: 'EXPIRED',
          },
        });

        // إنشاء سجل الاشتراك المجدد
        const renewedSubscription = await tx.centerSubscription.create({
          data: {
            centerId,
            subscriptionPlanId: plan.id,
            customPrice: totalPrice,
            startDate: subscriptionStartDate,
            endDate: subscriptionEndDate,
            status: 'ACTIVE',
          },
        });
        targetSubscriptionId = renewedSubscription.id;
      }

      // تسجيل دفعة الاشتراك بالفترة المحددة للتجديد
      await tx.subscriptionPayment.create({
        data: {
          centerSubscriptionId: targetSubscriptionId,
          centerId,
          paid: totalPrice,
          periodStart: paymentPeriodStart,
          periodEnd: paymentPeriodEnd,
          paymentMethod: 'manual',
          notes,
        },
      });
    });

    return this.findOne(centerId);
  }

  /**
   * جلب تفاصيل المركز الحالي للمستخدم.
   */
  async getMyCenter(centerId: string): Promise<CenterDetails> {
    return this.findOne(centerId);
  }

  /**
   * جلب تفاصيل اشتراك المركز الحالي مع إحصائيات استهلاك الموارد المجمعة.
   */
  async getMySubscriptionOverview(centerId: string) {
    const [center, studentsCount, teachersCount, subjectsCount] =
      await Promise.all([
        this.prisma.center.findUnique({
          where: { id: centerId },
          select: centerDetailsSelect,
        }),
        this.prisma.student.count({
          where: {
            user: { centerId },
          },
        }),
        this.prisma.teacher.count({
          where: {
            user: { centerId },
          },
        }),
        this.prisma.subject.count({
          where: { centerId },
        }),
      ]);

    if (!center) {
      throw new NotFoundException('المركز المطلوب غير موجود.');
    }

    return {
      center,
      usage: {
        studentsCount,
        teachersCount,
        subjectsCount,
      },
    };
  }

  // ==========================================
  // Private Assertion & Retrieval Helpers
  // ==========================================

  /**
   * جلب باقة الاشتراك والتأكد من وجودها ونشاطها.
   */
  private async getSubscriptionPlan(
    tx: Prisma.TransactionClient,
    planId: string,
  ) {
    const plan = await tx.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('باقة الاشتراك المطلوبة غير موجودة.');
    }

    if (!plan.isActive) {
      throw new BadRequestException('باقة الاشتراك المطلوبة غير نشطة.');
    }

    return plan;
  }

  /**
   * التأكد من أن الرابط البديل للمركز غير مستخدم مسبقاً.
   */
  private async ensureSlugIsUnique(tx: Prisma.TransactionClient, slug: string) {
    const existing = await tx.center.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException('الرابط البديل (slug) للمركز مستخدم بالفعل.');
    }
  }

  /**
   * التأكد من أن البريد الإلكتروني للمركز غير مستخدم مسبقاً.
   */
  private async ensureCenterEmailIsUnique(
    tx: Prisma.TransactionClient,
    email: string,
  ) {
    const existing = await tx.center.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('البريد الإلكتروني للمركز مستخدم بالفعل.');
    }
  }

  /**
   * التأكد من أن البريد الإلكتروني لمالك المركز غير مستخدم مسبقاً في النظام.
   */
  private async ensureOwnerEmailIsUnique(
    tx: Prisma.TransactionClient,
    email: string,
  ) {
    const existing = await tx.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(
        'البريد الإلكتروني لمالك المركز مستخدم بالفعل.',
      );
    }
  }
}
