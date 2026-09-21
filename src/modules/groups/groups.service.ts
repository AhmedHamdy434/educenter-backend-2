import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppRole } from '../../common/enums/app-role.enum';
import {
  groupDetailsSelect,
  groupListSelect,
  GroupDetails,
  GroupListItem,
} from './constants/group.select';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupQueryDto } from './dto/get-groups.dto';
import { GroupStudentsDto } from './dto/group-students.dto';

import { ExcelService } from '../../shared/excel/excel.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelService: ExcelService,
  ) {}

  private getPrismaClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  /**
   * إنشاء مجموعة جديدة مع التحقق من صحة المدخلات.
   */
  async create(centerId: string, data: CreateGroupDto): Promise<GroupDetails> {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureGroupNameIsUnique(centerId, data.name, undefined, tx);
      await this.ensureGradeBelongsToCenter(centerId, data.gradeId, tx);
      await this.ensureSubjectBelongsToCenterAndGrade(
        centerId,
        data.gradeId,
        data.subjectId,
        tx,
      );
      await this.ensureTeacherBelongsToCenter(centerId, data.teacherId, tx);
      await this.ensureTeacherTeachesSubject(
        data.teacherId,
        data.subjectId,
        tx,
      );

      const group = await tx.group.create({
        data: {
          name: data.name,
          capacity: data.capacity,
          monthlyFee: data.monthlyFee,
          startDate: new Date(data.startDate),
          monthsCount: data.monthsCount,
          centerId,
          gradeId: data.gradeId,
          subjectId: data.subjectId,
          teacherId: data.teacherId,
          schedule: {
            createMany: {
              data: data.schedule.map((slot) => ({
                day: slot.day,
                hour: slot.hour,
                minute: slot.minute,
              })),
            },
          },
        },
      });

      return tx.group.findUnique({
        where: { id: group.id },
        select: groupDetailsSelect,
      }) as unknown as GroupDetails;
    });
  }

  /**
   * جلب قائمة المجموعات مع البحث والتصفية بحسب الصلاحيات.
   */
  async findAll(
    centerId: string,
    query: GroupQueryDto,
    currentUserRole: AppRole,
    currentUserId: string,
  ): Promise<{ data: GroupListItem[]; meta: any }> {
    const { skip, take, active, gradeId, subjectId, teacherId } = query;
    const where = query.getWhere<Prisma.GroupWhereInput>(['name']);

    where.centerId = centerId;

    if (active !== undefined) {
      where.isActive = active;
    }
    if (gradeId) {
      where.gradeId = gradeId;
    }
    if (subjectId) {
      where.subjectId = subjectId;
    }
    if (teacherId) {
      where.teacherId = teacherId;
    }

    // تطبيق فلترة الصلاحيات
    if (currentUserRole === AppRole.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId: currentUserId },
      });
      if (!teacher) {
        throw new NotFoundException('حساب المعلم الحالي غير موجود.');
      }
      where.teacherId = teacher.id;
    } else if (currentUserRole === AppRole.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { userId: currentUserId },
      });
      if (!student) {
        throw new NotFoundException('حساب الطالب الحالي غير موجود.');
      }
      where.students = {
        some: {
          studentId: student.id,
        },
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.group.count({ where }),
      this.prisma.group.findMany({
        where,
        skip,
        take,
        select: groupListSelect,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);
    return { data, meta };
  }

  /**
   * جلب تفاصيل مجموعة معينة مع التحقق من الصلاحيات.
   */
  async findOne(
    centerId: string,
    id: string,
    currentUserRole: AppRole,
    currentUserId: string,
  ): Promise<GroupDetails> {
    const group = await this.prisma.group.findFirst({
      where: { id, centerId },
      select: groupDetailsSelect,
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    // التحقق من الصلاحيات بناءً على الدور
    if (currentUserRole === AppRole.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId: currentUserId },
      });
      if (!teacher || group.teacherId !== teacher.id) {
        throw new ForbiddenException(
          'ليس لديك صلاحية للوصول إلى هذه المجموعة.',
        );
      }
    } else if (currentUserRole === AppRole.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { userId: currentUserId },
      });
      if (
        !student ||
        !group.students.some((s) => s.student.id === student.id)
      ) {
        throw new ForbiddenException(
          'ليس لديك صلاحية للوصول إلى هذه المجموعة.',
        );
      }
    }

    return group;
  }

  /**
   * تحديث بيانات المجموعة والمواعيد.
   */
  async update(
    centerId: string,
    id: string,
    data: UpdateGroupDto,
  ): Promise<GroupDetails> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.group.findFirst({
        where: { id, centerId },
      });
      if (!current) {
        throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
      }

      const finalGradeId = data.gradeId ?? current.gradeId;
      if (data.gradeId && data.gradeId !== current.gradeId) {
        await this.ensureGradeBelongsToCenter(centerId, finalGradeId, tx);
      }

      const finalSubjectId = data.subjectId ?? current.subjectId;
      if (
        (data.subjectId && data.subjectId !== current.subjectId) ||
        (data.gradeId && data.gradeId !== current.gradeId)
      ) {
        await this.ensureSubjectBelongsToCenterAndGrade(
          centerId,
          finalGradeId,
          finalSubjectId,
          tx,
        );
      }

      const finalTeacherId = data.teacherId ?? current.teacherId;
      if (data.teacherId && data.teacherId !== current.teacherId) {
        await this.ensureTeacherBelongsToCenter(centerId, finalTeacherId, tx);
      }

      if (data.name && data.name !== current.name) {
        await this.ensureGroupNameIsUnique(centerId, data.name, id, tx);
      }

      // التحقق من أن المعلم يدرس المادة المحددة في حال تغير أي منهما
      if (data.teacherId || data.subjectId || data.gradeId) {
        await this.ensureTeacherTeachesSubject(
          finalTeacherId,
          finalSubjectId,
          tx,
        );
      }

      // تحديث المواعيد إن وجدت
      if (data.schedule) {
        await tx.groupSchedule.deleteMany({ where: { groupId: id } });
      }

      await tx.group.update({
        where: { id },
        data: {
          name: data.name,
          capacity: data.capacity,
          monthlyFee: data.monthlyFee,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          monthsCount: data.monthsCount,
          isActive: data.isActive,
          gradeId: data.gradeId,
          subjectId: data.subjectId,
          teacherId: data.teacherId,
          schedule: data.schedule
            ? {
                createMany: {
                  data: data.schedule.map((slot) => ({
                    day: slot.day,
                    hour: slot.hour,
                    minute: slot.minute,
                  })),
                },
              }
            : undefined,
        },
      });

      return tx.group.findUnique({
        where: { id },
        select: groupDetailsSelect,
      }) as unknown as GroupDetails;
    });
  }

  /**
   * تبديل حالة نشاط المجموعة.
   */
  async toggleStatus(centerId: string, id: string): Promise<GroupDetails> {
    const current = await this.prisma.group.findFirst({
      where: { id, centerId },
    });
    if (!current) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }
    return this.prisma.group.update({
      where: { id },
      data: { isActive: !current.isActive },
      select: groupDetailsSelect,
    });
  }

  /**
   * إضافة طلاب للمجموعة مع التحقق من السعة الاستيعابية والمرحلة الدراسية.
   */
  async addStudents(
    centerId: string,
    id: string,
    data: GroupStudentsDto,
  ): Promise<GroupDetails> {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.findFirst({
        where: { id, centerId },
      });
      if (!group) {
        throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
      }

      // التحقق من صحة وجود الطلاب في نفس المركز والمرحلة الدراسية للمجموعة
      const students = await tx.student.findMany({
        where: {
          id: { in: data.studentIds },
          user: { centerId },
          enrollments: {
            some: {
              gradeId: group.gradeId,
              isActive: true,
            },
          },
        },
      });

      if (students.length !== data.studentIds.length) {
        throw new BadRequestException(
          'بعض الطلاب المحددين غير مسجلين في المركز، أو ليسوا مسجلين في نفس المرحلة الدراسية للمجموعة.',
        );
      }

      // فلترة الطلاب المسجلين بالفعل في هذه المجموعة لتجنب الأخطاء
      const existingGroupStudents = await tx.groupStudent.findMany({
        where: {
          groupId: id,
          studentId: { in: data.studentIds },
        },
        select: { studentId: true },
      });

      const existingIds = new Set(
        existingGroupStudents.map((egs) => egs.studentId),
      );
      const newStudentIds = data.studentIds.filter(
        (sid) => !existingIds.has(sid),
      );

      if (newStudentIds.length > 0) {
        // التحقق من السعة الاستيعابية إن وجدت
        if (group.capacity !== null) {
          const currentCount = await tx.groupStudent.count({
            where: { groupId: id },
          });
          if (currentCount + newStudentIds.length > group.capacity) {
            throw new BadRequestException(
              `لا يمكن إضافة الطلاب المحددين. السعة المتبقية هي ${
                group.capacity - currentCount
              } طلاب فقط.`,
            );
          }
        }

        const subscriptionStartDate = data.subscriptionStartDate
          ? new Date(data.subscriptionStartDate)
          : new Date();

        await tx.groupStudent.createMany({
          data: newStudentIds.map((sid) => ({
            groupId: id,
            studentId: sid,
            centerId,
            subscriptionStartDate,
          })),
        });
      }

      return tx.group.findUnique({
        where: { id },
        select: groupDetailsSelect,
      }) as unknown as GroupDetails;
    });
  }

  /**
   * إزالة طلاب من المجموعة.
   */
  async removeStudents(
    centerId: string,
    id: string,
    data: GroupStudentsDto,
  ): Promise<GroupDetails> {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.findFirst({
        where: { id, centerId },
      });
      if (!group) {
        throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
      }

      await tx.groupStudent.deleteMany({
        where: {
          groupId: id,
          studentId: { in: data.studentIds },
        },
      });

      return tx.group.findUnique({
        where: { id },
        select: groupDetailsSelect,
      }) as unknown as GroupDetails;
    });
  }

  /**
   * حذف المجموعة بالكامل.
   */
  async remove(centerId: string, id: string): Promise<void> {
    const group = await this.prisma.group.findFirst({
      where: { id, centerId },
    });
    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }
    await this.prisma.group.delete({
      where: { id },
    });
  }

  // ==========================================
  // مُساعدات التحقق والتوكيد (Private Helpers)
  // ==========================================

  private async ensureGroupNameIsUnique(
    centerId: string,
    name: string,
    excludeGroupId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getPrismaClient(tx);
    const existing = await client.group.findFirst({
      where: {
        centerId,
        name: { equals: name, mode: 'insensitive' },
        NOT: excludeGroupId ? { id: excludeGroupId } : undefined,
      },
    });

    if (existing) {
      throw new ConflictException(
        'اسم المجموعة الدراسية مستخدم بالفعل في هذا المركز.',
      );
    }
  }

  private async ensureGradeBelongsToCenter(
    centerId: string,
    gradeId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getPrismaClient(tx);
    const grade = await client.grade.findFirst({
      where: { id: gradeId, centerId },
    });

    if (!grade) {
      throw new NotFoundException('المرحلة الدراسية المحددة غير موجودة.');
    }
    if (!grade.isActive) {
      throw new BadRequestException('المرحلة الدراسية المحددة معطلة حالياً.');
    }
  }

  private async ensureSubjectBelongsToCenterAndGrade(
    centerId: string,
    gradeId: string,
    subjectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getPrismaClient(tx);
    const subject = await client.subject.findFirst({
      where: { id: subjectId, centerId, gradeId },
    });

    if (!subject) {
      throw new NotFoundException(
        'المادة الدراسية المحددة غير موجودة أو لا تتبع للمرحلة المختارة.',
      );
    }
    if (!subject.isActive) {
      throw new BadRequestException('المادة الدراسية المحددة معطلة حالياً.');
    }
  }

  private async ensureTeacherBelongsToCenter(
    centerId: string,
    teacherId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getPrismaClient(tx);
    const teacher = await client.teacher.findFirst({
      where: { id: teacherId, user: { centerId } },
    });

    if (!teacher) {
      throw new NotFoundException('المعلم المحدد غير موجود في هذا المركز.');
    }
  }

  private async ensureTeacherTeachesSubject(
    teacherId: string,
    subjectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getPrismaClient(tx);
    const teacherSubject = await client.teacherSubject.findUnique({
      where: {
        teacherId_subjectId: {
          teacherId,
          subjectId,
        },
      },
    });

    if (!teacherSubject) {
      throw new BadRequestException(
        'المعلم المحدد غير مخصص لتدريس هذه المادة الدراسية.',
      );
    }
  }

  /**
   * تصدير المجموعات الدراسية إلى ملف Excel مع حصر الصلاحيات وتنسيق المواعيد.
   */
  async exportToExcel(
    centerId: string,
    query: GroupQueryDto,
    currentUserRole: AppRole,
    currentUserId: string,
  ): Promise<Buffer> {
    const { active, gradeId, subjectId, teacherId } = query;
    const where = query.getWhere<Prisma.GroupWhereInput>(['name']);
    where.centerId = centerId;

    if (active !== undefined) where.isActive = active;
    if (gradeId) where.gradeId = gradeId;
    if (subjectId) where.subjectId = subjectId;
    if (teacherId) where.teacherId = teacherId;

    if (currentUserRole === AppRole.TEACHER) {
      where.teacher = { userId: currentUserId };
    } else if (currentUserRole === AppRole.STUDENT) {
      where.students = { some: { student: { userId: currentUserId } } };
    }

    const orderBy = query.getOrderBy<
      | Prisma.GroupOrderByWithRelationInput
      | Prisma.GroupOrderByWithRelationInput[]
    >(['name', 'capacity', 'monthlyFee', 'startDate', 'createdAt'], {
      createdAt: 'desc',
    });

    const groups = await this.prisma.group.findMany({
      where,
      orderBy,
      select: {
        name: true,
        capacity: true,
        monthlyFee: true,
        startDate: true,
        isActive: true,
        grade: { select: { name: true } },
        subject: { select: { name: true } },
        teacher: { select: { user: { select: { fullName: true } } } },
        schedule: { select: { day: true, hour: true, minute: true } },
        _count: { select: { students: true } },
      },
    });

    const DAY_NAMES: Record<string, string> = {
      SUNDAY: 'الأحد',
      MONDAY: 'الإثنين',
      TUESDAY: 'الثلاثاء',
      WEDNESDAY: 'الأربعاء',
      THURSDAY: 'الخميس',
      FRIDAY: 'الجمعة',
      SATURDAY: 'السبت',
    };

    const exportRows = groups.map((g) => {
      const scheduleStr =
        g.schedule.length > 0
          ? g.schedule
              .map((s) => {
                const day = DAY_NAMES[s.day] || s.day;
                const hh = s.hour.toString().padStart(2, '0');
                const mm = s.minute.toString().padStart(2, '0');
                return `${day} (${hh}:${mm})`;
              })
              .join(' | ')
          : '—';

      return {
        name: g.name,
        gradeName: g.grade?.name || '—',
        subjectName: g.subject?.name || '—',
        teacherName: g.teacher?.user?.fullName || '—',
        monthlyFee: Number(g.monthlyFee).toFixed(2),
        studentsCount: g._count?.students || 0,
        capacity: g.capacity ? String(g.capacity) : 'غير محدد',
        schedule: scheduleStr,
        status: g.isActive ? 'نشط' : 'معطل',
        startDate: g.startDate
          ? new Date(g.startDate).toISOString().split('T')[0]
          : '—',
      };
    });

    return this.excelService.buildWorkbookBuffer({
      sheetName: 'المجموعات الدراسية',
      columns: [
        { header: 'اسم المجموعة', key: 'name', width: 25 },
        { header: 'المرحلة الدراسية', key: 'gradeName', width: 22 },
        { header: 'المادة الدراسية', key: 'subjectName', width: 20 },
        { header: 'المعلم', key: 'teacherName', width: 22 },
        { header: 'الاشتراك الشهري', key: 'monthlyFee', width: 16 },
        { header: 'عدد الطلاب المسجلين', key: 'studentsCount', width: 18 },
        { header: 'السعة القصوى', key: 'capacity', width: 14 },
        { header: 'مواعيد الحصص الأسبوعية', key: 'schedule', width: 35 },
        { header: 'الحالة', key: 'status', width: 12 },
        { header: 'تاريخ البدء', key: 'startDate', width: 16 },
      ],
      data: exportRows,
    });
  }
}
