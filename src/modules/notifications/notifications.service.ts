import { Injectable } from '@nestjs/common';
import { Prisma, NotificationType, type Notification } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';
import { NotificationQueryDto } from './dto/get-notifications.dto';
import { buildMeta, PaginationMeta } from '../../common/utils/buildMeta';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  /**
   * إنشاء إشعار في قاعدة البيانات وإرساله عبر الواتساب إذا توفر رقم الهاتف.
   */
  async createAndDispatch(data: {
    centerId: string;
    userId?: string;
    recipientPhone?: string;
    title: string;
    message: string;
    type: NotificationType;
    metadata?: Prisma.InputJsonValue;
  }) {
    let isSent = false;

    if (data.recipientPhone) {
      isSent = await this.whatsAppService.sendMessage({
        to: data.recipientPhone,
        message: data.message,
      });
    }

    return this.prisma.notification.create({
      data: {
        centerId: data.centerId,
        userId: data.userId || null,
        title: data.title,
        message: data.message,
        type: data.type,
        recipient: data.recipientPhone || null,
        isSent,
        metadata: data.metadata || Prisma.JsonNull,
      },
    });
  }

  /**
   * إرسال تنبيه غياب طالب إلى ولي الأمر.
   */
  async notifyAbsence(
    centerId: string,
    studentName: string,
    parentPhone: string,
    date: string,
    groupName: string,
  ) {
    const title = 'تنبيه غياب طالب';
    const message = `نحيطكم علماً بأن الطالب/ة: ${studentName} تغيب عن حصة مجموعة "${groupName}" بتاريخ ${date}. يرجى المتابعة مع إدارة المركز.`;

    return this.createAndDispatch({
      centerId,
      recipientPhone: parentPhone,
      title,
      message,
      type: NotificationType.ATTENDANCE_ABSENCE,
      metadata: { studentName, date, groupName },
    });
  }

  /**
   * إرسال إيصال سداد رسوم شهرية.
   */
  async notifyPaymentReceipt(
    centerId: string,
    studentName: string,
    parentPhone: string,
    month: string,
    amount: number | string,
  ) {
    const title = 'إيصال سداد رسوم دراسية';
    const message = `تم بنجاح سداد اشتراك شهر (${month}) للطالب/ة: ${studentName} بمبلغ قدره ${amount} ج.م. شكراً لتعاونكم.`;

    return this.createAndDispatch({
      centerId,
      recipientPhone: parentPhone,
      title,
      message,
      type: NotificationType.PAYMENT_RECEIPT,
      metadata: { studentName, month, amount: String(amount) },
    });
  }

  /**
   * إرسال بيانات الحساب وكلمة المرور المؤقتة لمستخدم جديد.
   */
  async notifyAccountCredentials(
    centerId: string,
    userId: string,
    phone: string,
    fullName: string,
    temporaryPassword: string,
  ) {
    const title = 'بيانات تسجيل الدخول إلى المنصة التعليمية';
    const message = `مرحباً ${fullName}، تم إنشاء حساب لك في المنصة التعليمية.\nرقم الدخول: ${phone}\nكلمة المرور المؤقتة: ${temporaryPassword}\nيرجى تغيير كلمة المرور عند أول تسجيل دخول.`;

    return this.createAndDispatch({
      centerId,
      userId,
      recipientPhone: phone,
      title,
      message,
      type: NotificationType.NEW_ACCOUNT,
      metadata: { fullName, phone },
    });
  }

  /**
   * جلب سجل الإشعارات الخاصة بالمركز.
   */
  async findAll(
    centerId: string,
    query: NotificationQueryDto,
  ): Promise<{ data: Notification[]; meta: PaginationMeta }> {
    const { skip, take, type, search } = query;

    const where: Prisma.NotificationWhereInput = {
      centerId,
    };

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
        { recipient: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }
}
