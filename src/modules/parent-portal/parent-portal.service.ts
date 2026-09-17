import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ParentPortalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * توليد رابط سحري (Magic Link Token) لولي الأمر صالح لمدة 30 يوماً.
   */
  async generateMagicToken(
    studentId: string,
    centerId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, centerId },
    });

    if (!student) {
      throw new NotFoundException('الطالب غير موجود.');
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 يوماً

    await this.prisma.parentMagicToken.create({
      data: {
        token,
        studentId,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  /**
   * استرجاع التقرير الشامل لحضور ومدفوعات الطالب عبر الرابط السحري.
   */
  async getStudentReportByToken(token: string) {
    const magicToken = await this.prisma.parentMagicToken.findUnique({
      where: { token },
      include: {
        student: {
          include: {
            user: {
              select: {
                fullName: true,
                phone: true,
                avatar: true,
              },
            },
            center: {
              select: {
                id: true,
                name: true,
                logo: true,
                phone: true,
              },
            },
            enrollments: {
              include: {
                grade: { select: { name: true } },
              },
              where: { isActive: true },
            },
            groups: {
              include: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    monthlyFee: true,
                    subject: { select: { name: true } },
                    teacher: {
                      select: {
                        user: { select: { fullName: true } },
                      },
                    },
                    schedule: true,
                  },
                },
                payments: {
                  orderBy: { subscriptionDate: 'desc' },
                  take: 24,
                },
              },
            },
            attendance: {
              include: {
                session: {
                  select: {
                    date: true,
                    group: { select: { name: true } },
                  },
                },
              },
              orderBy: { session: { date: 'desc' } },
              take: 100, // زيادة سجل الحضور إلى 100 حصة
            },
          },
        },
      },
    });

    if (!magicToken) {
      throw new NotFoundException('الرابط السحري غير صالح.');
    }

    if (magicToken.expiresAt < new Date()) {
      throw new UnauthorizedException('عذراً، لقد انتهت صلاحية هذا الرابط.');
    }

    const student = magicToken.student;

    // حساب إحصائيات الحضور
    const totalSessions = student.attendance?.length ?? 0;
    const presentCount =
      student.attendance?.filter((a) => a.status === 'PRESENT').length ?? 0;
    const absentCount =
      student.attendance?.filter((a) => a.status === 'ABSENT').length ?? 0;
    const lateCount =
      student.attendance?.filter((a) => a.status === 'LATE').length ?? 0;
    const excusedCount =
      student.attendance?.filter((a) => a.status === 'EXCUSED').length ?? 0;

    const attendanceRate =
      totalSessions > 0
        ? Math.round((presentCount / totalSessions) * 100)
        : 100;

    // سجل الغياب والتأخير والاستئذان
    const recentAbsences = (student.attendance || [])
      .filter((att) => att.status !== 'PRESENT')
      .map((att) => ({
        id: att.id,
        date: att.session.date.toISOString(),
        groupName: att.session.group.name,
        status: att.status,
        reason: att.absenceReason,
      }));

    const attendanceSummary = {
      totalSessions,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      attendanceRate,
      recentAbsences,
    };

    // الصف الدراسي للطالب
    const gradeName = student.enrollments?.[0]?.grade?.name || '—';

    // أيام ومواعيد المجموعات
    const DAY_NAMES: Record<string, string> = {
      SUNDAY: 'الأحد',
      MONDAY: 'الإثنين',
      TUESDAY: 'الثلاثاء',
      WEDNESDAY: 'الأربعاء',
      THURSDAY: 'الخميس',
      FRIDAY: 'الجمعة',
      SATURDAY: 'السبت',
    };

    const groups = (student.groups || []).map((g) => {
      const schedules = g.group.schedule?.map((s) => {
        const day = DAY_NAMES[s.day] || s.day;
        const hour12 = s.hour % 12 || 12;
        const period = s.hour >= 12 ? 'م' : 'ص';
        const minute = String(s.minute ?? 0).padStart(2, '0');
        return {
          day,
          time: `${hour12}:${minute} ${period}`,
        };
      });

      return {
        id: g.group.id,
        groupName: g.group.name,
        subjectName: g.group.subject.name,
        teacherName: g.group.teacher.user.fullName,
        monthlyFee: Number(g.group.monthlyFee),
        schedules: schedules || [],
      };
    });

    // سجل المدفوعات والاشتراكات الشهرية
    const tuition = (student.groups || []).flatMap((g) =>
      (g.payments || []).map((p) => ({
        id: p.id,
        month: new Date(p.subscriptionDate).toLocaleDateString('ar-EG', {
          month: 'long',
          year: 'numeric',
        }),
        groupName: g.group.name,
        subjectName: g.group.subject?.name,
        amount: Number(p.amount),
        isPaid: true,
        paidAt: p.paidAt ? p.paidAt.toISOString() : p.createdAt.toISOString(),
        receiptNumber: p.id ? String(p.id).slice(-6).toUpperCase() : undefined,
      })),
    );

    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
        gradeName,
        centerName: student.center.name,
        centerPhone: student.center.phone,
        parentPhone: student.parentPhone,
        phone: student.user.phone,
      },
      center: student.center,
      attendance: attendanceSummary,
      statistics: attendanceSummary,
      recentAttendance: attendanceSummary,
      groups,
      tuition,
      expiresAt: magicToken.expiresAt.toISOString(),
    };
  }
}
