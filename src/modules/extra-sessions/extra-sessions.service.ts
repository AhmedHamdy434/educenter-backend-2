import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  AuditAction,
  DayOfWeek,
  ExtraSessionAudience,
  ExtraSessionStatus,
  ExtraSessionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { WhatsAppService } from '../notifications/whatsapp.service';
import {
  getCairoDateParts,
  getCairoDateString,
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

export interface ExtraSessionWarning {
  code: string;
  message: string;
  conflictingId?: string;
}

export interface CreateExtraSessionResult {
  created: boolean;
  warnings?: ExtraSessionWarning[];
  session?: Omit<ExtraSessionDetails, 'participants'> & {
    participants: ExtraSessionStudentWithAttendance[];
    financialSummary: ExtraSessionFinancialSummary;
  };
}

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

const JS_TO_DAY_OF_WEEK: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

@Injectable()
export class ExtraSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  /**
   * إنشاء حصة إضافية جديدة لمجموعة محددة.
   * يتحقق من التعارضات، وينشئ الحصة وقائمة طلابها وجلسة الحضور في Transaction واحدة.
   */
  async create(
    centerId: string,
    groupId: string,
    dto: CreateExtraSessionDto,
    userId: string,
  ): Promise<CreateExtraSessionResult> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, centerId },
      include: {
        schedule: true,
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
    const cairoParts = getCairoDateParts(date);
    const sessionDayOfWeek = JS_TO_DAY_OF_WEEK[cairoParts.dayOfWeek];
    const duration = dto.durationMinutes ?? 60;
    const startMin = dto.hour * 60 + dto.minute;
    const endMin = startMin + duration;

    // 1. فحص التعارضات (Warnings)
    const warnings: ExtraSessionWarning[] = [];

    // أ. فحص تعارض مواعيد المعلم الأساسية
    const teacherGroups = await this.prisma.group.findMany({
      where: {
        centerId,
        teacherId: group.teacherId,
        isActive: true,
        schedule: {
          some: { day: sessionDayOfWeek },
        },
      },
      select: {
        id: true,
        name: true,
        schedule: {
          where: { day: sessionDayOfWeek },
          select: { id: true, hour: true, minute: true },
        },
      },
    });

    for (const tg of teacherGroups) {
      for (const slot of tg.schedule) {
        const slotStart = slot.hour * 60 + slot.minute;
        const slotEnd = slotStart + 60;
        if (Math.max(startMin, slotStart) < Math.min(endMin, slotEnd)) {
          warnings.push({
            code: 'TEACHER_SCHEDULE_CONFLICT',
            message: `المعلم لديه حصة مجدولة لمجموعة (${tg.name}) في نفس التوقيت تقريباً (${slot.hour}:${String(slot.minute).padStart(2, '0')}).`,
            conflictingId: tg.id,
          });
        }
      }
    }

    // ب. فحص تعارض المعلم مع حصص إضافية أخرى في نفس اليوم
    const teacherOtherExtra = await this.prisma.extraSession.findMany({
      where: {
        centerId,
        date,
        status: { not: ExtraSessionStatus.CANCELED },
        group: { teacherId: group.teacherId },
      },
      select: {
        id: true,
        title: true,
        hour: true,
        minute: true,
        durationMinutes: true,
        group: { select: { id: true, name: true } },
      },
    });

    for (const es of teacherOtherExtra) {
      const esStart = es.hour * 60 + es.minute;
      const esEnd = esStart + es.durationMinutes;
      if (Math.max(startMin, esStart) < Math.min(endMin, esEnd)) {
        warnings.push({
          code: 'TEACHER_EXTRA_CONFLICT',
          message: `المعلم لديه حصة إضافية أخرى (${es.title || es.group.name}) في نفس التوقيت (${es.hour}:${String(es.minute).padStart(2, '0')}).`,
          conflictingId: es.id,
        });
      }
    }

    // ج. فحص تعارض المجموعة مع مواعيدها الأساسية في نفس اليوم
    for (const slot of group.schedule) {
      if (slot.day === sessionDayOfWeek) {
        const slotStart = slot.hour * 60 + slot.minute;
        const slotEnd = slotStart + 60;
        if (Math.max(startMin, slotStart) < Math.min(endMin, slotEnd)) {
          warnings.push({
            code: 'GROUP_REGULAR_CONFLICT',
            message: `المجموعة لديها موعد أساسي مجدول في هذا اليوم في نفس التوقيت (${slot.hour}:${String(slot.minute).padStart(2, '0')}).`,
            conflictingId: group.id,
          });
        }
      }
    }

    // د. فحص تعارض المجموعة مع حصة إضافية أخرى في نفس اليوم
    const groupOtherExtra = await this.prisma.extraSession.findMany({
      where: {
        centerId,
        groupId,
        date,
        status: { not: ExtraSessionStatus.CANCELED },
      },
      select: {
        id: true,
        title: true,
        hour: true,
        minute: true,
        durationMinutes: true,
      },
    });

    for (const es of groupOtherExtra) {
      const esStart = es.hour * 60 + es.minute;
      const esEnd = esStart + es.durationMinutes;
      if (Math.max(startMin, esStart) < Math.min(endMin, esEnd)) {
        warnings.push({
          code: 'GROUP_EXTRA_CONFLICT',
          message: `المجموعة لديها بالفعل حصة إضافية أخرى (${es.title || 'بدون عنوان'}) في نفس التوقيت (${es.hour}:${String(es.minute).padStart(2, '0')}).`,
          conflictingId: es.id,
        });
      }
    }

    // إذا وُجدت تعارضات ولم يطلب المالك فرض الإنشاء (force = true)
    if (warnings.length > 0) {
      return {
        created: false,
        warnings,
      };
    }

    // 2. التحقق من الطلاب المشاركين
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

    // 3. التنفيذ Transactional
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
          durationMinutes: duration,
          location: dto.location?.trim() || null,
          fee: new Prisma.Decimal(fee),
          notes: dto.notes?.trim() || null,
        },
      });

      // ب. فتح جلسة الحضور AttendanceSession المقترنة بها في نفس اللحظة
      await tx.attendanceSession.create({
        data: {
          centerId,
          groupId,
          extraSessionId: extraSession.id,
          date,
        },
      });

      // ج. إنشاء سجلات الطلاب ExtraSessionStudent
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

    // 4. تسجيل AuditLog
    await this.auditLogsService.log({
      centerId,
      userId,
      action: AuditAction.CREATE,
      entity: 'ExtraSession',
      entityId: createdSession.id,
      details: {
        groupId,
        date: dto.date,
        time: `${dto.hour}:${String(dto.minute).padStart(2, '0')}`,
        fee,
        audience: dto.audience,
        studentsCount: studentIdsToInclude.length,
      },
    });

    const fullDetails = await this.findOne(centerId, createdSession.id);

    return {
      created: true,
      warnings: warnings.length > 0 ? warnings : [],
      session: fullDetails,
    };
  }

  /**
   * جلب قائمة الحصص الإضافية لمجموعة معينة مع الفلترة والـ Pagination.
   */
  async findAllForGroup(
    centerId: string,
    groupId: string,
    query: GetExtraSessionsDto,
  ): Promise<{ data: ExtraSessionListItem[]; meta: PaginationMeta }> {
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
        { date: Prisma.SortOrder.desc },
      );

    const [total, data] = await Promise.all([
      this.prisma.extraSession.count({ where }),
      this.prisma.extraSession.findMany({
        where,
        skip,
        take,
        select: extraSessionListSelect,
        orderBy,
      }),
    ]);

    return {
      data,
      meta: buildMeta(total, query.page, query.limit),
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
    userId: string,
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
      dto.fee !== undefined && dto.fee !== Number(existing.fee);

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
          durationMinutes: dto.durationMinutes,
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

      // ج. إذا تغير السعر، نحدث amountDue لغير الدافعين وغير المعفيين فقط
      if (isFeeChanged && dto.fee !== undefined) {
        await tx.extraSessionStudent.updateMany({
          where: {
            extraSessionId: id,
            paid: null,
            isWaived: false,
          },
          data: {
            amountDue: new Prisma.Decimal(dto.fee),
          },
        });
      }
    });

    // تسجيل في الـ AuditLog
    await this.auditLogsService.log({
      centerId,
      userId,
      action: AuditAction.UPDATE,
      entity: 'ExtraSession',
      entityId: id,
      details: {
        ...JSON.parse(JSON.stringify(dto)),
        isFeeChanged,
      },
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
    userId: string,
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

    // تحديث الحالة فقط دون مسح السجلات
    await this.prisma.extraSession.update({
      where: { id },
      data: {
        status: ExtraSessionStatus.CANCELED,
      },
    });

    // تسجيل AuditLog بالحركة
    await this.auditLogsService.log({
      centerId,
      userId,
      action: AuditAction.STATUS_CHANGE,
      entity: 'ExtraSession',
      entityId: id,
      details: {
        status: 'CANCELED',
        hasPayments,
        confirmRefundNotes: dto.confirmRefundNotes?.trim() || null,
      },
    });

    // إرسال رسائل واتساب لأولياء الأمور (Graceful Failure)
    const dateStr = getCairoDateString(session.date);
    const timeStr = `${session.hour}:${String(session.minute).padStart(2, '0')}`;
    const message = `نحيطكم علماً بإلغاء الحصة الإضافية لمجموعة (${session.group.name}) المقررة يوم ${dateStr} الساعة ${timeStr}. نعتذر عن الإزعاج.`;

    for (const p of session.participants) {
      const phone = p.student.parentPhone;
      if (phone) {
        // إرسال بالخلفية بدون تعطيل الرد
        this.whatsappService
          .sendMessage({
            to: phone,
            message,
          })
          .catch(() => {});
      }
    }

    return {
      success: true,
      message: 'تم إلغاء الحصة الإضافية بنجاح وإشعار أولياء الأمور.',
    };
  }

  /**
   * إضافة طلاب إضافيين لحصة من نوع SELECTED.
   */
  async addStudents(
    centerId: string,
    id: string,
    dto: AddExtraSessionStudentsDto,
    userId: string,
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

    await this.auditLogsService.log({
      centerId,
      userId,
      action: AuditAction.UPDATE,
      entity: 'ExtraSession',
      entityId: id,
      details: {
        action: 'ADD_STUDENTS',
        addedStudentIds: newStudentIds,
      },
    });

    return {
      addedCount: newStudentIds.length,
      message: `تمت إضافة ${newStudentIds.length} طالب بنجاح للحصة الإضافية.`,
    };
  }

  /**
   * تسجيل دفع كاش لطالب في الحصة الإضافية.
   * يمنع الدفع المزدوج أو دفع طالب معفي.
   * يسجل AuditLog ويرسل إيصال واتساب لولي الأمر.
   */
  async payStudent(
    centerId: string,
    id: string,
    studentId: string,
    dto: PayExtraSessionStudentDto,
    userId: string,
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

    if (record.isWaived) {
      throw new BadRequestException(
        'هذا الطالب معفي من سداد رسوم الحصة الإضافية.',
      );
    }

    if (record.paid !== null && Number(record.paid) > 0) {
      throw new BadRequestException(
        'تم تسجيل دفع هذا الطالب مسبقاً لهذه الحصة.',
      );
    }

    const amountToPay = dto.amount ?? Number(record.amountDue);
    const paidAt = new Date();

    const updated = await this.prisma.extraSessionStudent.update({
      where: { id: record.id },
      data: {
        paid: new Prisma.Decimal(amountToPay),
        paidAt,
        notes: dto.notes?.trim() || record.notes,
      },
      select: extraSessionStudentSelect,
    });

    // تسجيل AuditLog
    await this.auditLogsService.log({
      centerId,
      userId,
      action: AuditAction.PAYMENT_COLLECTION,
      entity: 'ExtraSessionStudent',
      entityId: record.id,
      details: {
        extraSessionId: id,
        studentId,
        amount: amountToPay,
        paidAt,
      },
    });

    // إرسال إيصال واتساب (Graceful Failure)
    const parentPhone = record.student.parentPhone;
    if (parentPhone) {
      const sessionTitle =
        record.extraSession.title ||
        `حصة إضافية لمجموعة ${record.extraSession.group.name}`;
      const msg = `تم بنجاح استلام مبلغ ${amountToPay} ج.م رسوم (${sessionTitle}) للطالب ${record.student.user.fullName}. شكراً لتعاونكم.`;
      this.whatsappService
        .sendMessage({
          to: parentPhone,
          message: msg,
        })
        .catch(() => {});
    }

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
    userId: string,
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

    if (record.paid !== null && Number(record.paid) > 0) {
      throw new BadRequestException(
        'لا يمكن إعفاء طالب قام بالدفع بالفعل. يمكنك رد المبلغ أولاً.',
      );
    }

    const updated = await this.prisma.extraSessionStudent.update({
      where: { id: record.id },
      data: {
        isWaived: true,
        amountDue: new Prisma.Decimal(0.0),
        notes: dto.notes?.trim() || 'تم الإعفاء من قبل الإدارة',
      },
      select: extraSessionStudentSelect,
    });

    await this.auditLogsService.log({
      centerId,
      userId,
      action: AuditAction.STATUS_CHANGE,
      entity: 'ExtraSessionStudent',
      entityId: record.id,
      details: {
        action: 'WAIVE',
        studentId,
        extraSessionId: id,
        notes: dto.notes,
      },
    });

    return updated;
  }
}
