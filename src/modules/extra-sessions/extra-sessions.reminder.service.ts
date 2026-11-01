import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExtraSessionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WhatsAppService } from '../notifications/whatsapp.service';
import {
  getCairoDateParts,
  getTodayMidnightUtcInCairo,
} from '../../common/utils/date.util';

@Injectable()
export class ExtraSessionsReminderService {
  private readonly logger = new Logger(ExtraSessionsReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  /**
   * كرون جوب دوري يعمل كل 30 دقيقة لفحص الحصص الإضافية التي ستبدأ بعد حوالي ساعتين.
   * يعتمد على حقل reminderSentAt مع updateMany لمنع الإرسال المكرر (Idempotent).
   */
  @Cron('*/30 * * * *')
  async handleUpcomingSessionReminders(): Promise<void> {
    const now = new Date();
    const todayMidnight = getTodayMidnightUtcInCairo(now);
    const cairoNow = getCairoDateParts(now);
    const nowMinutesFromMidnight = cairoNow.hour * 60 + cairoNow.minute;

    // استعلام الحصص المجدولة لليوم أو الغد التي لم يتم إرسال تذكير لها
    const candidateSessions = await this.prisma.extraSession.findMany({
      where: {
        status: ExtraSessionStatus.SCHEDULED,
        reminderSentAt: null,
        date: {
          gte: todayMidnight,
        },
      },
      include: {
        group: { select: { name: true } },
        participants: {
          include: {
            student: {
              select: {
                parentPhone: true,
                user: { select: { fullName: true } },
              },
            },
          },
        },
      },
    });

    if (candidateSessions.length === 0) {
      return;
    }

    for (const session of candidateSessions) {
      const sessionDateParts = getCairoDateParts(session.date);
      // حساب الفرق بالدقائق
      const isToday =
        sessionDateParts.year === cairoNow.year &&
        sessionDateParts.month === cairoNow.month &&
        sessionDateParts.day === cairoNow.day;

      if (!isToday) {
        continue;
      }

      const sessionMinutes = session.hour * 60 + session.minute;
      const diffMinutes = sessionMinutes - nowMinutesFromMidnight;

      // نافذة الساعتين: الحصص التي ستبدأ بعد 90 إلى 150 دقيقة من الآن
      if (diffMinutes >= 90 && diffMinutes <= 150) {
        // تحديث ذري بشرط reminderSentAt: null لضمان Idempotency التام
        const updated = await this.prisma.extraSession.updateMany({
          where: {
            id: session.id,
            reminderSentAt: null,
          },
          data: {
            reminderSentAt: new Date(),
          },
        });

        if (updated.count === 0) {
          continue; // تم إرساله من معالج آخر
        }

        this.logger.log(
          `Dispatching 2-hour reminders for ExtraSession "${session.title || session.group.name}" (${session.id})`,
        );

        const timeStr = `${session.hour}:${String(session.minute).padStart(2, '0')}`;
        const message = `تذكير: موعد الحصة الإضافية لمجموعة (${session.group.name}) اليوم في تمام الساعة ${timeStr}. يرجى الحرص على الحضور في الموعد المحدد.`;

        for (const p of session.participants) {
          const parentPhone = p.student.parentPhone;
          if (parentPhone) {
            this.whatsappService
              .sendMessage({
                to: parentPhone,
                message,
              })
              .catch((err) => {
                this.logger.error(
                  `Failed to dispatch reminder to ${parentPhone}: ${err?.message || err}`,
                );
              });
          }
        }
      }
    }
  }
}
