import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceSession,
  AttendanceStatus,
  ExtraSessionAudience,
  ExtraSessionStatus,
  ExtraSessionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppRole } from '../../common/enums/app-role.enum';
import {
  getTodayMidnightUtcInCairo,
  parseDateStringToUtcMidnight,
} from '../../common/utils/date.util';
import { buildMeta, PaginationMeta } from '../../common/utils/buildMeta';
import { CreateExtraSessionDto } from './dto/create-extra-session.dto';
import { UpdateExtraSessionDto } from './dto/update-extra-session.dto';
import { GetExtraSessionsDto } from './dto/get-extra-sessions.dto';
import { CancelExtraSessionDto } from './dto/cancel-extra-session.dto';
import { AddExtraSessionStudentsDto } from './dto/add-extra-session-students.dto';
import { PayExtraSessionStudentDto } from './dto/pay-extra-session-student.dto';
import { WaiveExtraSessionStudentDto } from './dto/waive-extra-session-student.dto';
import {
  ExtraSessionDetails,
  extraSessionDetailsSelect,
  ExtraSessionListItem,
  extraSessionListSelect,
  ExtraSessionStudentItem,
  extraSessionStudentSelect,
  ExtraSessionStudentWithAttendance,
} from './constants/extra-session.select';

export interface ExtraSessionFinancialSummary {
  totalDue: number;
  totalCollected: number;
  remaining: number;
  totalWaived: number;
  studentsCount: number;
  paidCount: number;
  waivedCount: number;
  unpaidCount: number;
}

export interface ExtraSessionsGroupStats {
  totalSessions: number;
  scheduledSessions: number;
  completedSessions: number;
  canceledSessions: number;
  totalCollected: number;
}

export interface ExtraSessionListItemWithSummary extends ExtraSessionListItem {
  financialSummary: ExtraSessionFinancialSummary;
}

@Injectable()
export class ExtraSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * إنشاء حصة إضافية جديدة لمجموعة محددة.
   * ينشئ الحصة وقائمة طلابها وجلسة الحضور في Transaction واحدة.
   */
  async create(
    centerId: string,
    groupId: string,
    dto: CreateExtraSessionDto,
  ): Promise<
    Omit<ExtraSessionDetails, 'participants'> & {
      participants: ExtraSessionStudentWithAttendance[];
      financialSummary: ExtraSessionFinancialSummary;
    }
  > {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, centerId },
      include: {
        teacher: { select: { id: true, user: { select: { fullName: true } } } },
      },
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    if (!group.isActive) {
      throw new BadRequestException(
        'لا يمكن إنشاء حصة إضافية لمجموعة دراسية غير نشطة.',
      );
    }

    const date = parseDateStringToUtcMidnight(dto.date);

    // 1. التحقق من الطلاب المشاركين
    let studentIdsToInclude: string[] = [];

    if (dto.audience === ExtraSessionAudience.SELECTED) {
      if (!dto.studentIds || dto.studentIds.length === 0) {
        throw new BadRequestException(
          'يجب تحديد طالب واحد على الأقل عند اختيار جمهور الحصة "طلاب محددين".',
        );
      }

      // التأكد أن جميع الطلاب مسجلون في هذه المجموعة ونشطون
      const enrolled = await this.prisma.groupStudent.findMany({
        where: {
          groupId,
          centerId,
          studentId: { in: dto.studentIds },
          student: { user: { isActive: true } },
        },
        select: { studentId: true },
      });

      const enrolledSet = new Set(enrolled.map((e) => e.studentId));
      const notEnrolled = dto.studentIds.filter((id) => !enrolledSet.has(id));
      if (notEnrolled.length > 0) {
        throw new BadRequestException(
          'بعض الطلاب المحددين غير مسجلين في هذه المجموعة أو غير نشطين.',
        );
      }

      studentIdsToInclude = dto.studentIds;
    } else {
      // ALL_GROUP: نسخ جميع طلاب المجموعة النشطين
      const enrolled = await this.prisma.groupStudent.findMany({
        where: {
          groupId,
          centerId,
          student: { user: { isActive: true } },
        },
        select: { studentId: true },
      });

      studentIdsToInclude = enrolled.map((e) => e.studentId);
    }

    const fee = dto.fee ?? 0;
    const isFree = fee === 0;

    // 2. التنفيذ Transactional
    const createdSession = await this.prisma.$transaction(async (tx) => {
      // أ. إنشاء الحصة الإضافية
      const extraSession = await tx.extraSession.create({
        data: {
          centerId,
          groupId,
          title: dto.title?.trim() || null,
          type: dto.type ?? ExtraSessionType.OTHER,
          audience: dto.audience ?? ExtraSessionAudience.ALL_GROUP,
          status: ExtraSessionStatus.SCHEDULED,
          date,
          hour: dto.hour,
          minute: dto.minute,
          location: dto.location?.trim() || null,
          fee: new Prisma.Decimal(fee),
          notes: dto.notes?.trim() || null,
        },
      });

      // ب. إنشاء سجلات الطلاب ExtraSessionStudent
      if (studentIdsToInclude.length > 0) {
        await tx.extraSessionStudent.createMany({
          data: studentIdsToInclude.map((studentId) => ({
            extraSessionId: extraSession.id,
            studentId,
            centerId,
            amountDue: new Prisma.Decimal(fee),
            isWaived: isFree,
            paid: null,
            paidAt: null,
            notes: isFree ? 'حصة مجانية' : null,
          })),
        });
      }

      return extraSession;
    });

    return this.findOne(centerId, createdSession.id);
  }

  /**
   * جلب قائمة الحصص الإضافية لمجموعة معينة مع الفلترة والـ Pagination وإحصائيات المجموعة.
   */
  async findAllForGroup(
    centerId: string,
    groupId: string,
    query: GetExtraSessionsDto,
  ): Promise<{
    data: ExtraSessionListItemWithSummary[];
    meta: PaginationMeta;
    stats: ExtraSessionsGroupStats;
  }> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, centerId },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    const { skip, take, status, type, search } = query;

    const where: Prisma.ExtraSessionWhereInput = {
      centerId,
      groupId,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['date', 'createdAt', 'fee', 'title'];
    const orderBy =
      query.getOrderBy<Prisma.ExtraSessionOrderByWithRelationInput>(
        allowedSortFields,
        { date: Prisma.SortOrder.asc },
      );

    const [total, rawSessions, allGroupSessions] = await Promise.all([
      this.prisma.extraSession.count({ where }),
      this.prisma.extraSession.findMany({
        where,
        skip,
        take,
        select: {
          ...extraSessionListSelect,
          participants: {
            select: {
              amountDue: true,
              paid: true,
              isWaived: true,
            },
          },
        },
        orderBy,
      }),
      this.prisma.extraSession.findMany({
        where: { centerId, groupId },
        select: {
          status: true,
          participants: {
            select: {
              paid: true,
            },
          },
        },
      }),
    ]);

    const data: ExtraSessionListItemWithSummary[] = rawSessions.map(
      (session) => {
        const { participants, ...baseSession } = session;

        let totalDue = 0;
        let totalCollected = 0;
        let totalWaived = 0;
        let paidCount = 0;
        let waivedCount = 0;
        let unpaidCount = 0;

        for (const p of participants) {
          const due = Number(p.amountDue);
          const paid = p.paid ? Number(p.paid) : 0;

          totalDue += due;
          totalCollected += paid;

          if (p.isWaived) {
            waivedCount++;
            totalWaived += due;
          } else if (p.paid !== null && Number(p.paid) > 0) {
            paidCount++;
          } else {
            unpaidCount++;
          }
        }

        const remaining = Math.max(0, totalDue - totalCollected);

        const financialSummary: ExtraSessionFinancialSummary = {
          totalDue,
          totalCollected,
          remaining,
          totalWaived,
          studentsCount: participants.length,
          paidCount,
          waivedCount,
          unpaidCount,
        };

        return {
          ...baseSession,
          financialSummary,
        };
      },
    );

    const stats: ExtraSessionsGroupStats = {
      totalSessions: allGroupSessions.length,
      scheduledSessions: allGroupSessions.filter(
        (s) => s.status === ExtraSessionStatus.SCHEDULED,
      ).length,
      completedSessions: allGroupSessions.filter(
        (s) => s.status === ExtraSessionStatus.COMPLETED,
      ).length,
      canceledSessions: allGroupSessions.filter(
        (s) => s.status === ExtraSessionStatus.CANCELED,
      ).length,
      totalCollected: allGroupSessions.reduce((acc, s) => {
        const sum = s.participants.reduce(
          (pSum, p) => pSum + (p.paid ? Number(p.paid) : 0),
          0,
        );
        return acc + sum;
      }, 0),
    };

    return {
      data,
      meta: buildMeta(total, query.page, query.limit),
      stats,
    };
  }

  /**
   * تفاصيل حصة إضافية واحدة مع قائمة الطلاب والملخص المالي.
   */
  async findOne(
    centerId: string,
    id: string,
  ): Promise<
    Omit<ExtraSessionDetails, 'participants'> & {
      participants: ExtraSessionStudentWithAttendance[];
      financialSummary: ExtraSessionFinancialSummary;
    }
  > {
    const session = await this.prisma.extraSession.findFirst({
      where: { id, centerId },
      select: extraSessionDetailsSelect,
    });

    if (!session) {
      throw new NotFoundException('الحصة الإضافية المطلوبة غير موجودة.');
    }

    // حساب الملخص المالي
    let totalDue = 0;
    let totalCollected = 0;
    let totalWaived = 0;
    let paidCount = 0;
    let waivedCount = 0;
    let unpaidCount = 0;

    for (const p of session.participants) {
      const due = Number(p.amountDue);
      const paid = p.paid ? Number(p.paid) : 0;

      totalDue += due;
      totalCollected += paid;

      if (p.isWaived) {
        waivedCount++;
        totalWaived += due;
      } else if (p.paid !== null && Number(p.paid) > 0) {
        paidCount++;
      } else {
        unpaidCount++;
      }
    }

    const remaining = Math.max(0, totalDue - totalCollected);

    const financialSummary: ExtraSessionFinancialSummary = {
      totalDue,
      totalCollected,
      remaining,
      totalWaived,
      studentsCount: session.participants.length,
      paidCount,
      waivedCount,
      unpaidCount,
    };

    // جلب حالات الحضور للطلاب في هذه الجلسة إن وجدت
    const attendanceMap = new Map<
      string,
      { status: AttendanceStatus; absenceReason: string | null }
    >();

    if (session.attendanceSession?.id) {
      const records = await this.prisma.studentAttendance.findMany({
        where: { sessionId: session.attendanceSession.id },
        select: {
          studentId: true,
          status: true,
          absenceReason: true,
        },
      });
      for (const r of records) {
        attendanceMap.set(r.studentId, {
          status: r.status,
          absenceReason: r.absenceReason,
        });
      }
    }

    const participants: ExtraSessionStudentWithAttendance[] =
      session.participants.map((p) => {
        const att = attendanceMap.get(p.studentId);
        return {
          ...p,
          attendanceStatus: att?.status ?? null,
          absenceReason: att?.absenceReason ?? null,
        };
      });

    return {
      ...session,
      participants,
      financialSummary,
    };
  }

  /**
   * تعديل بيانات حصة إضافية.
   * لا يسمح بالتعديل إذا كانت الحصة ملغاة أو مكتملة.
   * في حال تغيير الرسوم (fee)، يتم تحديث amountDue فقط للطلاب الذين لم يدفعوا بعد وغير المعفيين.
   */
  async update(
    centerId: string,
    id: string,
    dto: UpdateExtraSessionDto,
  ): Promise<
    Omit<ExtraSessionDetails, 'participants'> & {
      participants: ExtraSessionStudentWithAttendance[];
      financialSummary: ExtraSessionFinancialSummary;
    }
  > {
    const existing = await this.prisma.extraSession.findFirst({
      where: { id, centerId },
      include: { participants: true },
    });

    if (!existing) {
      throw new NotFoundException('الحصة الإضافية المطلوبة غير موجودة.');
    }

    if (existing.status === ExtraSessionStatus.CANCELED) {
      throw new BadRequestException('لا يمكن تعديل حصة إضافية ملغاة.');
    }

    if (existing.status === ExtraSessionStatus.COMPLETED) {
      throw new BadRequestException('لا يمكن تعديل حصة إضافية مكتملة.');
    }

    const newDate = dto.date
      ? parseDateStringToUtcMidnight(dto.date)
      : undefined;
    const isFeeChanged =
      dto.fee !== undefined &&
      (existing.fee === null ||
        !existing.fee.equals(new Prisma.Decimal(dto.fee)));

    if (isFeeChanged && dto.fee !== undefined) {
      const newFeeDecimal = new Prisma.Decimal(dto.fee);
      const conflictingParticipant = existing.participants.find(
        (p) =>
          !p.isWaived && p.paid !== null && p.paid.greaterThan(newFeeDecimal),
      );
      if (conflictingParticipant) {
        throw new BadRequestException(
          'لا يمكن تعديل الرسوم إلى قيمة أقل من المبالغ المدفوعة بالفعل من بعض الطلاب.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // أ. تحديث بيانات الحصة
      await tx.extraSession.update({
        where: { id },
        data: {
          title:
            dto.title !== undefined ? dto.title?.trim() || null : undefined,
          type: dto.type,
          date: newDate,
          hour: dto.hour,
          minute: dto.minute,
          location:
            dto.location !== undefined
              ? dto.location?.trim() || null
              : undefined,
          fee: dto.fee !== undefined ? new Prisma.Decimal(dto.fee) : undefined,
          notes:
            dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
        },
      });

      // ب. إذا تغير التاريخ، نحدث تاريخ جلسة الحضور المقترنة
      if (newDate) {
        await tx.attendanceSession.updateMany({
          where: { extraSessionId: id },
          data: { date: newDate },
        });
      }

      // ج. إذا تغير السعر، نحدث amountDue لجميع المشاركين غير المعفيين
      if (isFeeChanged && dto.fee !== undefined) {
        await tx.extraSessionStudent.updateMany({
          where: {
            extraSessionId: id,
            isWaived: false,
          },
          data: {
            amountDue: new Prisma.Decimal(dto.fee),
          },
        });
      }
    });

    return this.findOne(centerId, id);
  }

  /**
   * إلغاء حصة إضافية.
   * لا يحذف جلسة الحضور ولا سجلات الدفع، بل يغير الحالة لـ CANCELED ويسجل ملاحظة الاسترداد في AuditLog.
   * يتم إرسال تنبيه بالواتساب لأولياء الأمور بدون ذكر ملاحظة الاسترداد الداخلية.
   */
  async cancel(
    centerId: string,
    id: string,
    dto: CancelExtraSessionDto,
  ): Promise<{ success: boolean; message: string }> {
    const session = await this.prisma.extraSession.findFirst({
      where: { id, centerId },
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

    if (!session) {
      throw new NotFoundException('الحصة الإضافية المطلوبة غير موجودة.');
    }

    if (session.status === ExtraSessionStatus.CANCELED) {
      throw new BadRequestException('هذه الحصة الإضافية ملغاة بالفعل.');
    }

    // التحقق من وجود مدفوعات
    const hasPayments = session.participants.some(
      (p) => p.paid !== null && Number(p.paid) > 0,
    );

    if (
      hasPayments &&
      (!dto.confirmRefundNotes || !dto.confirmRefundNotes.trim())
    ) {
      throw new BadRequestException(
        'هذه الحصة تتضمن مبالغ مدفوعة من بعض الطلاب. يلزم كتابة ملاحظة تأكيد معالجة المبالغ المستردة لإتمام الإلغاء.',
      );
    }

    // تحديث الحالة وحفظ ملاحظات وتاريخ الإلغاء دون مسح السجلات أو لمس حقل notes
    await this.prisma.extraSession.update({
      where: { id },
      data: {
        status: ExtraSessionStatus.CANCELED,
        cancellationNotes: dto.confirmRefundNotes?.trim() || null,
        canceledAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'تم إلغاء الحصة الإضافية بنجاح.',
    };
  }

  /**
   * إضافة طلاب إضافيين لحصة من نوع SELECTED.
   */
  async addStudents(
    centerId: string,
    id: string,
    dto: AddExtraSessionStudentsDto,
  ): Promise<{ addedCount: number; message: string }> {
    const session = await this.prisma.extraSession.findFirst({
      where: { id, centerId },
      include: {
        participants: { select: { studentId: true } },
      },
    });

    if (!session) {
      throw new NotFoundException('الحصة الإضافية المطلوبة غير موجودة.');
    }

    if (session.status === ExtraSessionStatus.CANCELED) {
      throw new BadRequestException('لا يمكن إضافة طلاب لحصة إضافية ملغاة.');
    }

    if (session.status === ExtraSessionStatus.COMPLETED) {
      throw new BadRequestException('لا يمكن إضافة طلاب لحصة إضافية مكتملة.');
    }

    // التحقق من أن الطلاب مسجلون في المجموعة
    const enrolled = await this.prisma.groupStudent.findMany({
      where: {
        groupId: session.groupId,
        centerId,
        studentId: { in: dto.studentIds },
        student: { user: { isActive: true } },
      },
      select: { studentId: true },
    });

    const enrolledSet = new Set(enrolled.map((e) => e.studentId));
    const notEnrolled = dto.studentIds.filter((sid) => !enrolledSet.has(sid));
    if (notEnrolled.length > 0) {
      throw new BadRequestException(
        'بعض الطلاب المحددين غير مسجلين في هذه المجموعة أو غير نشطين.',
      );
    }

    const existingStudentIds = new Set(
      session.participants.map((p) => p.studentId),
    );
    const newStudentIds = dto.studentIds.filter(
      (sid) => !existingStudentIds.has(sid),
    );

    if (newStudentIds.length === 0) {
      return {
        addedCount: 0,
        message: 'جميع الطلاب المحددين مسجلون بالفعل في هذه الحصة.',
      };
    }

    const fee = session.fee;
    const isFree = Number(fee) === 0;

    await this.prisma.extraSessionStudent.createMany({
      data: newStudentIds.map((studentId) => ({
        extraSessionId: id,
        studentId,
        centerId,
        amountDue: fee,
        isWaived: isFree,
        paid: null,
        paidAt: null,
        notes: isFree ? 'حصة مجانية' : null,
      })),
    });

    return {
      addedCount: newStudentIds.length,
      message: `تمت إضافة ${newStudentIds.length} طالب بنجاح للحصة الإضافية.`,
    };
  }

  /**
   * تسجيل دفع كاش لطالب في الحصة الإضافية.
   * يمنع الدفع المزدوج أو دفع طالب معفي.
   */
  async payStudent(
    centerId: string,
    id: string,
    studentId: string,
    dto: PayExtraSessionStudentDto,
  ): Promise<ExtraSessionStudentItem> {
    const record = await this.prisma.extraSessionStudent.findUnique({
      where: {
        extraSessionId_studentId: {
          extraSessionId: id,
          studentId,
        },
      },
      include: {
        extraSession: {
          include: {
            group: { select: { name: true } },
          },
        },
        student: {
          include: {
            user: { select: { fullName: true } },
          },
        },
      },
    });

    if (!record || record.centerId !== centerId) {
      throw new NotFoundException(
        'سجل الطالب في هذه الحصة الإضافية غير موجود.',
      );
    }

    if (record.extraSession.status === ExtraSessionStatus.CANCELED) {
      throw new BadRequestException('لا يمكن تسجيل دفع لحصة إضافية ملغاة.');
    }

    const amountToPay =
      dto.amount !== undefined
        ? new Prisma.Decimal(dto.amount)
        : record.amountDue;

    if (amountToPay.lessThan(0)) {
      throw new BadRequestException('المبلغ المدفوع لا يمكن أن يكون سالباً.');
    }

    if (amountToPay.greaterThan(record.amountDue)) {
      throw new BadRequestException(
        'المبلغ المدفوع لا يمكن أن يتجاوز المبلغ المستحق على الطالب.',
      );
    }

    const paidAt = amountToPay.greaterThan(0) ? new Date() : null;

    const updated = await this.prisma.extraSessionStudent.update({
      where: { id: record.id },
      data: {
        paid: amountToPay,
        paidAt,
        isWaived: false, // الدفع يلغي الإعفاء تلقائياً (دفع بعد إعفاء)
        notes:
          dto.notes !== undefined ? dto.notes?.trim() || null : record.notes,
      },
      select: extraSessionStudentSelect,
    });

    return updated;
  }

  /**
   * إعفاء طالب من رسوم الحصة الإضافية (amountDue = 0, isWaived = true).
   */
  async waiveStudent(
    centerId: string,
    id: string,
    studentId: string,
    dto: WaiveExtraSessionStudentDto,
  ): Promise<ExtraSessionStudentItem> {
    const record = await this.prisma.extraSessionStudent.findUnique({
      where: {
        extraSessionId_studentId: {
          extraSessionId: id,
          studentId,
        },
      },
    });

    if (!record || record.centerId !== centerId) {
      throw new NotFoundException(
        'سجل الطالب في هذه الحصة الإضافية غير موجود.',
      );
    }

    if (record.isWaived) {
      throw new BadRequestException('هذا الطالب معفي بالفعل من رسوم الحصة.');
    }

    if (
      record.paid !== null &&
      record.paid.greaterThanOrEqualTo(record.amountDue)
    ) {
      throw new BadRequestException(
        'هذا الطالب قام بسداد كامل رسوم الحصة بالفعل، لا حاجة لإعفائه.',
      );
    }

    const updated = await this.prisma.extraSessionStudent.update({
      where: { id: record.id },
      data: {
        isWaived: true,
        notes:
          dto.notes !== undefined ? dto.notes?.trim() || null : record.notes,
      },
      select: extraSessionStudentSelect,
    });

    return updated;
  }

  /**
   * بدء وفتح جلسة الحضور للحصة الإضافية.
   * لا يمكن بدء الجلسة قبل حلول تاريخ موعد الحصة الإضافية (يُسمح في نفس اليوم أو بعده فقط).
   */
  async startAttendanceSession(
    centerId: string,
    id: string,
    userRole: AppRole,
    userId: string,
  ): Promise<AttendanceSession> {
    const session = await this.prisma.extraSession.findFirst({
      where: { id, centerId },
      include: {
        attendanceSession: true,
        group: {
          select: {
            id: true,
            teacherId: true,
            isActive: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('الحصة الإضافية المطلوبة غير موجودة.');
    }

    if (!session.group.isActive) {
      throw new BadRequestException(
        'لا يمكن بدء جلسة حضور لمجموعة دراسية غير نشطة.',
      );
    }

    if (userRole === AppRole.TEACHER && session.group.teacherId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!teacher || session.group.teacherId !== teacher.id) {
        throw new ForbiddenException(
          'غير مصرح لك ببدء جلسة حضور لهذه المجموعة.',
        );
      }
    }

    if (session.status === ExtraSessionStatus.CANCELED) {
      throw new BadRequestException('لا يمكن بدء جلسة حضور لحصة إضافية ملغاة.');
    }

    // التحقق الصارم: لا يمكن بدء جلسة الحضور قبل تاريخ موعد الحصة (يُسمح في نفس اليوم أو بعده فقط)
    const today = getTodayMidnightUtcInCairo();
    const sessionDate = getTodayMidnightUtcInCairo(session.date);
    if (sessionDate.getTime() > today.getTime()) {
      throw new BadRequestException(
        'لا يمكن بدء جلسة الحضور قبل حلول تاريخ موعد الحصة الإضافية.',
      );
    }

    // إذا كانت الجلسة مفتوحة مسبقاً، يتم إرجاعها مباشرة
    if (session.attendanceSession) {
      return session.attendanceSession;
    }

    try {
      return await this.prisma.attendanceSession.create({
        data: {
          centerId,
          groupId: session.groupId,
          extraSessionId: session.id,
          date: session.date,
        },
      });
    } catch (error: unknown) {
      const isP2002 =
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002') ||
        (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002');
      if (isP2002) {
        const existing = await this.prisma.attendanceSession.findFirst({
          where: { extraSessionId: session.id, centerId },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }
}
