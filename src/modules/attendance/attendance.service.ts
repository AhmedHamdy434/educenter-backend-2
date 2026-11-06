import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  DayOfWeek,
  ExtraSessionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppRole } from '../../common/enums/app-role.enum';
import {
  getCairoDateParts,
  getTodayMidnightUtcInCairo,
  parseDateStringToUtcMidnight,
} from '../../common/utils/date.util';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { StartSessionQueryDto } from './dto/start-session-query.dto';
import { AttendanceStudentSessionItem } from './interfaces/attendance.interface';

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
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normalize date to midnight UTC of the current Egyptian calendar day (Africa/Cairo).
   */
  private getTodayMidnightUtc(): Date {
    return getTodayMidnightUtcInCairo();
  }

  /**
   * Validate that the group belongs to the center and the teacher has permission if applicable.
   */
  async validateGroupAccess(
    centerId: string,
    groupId: string,
    userRole: AppRole,
    userId: string,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, centerId },
      include: { schedule: true },
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    if (userRole === AppRole.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
      });
      if (!teacher || group.teacherId !== teacher.id) {
        throw new ForbiddenException(
          'ليس لديك صلاحية للوصول إلى هذه المجموعة.',
        );
      }
    }

    return group;
  }

  /**
   * Start or retrieve an attendance session for a group.
   * Can open today's session, a past session, or an extra session.
   * Strictly forbids starting a session for a future date (today >= sessionDate).
   */
  async startOrGetSession(
    centerId: string,
    groupId: string,
    userRole: AppRole,
    userId: string,
    query?: StartSessionQueryDto,
  ) {
    const group = await this.validateGroupAccess(
      centerId,
      groupId,
      userRole,
      userId,
    );

    if (!group.isActive) {
      throw new BadRequestException(
        'لا يمكن بدء جلسة حضور لمجموعة دراسية غير نشطة.',
      );
    }

    const today = this.getTodayMidnightUtc();

    // 1. تحديد تاريخ الجلسة المطلوبة (افتراضياً تاريخ اليوم)
    const date = query?.date ? parseDateStringToUtcMidnight(query.date) : today;

    // التحقق الصارم: منع بدء جلسة حضور لتاريخ مستقبلي
    const targetDateMidnight = getTodayMidnightUtcInCairo(date);
    if (targetDateMidnight.getTime() > today.getTime()) {
      throw new BadRequestException('لا يمكن بدء جلسة حضور لتاريخ مستقبلي.');
    }

    const cairoParts = getCairoDateParts(date);
    const targetDayOfWeek = JS_TO_DAY_OF_WEEK[cairoParts.dayOfWeek];
    const isScheduledOnDate = group.schedule?.some(
      (s) => s.day === targetDayOfWeek,
    );

    if (!isScheduledOnDate) {
      throw new BadRequestException(
        'لا يمكن بدء جلسة حضور عادية في يوم لا يتضمن موعداً مجدولاً للمجموعة. للحالات الطارئة، يرجى إنشاء "حصة إضافية" أولاً.',
      );
    }

    let session = await this.prisma.attendanceSession.findFirst({
      where: {
        groupId,
        date,
        extraSessionId: null,
      },
    });

    if (!session) {
      try {
        session = await this.prisma.attendanceSession.create({
          data: {
            groupId,
            centerId,
            date,
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
            where: {
              groupId,
              date,
              extraSessionId: null,
            },
          });
          if (existing) {
            session = existing;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    return session;
  }

  /**
   * Get attendance session details along with student enrollments.
   */
  async getSessionDetails(
    centerId: string,
    groupId: string,
    sessionId: string,
    userRole: AppRole,
    userId: string,
  ) {
    await this.validateGroupAccess(centerId, groupId, userRole, userId);

    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, groupId, centerId },
      include: {
        extraSession: {
          select: {
            id: true,
            title: true,
            type: true,
            fee: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('جلسة تحضير الحضور المطلوبة غير موجودة.');
    }

    // Get recorded attendance for this session
    const attendanceRecords = await this.prisma.studentAttendance.findMany({
      where: { sessionId },
    });

    const recordsMap = new Map(attendanceRecords.map((r) => [r.studentId, r]));

    let students: AttendanceStudentSessionItem[];

    // إذا كانت الجلسة لحصة إضافية، نجلب الطلاب المسجلين بالحصة الإضافية مع بيانات الدفع
    if (session.extraSessionId) {
      const extraStudents = await this.prisma.extraSessionStudent.findMany({
        where: {
          extraSessionId: session.extraSessionId,
          centerId,
        },
        include: {
          student: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: {
          student: {
            user: {
              fullName: 'asc',
            },
          },
        },
      });

      students = extraStudents.map((item) => {
        const record = recordsMap.get(item.studentId);
        return {
          studentId: item.studentId,
          studentCode: item.student.code,
          fullName: item.student.user.fullName,
          phone: item.student.user.phone,
          avatar: item.student.user.avatar,
          status: record ? record.status : null,
          absenceReason: record ? record.absenceReason : null,
          extraSessionInfo: {
            amountDue: new Prisma.Decimal(item.amountDue).toNumber(),
            paid:
              item.paid !== null
                ? new Prisma.Decimal(item.paid).toNumber()
                : null,
            isWaived: item.isWaived,
            paidAt: item.paidAt ? item.paidAt.toISOString() : null,
            notes: item.notes,
          },
        };
      });
    } else {
      // جلسة عادية: جلب الطلاب المقيدين في المجموعة
      const enrolledStudents = await this.prisma.groupStudent.findMany({
        where: {
          groupId,
          student: {
            user: {
              isActive: true,
            },
          },
        },
        include: {
          student: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: {
          student: {
            user: {
              fullName: 'asc',
            },
          },
        },
      });

      students = enrolledStudents.map((item) => {
        const record = recordsMap.get(item.studentId);
        return {
          studentId: item.studentId,
          studentCode: item.student.code,
          fullName: item.student.user.fullName,
          phone: item.student.user.phone,
          avatar: item.student.user.avatar,
          status: record ? record.status : null,
          absenceReason: record ? record.absenceReason : null,
        };
      });
    }

    return { session, students };
  }

  /**
   * Save student attendance records inside a transaction.
   */
  async saveAttendance(
    centerId: string,
    groupId: string,
    sessionId: string,
    dto: SaveAttendanceDto,
    userRole: AppRole,
    userId: string,
  ) {
    const group = await this.validateGroupAccess(
      centerId,
      groupId,
      userRole,
      userId,
    );

    if (!group.isActive) {
      throw new BadRequestException(
        'لا يمكن تسجيل الحضور لمجموعة دراسية غير نشطة.',
      );
    }

    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, groupId, centerId },
    });

    if (!session) {
      throw new NotFoundException('جلسة تحضير الحضور المطلوبة غير موجودة.');
    }

    const today = this.getTodayMidnightUtc();
    const sessionDate = getTodayMidnightUtcInCairo(session.date);
    if (sessionDate.getTime() > today.getTime()) {
      throw new BadRequestException(
        'لا يمكن تسجيل الحضور لجلسة موعدها في المستقبل.',
      );
    }

    // Verify each record has either studentId or studentCode
    for (const record of dto.records) {
      if (!record.studentId && !record.studentCode) {
        throw new BadRequestException(
          'معرف الطالب أو كود الطالب مطلوب لكل سجل حضور.',
        );
      }
    }

    // Resolve studentCode to studentId for records lacking studentId
    const recordsNeedingResolution = dto.records.filter(
      (r) => !r.studentId && r.studentCode,
    );

    if (recordsNeedingResolution.length > 0) {
      const candidateCodes = new Set<string>();
      for (const r of recordsNeedingResolution) {
        const raw = r.studentCode!.trim();
        const upper = raw.toUpperCase();
        candidateCodes.add(upper);
        if (!upper.startsWith('STU-')) {
          candidateCodes.add(`STU-${upper}`);
        }
      }

      const students = await this.prisma.student.findMany({
        where: {
          centerId,
          code: { in: Array.from(candidateCodes) },
        },
        select: {
          id: true,
          code: true,
        },
      });

      const codeMap = new Map<string, string>();
      for (const s of students) {
        codeMap.set(s.code.toUpperCase(), s.id);
        if (s.code.toUpperCase().startsWith('STU-')) {
          codeMap.set(s.code.toUpperCase().replace(/^STU-/, ''), s.id);
        }
      }

      for (const r of recordsNeedingResolution) {
        const trimmed = r.studentCode!.trim().toUpperCase();
        const resolvedId =
          codeMap.get(trimmed) || codeMap.get(trimmed.replace(/^STU-/, ''));
        if (!resolvedId) {
          throw new BadRequestException(
            `لم يتم العثور على طالب بالكود "${r.studentCode}" في هذا المركز.`,
          );
        }
        r.studentId = resolvedId;
      }
    }

    const studentIds = dto.records.map((r) => r.studentId as string);

    // التحقق من صحة انتساب الطلاب: إذا كانت جلسة حصة إضافية، نتحقق من ExtraSessionStudent
    if (session.extraSessionId) {
      const extraParticipants = await this.prisma.extraSessionStudent.findMany({
        where: {
          extraSessionId: session.extraSessionId,
          studentId: { in: studentIds },
        },
      });

      const extraIds = new Set(extraParticipants.map((p) => p.studentId));
      const nonParticipants = studentIds.filter((id) => !extraIds.has(id));

      if (nonParticipants.length > 0) {
        throw new BadRequestException(
          'لا يمكن تسجيل الحضور لطلاب غير مسجلين في هذه الحصة الإضافية.',
        );
      }
    } else {
      // جلسة عادية: التحقق من القيد في المجموعة
      const enrollments = await this.prisma.groupStudent.findMany({
        where: {
          groupId,
          studentId: { in: studentIds },
        },
      });

      const enrolledIds = new Set(enrollments.map((e) => e.studentId));
      const nonEnrolled = studentIds.filter((id) => !enrolledIds.has(id));

      if (nonEnrolled.length > 0) {
        throw new BadRequestException(
          'لا يمكن تسجيل الحضور لطلاب غير مقيدين بهذه المجموعة.',
        );
      }
    }

    // Deduplicate records by studentId taking the latest record
    const uniqueRecordsMap = new Map<string, (typeof dto.records)[number]>();
    for (const record of dto.records) {
      uniqueRecordsMap.set(record.studentId!, record);
    }
    const recordsToProcess = Array.from(uniqueRecordsMap.values());

    // Upsert attendance records inside a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const record of recordsToProcess) {
        const studentId = record.studentId!;
        await tx.studentAttendance.upsert({
          where: {
            sessionId_studentId: {
              sessionId,
              studentId,
            },
          },
          create: {
            sessionId,
            studentId,
            centerId,
            status: record.status,
            absenceReason: record.absenceReason?.trim() || null,
          },
          update: {
            status: record.status,
            absenceReason: record.absenceReason?.trim() || null,
          },
        });

        // إذا كانت الحصة إضافية، تحديث حالة الدفع والإعفاء إن وردت
        if (session.extraSessionId) {
          const participant = await tx.extraSessionStudent.findUnique({
            where: {
              extraSessionId_studentId: {
                extraSessionId: session.extraSessionId,
                studentId,
              },
            },
          });

          if (participant) {
            let newPaid: Prisma.Decimal | null | undefined = undefined;
            let newIsWaived: boolean | undefined = undefined;
            let newPaidAt: Date | null | undefined = undefined;
            let newNotes: string | null | undefined = undefined;

            if (record.isWaived !== undefined) {
              newIsWaived = record.isWaived;
            }

            if (record.paid !== undefined && record.paid !== null) {
              const paidDecimal = new Prisma.Decimal(record.paid);
              if (paidDecimal.lessThan(0)) {
                throw new BadRequestException(
                  'المبلغ المدفوع لا يمكن أن يكون سالباً.',
                );
              }
              if (paidDecimal.greaterThan(participant.amountDue)) {
                throw new BadRequestException(
                  'المبلغ المدفوع لا يمكن أن يتجاوز المبلغ المستحق على الطالب.',
                );
              }
              newPaid = paidDecimal;
              newPaidAt = paidDecimal.greaterThan(0) ? new Date() : null;
              // دفع مبلغ أكبر من صفر يلغي الإعفاء تلقائياً (دفع بعد إعفاء)
              if (paidDecimal.greaterThan(0)) {
                newIsWaived = false;
              }
            }

            if (record.paymentNotes !== undefined) {
              newNotes = record.paymentNotes.trim() || null;
            }

            if (
              newPaid !== undefined ||
              newIsWaived !== undefined ||
              newNotes !== undefined
            ) {
              await tx.extraSessionStudent.update({
                where: { id: participant.id },
                data: {
                  ...(newPaid !== undefined && {
                    paid: newPaid,
                    paidAt: newPaidAt,
                  }),
                  ...(newIsWaived !== undefined && { isWaived: newIsWaived }),
                  ...(newNotes !== undefined && { notes: newNotes }),
                },
              });
            }
          }
        }
      }

      // إذا كانت الحصة إضافية، التحقق مما إذا تم تسجيل حضور جميع الطلاب وتحديث حالتها إلى COMPLETED
      if (session.extraSessionId) {
        const extraSession = await tx.extraSession.findUnique({
          where: { id: session.extraSessionId },
          select: {
            id: true,
            status: true,
            _count: {
              select: { participants: true },
            },
          },
        });

        if (
          extraSession &&
          extraSession.status !== ExtraSessionStatus.CANCELED
        ) {
          const recordedCount = await tx.studentAttendance.count({
            where: { sessionId },
          });

          const totalParticipants = extraSession._count.participants;
          if (totalParticipants > 0 && recordedCount >= totalParticipants) {
            await tx.extraSession.update({
              where: { id: extraSession.id },
              data: { status: ExtraSessionStatus.COMPLETED },
            });
          }
        }
      }
    });

    return { success: true, message: 'تم حفظ الحضور والغياب بنجاح.' };
  }

  /**
   * Get all attendance sessions for a group.
   */
  async getGroupSessions(
    centerId: string,
    groupId: string,
    userRole: AppRole,
    userId: string,
  ) {
    await this.validateGroupAccess(centerId, groupId, userRole, userId);

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { groupId, centerId },
      include: {
        records: {
          select: {
            status: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    return sessions.map((session) => {
      const { records, ...sessionData } = session;

      const stats = {
        present: 0,
        late: 0,
        attendedAnotherGroup: 0,
        absent: 0,
        excused: 0,
      };

      for (const record of records) {
        switch (record.status) {
          case AttendanceStatus.PRESENT:
            stats.present++;
            break;
          case AttendanceStatus.LATE:
            stats.late++;
            break;
          case AttendanceStatus.ATTENDED_ANOTHER_GROUP:
            stats.attendedAnotherGroup++;
            break;
          case AttendanceStatus.ABSENT:
            stats.absent++;
            break;
          case AttendanceStatus.EXCUSED:
            stats.excused++;
            break;
        }
      }

      const attendedCount =
        stats.present + stats.late + stats.attendedAnotherGroup;

      return {
        ...sessionData,
        _count: {
          records: records.length,
        },
        attendedCount,
        stats,
      };
    });
  }

  /**
   * Get group report statistics.
   */
  async getGroupReport(
    centerId: string,
    groupId: string,
    userRole: AppRole,
    userId: string,
  ) {
    await this.validateGroupAccess(centerId, groupId, userRole, userId);

    const regularSessions = await this.prisma.attendanceSession.findMany({
      where: { groupId, centerId, extraSessionId: null },
      select: { id: true },
    });

    const sessionIds = regularSessions.map((s) => s.id);
    const totalSessions = sessionIds.length;

    // جلب الحصص الإضافية الفعالة (غير الملغاة) لحساب كائنها المنفصل
    const extraAttendanceSessions =
      await this.prisma.attendanceSession.findMany({
        where: {
          groupId,
          centerId,
          extraSessionId: { not: null },
          extraSession: {
            status: { not: ExtraSessionStatus.CANCELED },
          },
        },
        select: { id: true },
      });
    const extraSessionIds = extraAttendanceSessions.map((s) => s.id);

    const extraSessions = {
      total: extraSessionIds.length,
      attended: 0,
      absent: 0,
    };

    if (extraSessionIds.length > 0) {
      const extraRecords = await this.prisma.studentAttendance.findMany({
        where: { sessionId: { in: extraSessionIds } },
      });
      extraSessions.attended = extraRecords.filter(
        (r) =>
          r.status === AttendanceStatus.PRESENT ||
          r.status === AttendanceStatus.LATE ||
          r.status === AttendanceStatus.ATTENDED_ANOTHER_GROUP,
      ).length;
      extraSessions.absent = extraRecords.filter(
        (r) => r.status === AttendanceStatus.ABSENT,
      ).length;
    }

    const enrolledStudents = await this.prisma.groupStudent.findMany({
      where: { groupId },
      include: {
        student: {
          include: {
            user: {
              select: { fullName: true },
            },
          },
        },
      },
    });

    const totalStudents = enrolledStudents.length;

    if (totalSessions === 0 || totalStudents === 0) {
      return {
        totalSessions,
        totalStudents,
        attendanceRate: 0,
        highestAbsence: [],
        perfectAttendance: [],
        extraSessions,
      };
    }

    const allRecords = await this.prisma.studentAttendance.findMany({
      where: { sessionId: { in: sessionIds } },
    });

    const totalRecords = allRecords.length;
    const presentOrLateCount = allRecords.filter(
      (r) =>
        r.status === AttendanceStatus.PRESENT ||
        r.status === AttendanceStatus.LATE ||
        r.status === AttendanceStatus.ATTENDED_ANOTHER_GROUP,
    ).length;

    const attendanceRate =
      totalRecords > 0
        ? Math.round((presentOrLateCount / totalRecords) * 100)
        : 0;

    // Calculate stats per student
    const studentStats = enrolledStudents.map((item) => {
      const studentRecords = allRecords.filter(
        (r) => r.studentId === item.studentId,
      );
      const present = studentRecords.filter(
        (r) => r.status === AttendanceStatus.PRESENT,
      ).length;
      const absent = studentRecords.filter(
        (r) => r.status === AttendanceStatus.ABSENT,
      ).length;
      const late = studentRecords.filter(
        (r) => r.status === AttendanceStatus.LATE,
      ).length;
      const excused = studentRecords.filter(
        (r) => r.status === AttendanceStatus.EXCUSED,
      ).length;
      const attendedAnotherGroup = studentRecords.filter(
        (r) => r.status === AttendanceStatus.ATTENDED_ANOTHER_GROUP,
      ).length;

      return {
        studentId: item.studentId,
        fullName: item.student.user.fullName,
        present,
        absent,
        late,
        excused,
        attendedAnotherGroup,
        totalRecorded: studentRecords.length,
      };
    });

    // Students with highest absence (filter absent > 0 and sort descending)
    const highestAbsence = [...studentStats]
      .filter((s) => s.absent > 0)
      .sort((a, b) => b.absent - a.absent)
      .slice(0, 5);

    // Perfect attendance: absent == 0 and excused == 0 and totalRecorded == totalSessions (attended all classes)
    const perfectAttendance = studentStats.filter(
      (s) =>
        s.absent === 0 && s.excused === 0 && s.totalRecorded === totalSessions,
    );

    return {
      totalSessions,
      totalStudents,
      attendanceRate,
      highestAbsence,
      perfectAttendance,
      extraSessions,
    };
  }

  /**
   * Get attendance report for a specific student.
   */
  async getStudentReport(
    centerId: string,
    studentId: string,
    userRole: AppRole,
    userId: string,
  ) {
    let resolvedStudentId = studentId;
    if (studentId === 'me') {
      const currentStudent = await this.prisma.student.findUnique({
        where: { userId },
      });
      if (!currentStudent) {
        throw new NotFoundException('حساب الطالب المطلوب غير موجود.');
      }
      resolvedStudentId = currentStudent.id;
    }

    const student = await this.prisma.student.findUnique({
      where: { id: resolvedStudentId },
      include: {
        user: true,
      },
    });

    if (!student || student.user.centerId !== centerId) {
      throw new NotFoundException('الطالب المطلوب غير موجود.');
    }

    // Authorization check: students can only see their own report
    if (userRole === AppRole.STUDENT) {
      const currentStudent = await this.prisma.student.findUnique({
        where: { userId },
      });
      if (!currentStudent || currentStudent.id !== resolvedStudentId) {
        throw new ForbiddenException('ليس لديك صلاحية لعرض هذا التقرير.');
      }
    }

    let teacherId: string | undefined;
    if (userRole === AppRole.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!teacher) {
        throw new NotFoundException('حساب المعلم الحالي غير موجود.');
      }
      teacherId = teacher.id;

      const isTeached = await this.prisma.groupStudent.findFirst({
        where: {
          studentId: resolvedStudentId,
          centerId,
          group: {
            teacherId: teacher.id,
            centerId,
          },
        },
      });

      if (!isTeached) {
        throw new ForbiddenException(
          'ليس لديك صلاحية لعرض تقرير حضور طالب لا ينتمي لمجموعاتك.',
        );
      }
    }

    const records = await this.prisma.studentAttendance.findMany({
      where: {
        centerId,
        studentId: resolvedStudentId,
        session: teacherId
          ? {
              group: {
                teacherId,
                centerId,
              },
            }
          : undefined,
      },
      include: {
        session: {
          include: {
            group: {
              select: {
                name: true,
              },
            },
            extraSession: {
              select: {
                id: true,
                title: true,
                type: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: {
        session: {
          date: 'desc',
        },
      },
    });

    const regularRecords = records.filter(
      (r) => r.session.extraSessionId === null,
    );
    const extraRecords = records.filter(
      (r) =>
        r.session.extraSessionId !== null &&
        r.session.extraSession?.status !== ExtraSessionStatus.CANCELED,
    );

    const totalSessions = regularRecords.length;
    const present = regularRecords.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const absent = regularRecords.filter(
      (r) => r.status === AttendanceStatus.ABSENT,
    ).length;
    const late = regularRecords.filter(
      (r) => r.status === AttendanceStatus.LATE,
    ).length;
    const excused = regularRecords.filter(
      (r) => r.status === AttendanceStatus.EXCUSED,
    ).length;
    const attendedAnotherGroup = regularRecords.filter(
      (r) => r.status === AttendanceStatus.ATTENDED_ANOTHER_GROUP,
    ).length;

    const attendedCount = present + late + attendedAnotherGroup;
    const attendancePercentage =
      totalSessions > 0
        ? Math.round((attendedCount / totalSessions) * 100)
        : 100;

    const extraAttendedCount = extraRecords.filter(
      (r) =>
        r.status === AttendanceStatus.PRESENT ||
        r.status === AttendanceStatus.LATE ||
        r.status === AttendanceStatus.ATTENDED_ANOTHER_GROUP,
    ).length;
    const extraAbsentCount = extraRecords.filter(
      (r) => r.status === AttendanceStatus.ABSENT,
    ).length;

    const extraSessions = {
      total: extraRecords.length,
      attended: extraAttendedCount,
      absent: extraAbsentCount,
    };

    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
      },
      totalSessions,
      present,
      absent,
      late,
      excused,
      attendedAnotherGroup,
      attendancePercentage,
      extraSessions,
      history: records.map((r) => ({
        sessionId: r.sessionId,
        date: r.session.date,
        groupName: r.session.group.name,
        status: r.status,
        absenceReason: r.absenceReason,
        isExtraSession: !!r.session.extraSessionId,
      })),
    };
  }
}
