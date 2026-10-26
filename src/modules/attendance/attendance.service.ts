import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppRole } from '../../common/enums/app-role.enum';
import { SaveAttendanceDto } from './dto/save-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normalize date to midnight UTC of the current server time.
   */
  private getTodayMidnightUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
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
   * Start or retrieve today's attendance session for a group.
   */
  async startOrGetSession(
    centerId: string,
    groupId: string,
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
        'لا يمكن بدء جلسة حضور لمجموعة دراسية غير نشطة.',
      );
    }

    const date = this.getTodayMidnightUtc();

    // Check if session already exists for today
    let session = await this.prisma.attendanceSession.findUnique({
      where: {
        groupId_date: {
          groupId,
          date,
        },
      },
    });

    if (!session) {
      session = await this.prisma.attendanceSession.create({
        data: {
          groupId,
          centerId,
          date,
        },
      });
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
    });

    if (!session) {
      throw new NotFoundException('جلسة تحضير الحضور المطلوبة غير موجودة.');
    }

    // Get all active students enrolled in this group
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

    // Get recorded attendance for this session
    const attendanceRecords = await this.prisma.studentAttendance.findMany({
      where: { sessionId },
    });

    const recordsMap = new Map(attendanceRecords.map((r) => [r.studentId, r]));

    const students = enrolledStudents.map((item) => {
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

    // Verify all students are enrolled in this group
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

    // Upsert attendance records inside a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const record of dto.records) {
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
            absenceReason: record.absenceReason || null,
          },
          update: {
            status: record.status,
            absenceReason: record.absenceReason || null,
          },
        });
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

    return this.prisma.attendanceSession.findMany({
      where: { groupId, centerId },
      include: {
        _count: {
          select: { records: true },
        },
      },
      orderBy: { date: 'desc' },
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

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { groupId, centerId },
      select: { id: true },
    });

    const sessionIds = sessions.map((s) => s.id);
    const totalSessions = sessionIds.length;

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
      };
    }

    const allRecords = await this.prisma.studentAttendance.findMany({
      where: { sessionId: { in: sessionIds } },
    });

    const totalRecords = allRecords.length;
    const presentOrLateCount = allRecords.filter(
      (r) =>
        r.status === AttendanceStatus.PRESENT ||
        r.status === AttendanceStatus.LATE,
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

      return {
        studentId: item.studentId,
        fullName: item.student.user.fullName,
        present,
        absent,
        late,
        excused,
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
          },
        },
      },
      orderBy: {
        session: {
          date: 'desc',
        },
      },
    });

    const totalSessions = records.length;
    const present = records.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const absent = records.filter(
      (r) => r.status === AttendanceStatus.ABSENT,
    ).length;
    const late = records.filter(
      (r) => r.status === AttendanceStatus.LATE,
    ).length;
    const excused = records.filter(
      (r) => r.status === AttendanceStatus.EXCUSED,
    ).length;

    const attendedCount = present + late;
    const attendancePercentage =
      totalSessions > 0
        ? Math.round((attendedCount / totalSessions) * 100)
        : 100;

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
      attendancePercentage,
      history: records.map((r) => ({
        sessionId: r.sessionId,
        date: r.session.date,
        groupName: r.session.group.name,
        status: r.status,
        absenceReason: r.absenceReason,
      })),
    };
  }
}
