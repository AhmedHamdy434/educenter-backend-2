import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta, PaginationMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppRole } from '../../common/enums/app-role.enum';
import {
  groupDetailsSelect,
  groupEnrolledStudentSelect,
  groupListSelect,
  GroupDetails,
  GroupEnrolledStudent,
  GroupListItem,
  groupDetails,
} from './constants/group.select';
import {
  studentListSelect,
  StudentListItem,
} from '../students/constants/student.select';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupQueryDto } from './dto/get-groups.dto';
import { GroupStudentsQueryDto } from './dto/get-group-students.dto';
import { GroupStudentsDto } from './dto/group-students.dto';

import type { Response } from 'express';
import { ExcelService } from '../../shared/excel/excel.service';
import { PdfService } from '../../shared/pdf/pdf.service';
import {
  ExcelImportSummary,
  RowValidationError,
} from '../../shared/excel/interfaces/excel.interface';
import { normalizeArabicText } from '../../shared/excel/utils/arabic-normalizer.util';

const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME_TYPE = 'application/pdf';

const GROUP_RELATION_COUNT_FIELDS = ['students'];

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelService: ExcelService,
    private readonly pdfService: PdfService,
  ) {}

  private getPrismaClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  /**
   * إنشاء مجموعة جديدة مع التحقق من صحة المدخلات.
   */
  async create(centerId: string, data: CreateGroupDto): Promise<GroupListItem> {
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
        select: groupListSelect,
      }) as unknown as GroupListItem;
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

    const orderBy = query.getOrderBy<
      | Prisma.GroupOrderByWithRelationInput
      | Prisma.GroupOrderByWithRelationInput[]
    >(
      ['name', 'capacity', 'monthlyFee', 'startDate', 'createdAt'],
      [{ createdAt: 'desc' }],
      GROUP_RELATION_COUNT_FIELDS,
    );

    const [total, data] = await Promise.all([
      this.prisma.group.count({ where }),
      this.prisma.group.findMany({
        where,
        skip,
        take,
        select: groupListSelect,
        orderBy,
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
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id, centerId },
      select: groupDetails,
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
      const isEnrolled = await this.prisma.groupStudent.findFirst({
        where: {
          groupId: id,
          student: {
            userId: currentUserId,
          },
        },
        select: {
          id: true,
        },
      });

      if (!isEnrolled) {
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
  ): Promise<GroupListItem> {
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
        select: groupListSelect,
      }) as unknown as GroupListItem;
    });
  }

  /**
   * تبديل حالة نشاط المجموعة.
   */
  async toggleStatus(centerId: string, id: string): Promise<GroupListItem> {
    const current = await this.prisma.group.findFirst({
      where: { id, centerId },
    });
    if (!current) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }
    return this.prisma.group.update({
      where: { id },
      data: { isActive: !current.isActive },
      select: groupListSelect,
    });
  }

  /**
   * دالة مساعدة خاصة للتحقق من وجود المجموعة وصلاحية المستخدم للوصول إليها.
   */
  private async getGroupWithAccessCheck(
    centerId: string,
    id: string,
    currentUserRole: AppRole,
    currentUserId: string,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id, centerId },
      select: {
        id: true,
        name: true,
        gradeId: true,
        teacherId: true,
        capacity: true,
        isActive: true,
      },
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    if (currentUserRole === AppRole.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId: currentUserId },
        select: { id: true },
      });

      if (!teacher || group.teacherId !== teacher.id) {
        throw new ForbiddenException(
          'ليس لديك صلاحية للوصول إلى هذه المجموعة الدراسية.',
        );
      }
    } else if (currentUserRole === AppRole.STUDENT) {
      throw new ForbiddenException(
        'ليس لديك صلاحية للوصول إلى طلاب هذه المجموعة الدراسية.',
      );
    }

    return group;
  }

  /**
   * جلب الطلاب المسجلين في المجموعة الدراسية مع دعم التصفح والترتيب والبحث.
   */
  async findStudents(
    centerId: string,
    id: string,
    currentUserRole: AppRole,
    currentUserId: string,
    query: GroupStudentsQueryDto,
  ): Promise<{ data: GroupEnrolledStudent[]; meta: PaginationMeta }> {
    await this.getGroupWithAccessCheck(
      centerId,
      id,
      currentUserRole,
      currentUserId,
    );

    const { skip, take } = query;
    const where: Prisma.GroupStudentWhereInput = {
      groupId: id,
      centerId,
      ...(query.search
        ? {
            student: {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { parentPhone: { contains: query.search } },
                {
                  user: {
                    OR: [
                      {
                        fullName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      { phone: { contains: query.search } },
                      {
                        email: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          }
        : {}),
    };

    const orderBy = query.getOrderBy<
      | Prisma.GroupStudentOrderByWithRelationInput
      | Prisma.GroupStudentOrderByWithRelationInput[]
    >(['joinedAt', 'subscriptionStartDate', 'name'], [{ joinedAt: 'desc' }]);

    const [total, data] = await Promise.all([
      this.prisma.groupStudent.count({ where }),
      this.prisma.groupStudent.findMany({
        where,
        skip,
        take,
        select: groupEnrolledStudentSelect,
        orderBy,
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);
    return { data, meta };
  }

  /**
   * جلب الطلاب المؤهلين للتسجيل في المجموعة:
   * - ينتمون لنفس المركز
   * - مسجلون ونشطون في نفس المرحلة الدراسية للمجموعة
   * - حساباتهم نشطة
   * - غير مسجلين في هذه المجموعة حالياً
   */
  async findStudentsNotEnrolled(
    centerId: string,
    id: string,
    currentUserRole: AppRole,
    currentUserId: string,
    search?: string,
  ): Promise<StudentListItem[]> {
    const group = await this.getGroupWithAccessCheck(
      centerId,
      id,
      currentUserRole,
      currentUserId,
    );

    if (!group.isActive) {
      throw new BadRequestException(
        'لا يمكن إضافة طلاب إلى مجموعة دراسية معطلة.',
      );
    }

    const where: Prisma.StudentWhereInput = {
      centerId,
      user: {
        isActive: true,
      },
      enrollments: {
        some: {
          gradeId: group.gradeId,
          isActive: true,
        },
      },
      groups: {
        none: {
          groupId: id,
        },
      },
    };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { parentPhone: { contains: search } },
        {
          user: {
            fullName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          user: {
            phone: { contains: search },
          },
        },
      ];
    }

    return this.prisma.student.findMany({
      where,
      select: studentListSelect,
      orderBy: {
        user: { fullName: 'asc' },
      },
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

      if (!group.isActive) {
        throw new BadRequestException(
          'لا يمكن إضافة طلاب إلى مجموعة دراسية معطلة.',
        );
      }

      // التحقق من صحة وجود الطلاب ونشاطهم في نفس المركز والمرحلة الدراسية للمجموعة
      const students = await tx.student.findMany({
        where: {
          id: { in: data.studentIds },
          user: { centerId, isActive: true },
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
          'بعض الطلاب المحددين غير مسجلين في المركز، أو حساباتهم معطلة، أو ليسوا مسجلين في نفس المرحلة الدراسية للمجموعة.',
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

      const paymentsCount = await tx.monthlyPayment.count({
        where: {
          centerId,
          groupStudent: {
            groupId: id,
            studentId: { in: data.studentIds },
          },
        },
      });

      if (paymentsCount > 0) {
        throw new BadRequestException(
          'لا يمكن إزالة الطالب من المجموعة لوجود سجلات مدفوعات مالية مرتبطة به في هذه المجموعة.',
        );
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
      select: groupDetailsSelect,
    });
    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }
    if (
      group._count.students > 0 ||
      (group._count.attendanceSessions && group._count.attendanceSessions > 0)
    ) {
      throw new BadRequestException(
        'لا يمكن حذف المجموعة لوجود طلاب أو جلسات حضور مرتبطة بها.',
      );
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
      select: {
        id: true,
        user: { select: { isActive: true } },
      },
    });

    if (!teacher) {
      throw new NotFoundException('المعلم المحدد غير موجود في هذا المركز.');
    }

    if (!teacher.user.isActive) {
      throw new BadRequestException('حساب المعلم المحدد معطل حالياً.');
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
   * إرسال ملف للعميل عبر Response مع الهيدرز المناسبة.
   */
  private sendFileDownload(
    res: Response,
    buffer: Buffer,
    filename: string,
    contentType: string,
  ): void {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * جلب وتجهيز بيانات المجموعات الدراسية للمركز بصيغة مصفوفة مهيأة للتصدير (Excel / PDF).
   */
  private async getExportDataset(
    centerId: string,
    query: GroupQueryDto,
    currentUserRole: AppRole,
    currentUserId: string,
  ) {
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
    >(
      ['name', 'capacity', 'monthlyFee', 'startDate', 'createdAt'],
      [{ createdAt: 'desc' }],
      GROUP_RELATION_COUNT_FIELDS,
    );

    const groups = await this.prisma.group.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
        capacity: true,
        monthlyFee: true,
        startDate: true,
        isActive: true,
        gradeId: true,
        subjectId: true,
        teacherId: true,
        grade: { select: { name: true } },
        subject: { select: { name: true } },
        teacher: { select: { user: { select: { fullName: true } } } },
        schedule: { select: { day: true, hour: true, minute: true } },
        _count: { select: { students: true } },
        createdAt: true,
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

    const dateStr = new Date().toISOString().split('T')[0];

    const rows = groups.map((g) => {
      const scheduleStr =
        g.schedule && g.schedule.length > 0
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
        id: g.id,
        name: g.name,
        gradeId: g.gradeId,
        gradeName: g.grade?.name || '—',
        subjectId: g.subjectId,
        subjectName: g.subject?.name || '—',
        teacherId: g.teacherId,
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

    return { rows, dateStr };
  }

  /**
   * تصدير المجموعات الدراسية إلى ملف Excel مع حصر الصلاحيات وتنسيق المواعيد ومعرفات الكيانات.
   */
  async exportToExcel(
    centerId: string,
    query: GroupQueryDto,
    currentUserRole: AppRole,
    currentUserId: string,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(
      centerId,
      query,
      currentUserRole,
      currentUserId,
    );

    const buffer = await this.excelService.buildWorkbookBuffer({
      sheetName: 'المجموعات الدراسية',
      columns: [
        {
          header: 'معرف المجموعة (Group ID)',
          key: 'id',
          width: 32,
          numFmt: '@',
        },
        { header: 'اسم المجموعة', key: 'name', width: 25 },
        {
          header: 'معرف المرحلة (Grade ID)',
          key: 'gradeId',
          width: 32,
          numFmt: '@',
        },
        { header: 'المرحلة الدراسية', key: 'gradeName', width: 22 },
        {
          header: 'معرف المادة (Subject ID)',
          key: 'subjectId',
          width: 32,
          numFmt: '@',
        },
        { header: 'المادة الدراسية', key: 'subjectName', width: 20 },
        {
          header: 'معرف المدرس (Teacher ID)',
          key: 'teacherId',
          width: 32,
          numFmt: '@',
        },
        { header: 'المعلم', key: 'teacherName', width: 22 },
        { header: 'الاشتراك الشهري', key: 'monthlyFee', width: 16 },
        { header: 'عدد الطلاب المسجلين', key: 'studentsCount', width: 18 },
        { header: 'السعة القصوى', key: 'capacity', width: 14 },
        { header: 'مواعيد الحصص الأسبوعية', key: 'schedule', width: 35 },
        { header: 'الحالة', key: 'status', width: 12 },
        { header: 'تاريخ البدء', key: 'startDate', width: 16 },
      ],
      data: rows,
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        `groups-${dateStr}.xlsx`,
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تصدير المجموعات الدراسية إلى ملف PDF مع حصر الصلاحيات وتنسيق المواعيد.
   */
  async exportToPdf(
    centerId: string,
    query: GroupQueryDto,
    currentUserRole: AppRole,
    currentUserId: string,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(
      centerId,
      query,
      currentUserRole,
      currentUserId,
    );

    const buffer = await this.pdfService.buildTablePdfBuffer({
      title: 'تقرير المجموعات الدراسية',
      dateStr,
      columns: [
        { header: 'اسم المجموعة', key: 'name', width: '*', align: 'right' },
        { header: 'المرحلة', key: 'gradeName', width: 70, align: 'right' },
        { header: 'المادة', key: 'subjectName', width: 70, align: 'right' },
        { header: 'المعلم', key: 'teacherName', width: 80, align: 'right' },
        { header: 'الطلاب', key: 'studentsCount', width: 40, align: 'center' },
        { header: 'السعة', key: 'capacity', width: 40, align: 'center' },
        { header: 'الاشتراك', key: 'monthlyFee', width: 50, align: 'center' },
        { header: 'المواعيد', key: 'schedule', width: 110, align: 'right' },
        { header: 'الحالة', key: 'status', width: 40, align: 'center' },
      ],
      data: rows,
      orientation: 'landscape',
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        `groups-${dateStr}.pdf`,
        PDF_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد بيانات المجموعات الدراسية مع الجداول المرجعية (ID | Name).
   */
  async getImportTemplate(
    centerId: string,
    res?: Response,
  ): Promise<Buffer | void> {
    const [grades, subjects, teachers] = await Promise.all([
      this.prisma.grade.findMany({
        where: { centerId, isActive: true },
        select: { id: true, name: true },
        orderBy: { order: 'asc' },
      }),
      this.prisma.subject.findMany({
        where: { centerId, isActive: true },
        select: { id: true, name: true, grade: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.teacher.findMany({
        where: { centerId, user: { isActive: true } },
        select: {
          id: true,
          user: { select: { fullName: true } },
          subjects: { select: { subject: { select: { name: true } } } },
        },
        orderBy: { user: { fullName: 'asc' } },
      }),
    ]);

    const exampleGradeId = grades[0]?.id || 'grade_id_here';
    const exampleGradeName = grades[0]?.name || 'الصف الأول الثانوي';
    const exampleSubjectId = subjects[0]?.id || 'subject_id_here';
    const exampleSubjectName = subjects[0]?.name || 'لغة عربية';
    const exampleTeacherId = teachers[0]?.id || 'teacher_id_here';
    const exampleTeacherName = teachers[0]?.user.fullName || 'أحمد محمد';

    const buffer = await this.excelService.buildTemplateBuffer({
      dataSheetName: 'بيانات المجموعات',
      instructionsSheetName: 'دليل الاستيراد',
      columns: [
        {
          header: 'اسم المجموعة',
          key: 'name',
          width: 25,
          example: 'مجموعة النخبة أ',
        },
        {
          header: 'معرف المرحلة (Grade ID)',
          key: 'gradeId',
          width: 32,
          numFmt: '@',
          example: exampleGradeId,
        },
        {
          header: 'المرحلة الدراسية (للتوضيح)',
          key: 'gradeName',
          width: 22,
          example: exampleGradeName,
        },
        {
          header: 'معرف المادة (Subject ID)',
          key: 'subjectId',
          width: 32,
          numFmt: '@',
          example: exampleSubjectId,
        },
        {
          header: 'المادة الدراسية (للتوضيح)',
          key: 'subjectName',
          width: 22,
          example: exampleSubjectName,
        },
        {
          header: 'معرف المدرس (Teacher ID)',
          key: 'teacherId',
          width: 32,
          numFmt: '@',
          example: exampleTeacherId,
        },
        {
          header: 'اسم المدرس (للتوضيح)',
          key: 'teacherName',
          width: 25,
          example: exampleTeacherName,
        },
        {
          header: 'الاشتراك الشهري',
          key: 'monthlyFee',
          width: 18,
          example: 250,
        },
        {
          header: 'السعة الاستيعابية',
          key: 'capacity',
          width: 18,
          example: 30,
        },
        {
          header: 'عدد الأشهر',
          key: 'monthsCount',
          width: 14,
          example: 9,
        },
      ],
      sampleRows: [
        {
          name: 'مجموعة النخبة أ',
          gradeId: exampleGradeId,
          gradeName: exampleGradeName,
          subjectId: exampleSubjectId,
          subjectName: exampleSubjectName,
          teacherId: exampleTeacherId,
          teacherName: exampleTeacherName,
          monthlyFee: 250,
          capacity: 30,
          monthsCount: 9,
        },
      ],
      instructions: [
        'الحقول الإلزامية هي: (اسم المجموعة، معرف المرحلة Grade ID، معرف المادة Subject ID، معرف المدرس Teacher ID، الاشتراك الشهري).',
        'يجب نسخ المعرفات المعتمدة (Grade ID, Subject ID, Teacher ID) من ورقة "دليل الاستيراد" ولصقها في الأعمدة المخصصة لها.',
        'أعمدة الأسماء (للتوضيح) اختيارية فقط ولا يتم الاعتماد عليها في التحقق أو الربط الفعلي.',
        'اسم المجموعة يجب أن يكون فريداً داخل المركز.',
        'يجب أن تنتمي المادة الدراسية إلى المرحلة الدراسية المحددة.',
        'يجب أن يكون المعلم مخصصاً لتدريس المادة الدراسية المختارة.',
        'الاشتراك الشهري يجب أن يكون رقماً أكبر من أو يساوي 0.',
        'السعة الاستيعابية وعدد الأشهر اختيارية (القيمة الافتراضية لعدد الأشهر هي 1).',
        'يرجى عدم تعديل أو حذف صف العناوين في ورقة بيانات المجموعات.',
      ],
      referenceTables: [
        {
          title: 'المراحل الدراسية المتاحة والمعتمدة (Grade IDs)',
          headers: ['معرف المرحلة (Grade ID - للنسخ)', 'اسم المرحلة الدراسية'],
          rows:
            grades.length > 0
              ? grades.map((g) => ({ id: g.id, name: g.name }))
              : [{ id: 'لا يوجد', name: 'لا توجد مراحل مسجلة حالياً' }],
        },
        {
          title: 'المواد الدراسية المتاحة والمعتمدة (Subject IDs)',
          headers: [
            'معرف المادة (Subject ID - للنسخ)',
            'اسم المادة والمرحلة التابعة لها',
          ],
          rows:
            subjects.length > 0
              ? subjects.map((s) => ({
                  id: s.id,
                  name: s.grade ? `${s.name} (${s.grade.name})` : s.name,
                }))
              : [{ id: 'لا يوجد', name: 'لا توجد مواد مسجلة حالياً' }],
        },
        {
          title: 'المدرسين المتاحين والمعتمدين (Teacher IDs)',
          headers: [
            'معرف المدرس (Teacher ID - للنسخ)',
            'اسم المدرس والمواد المخصصة له',
          ],
          rows:
            teachers.length > 0
              ? teachers.map((t) => {
                  const subjectList = t.subjects
                    .map((s) => s.subject.name)
                    .join('، ');
                  return {
                    id: t.id,
                    name: subjectList
                      ? `${t.user.fullName} [${subjectList}]`
                      : t.user.fullName,
                  };
                })
              : [{ id: 'لا يوجد', name: 'لا يوجد مدرسين مسجلين حالياً' }],
        },
      ],
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        'groups-template.xlsx',
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * استيراد المجموعات الدراسية من ملف Excel المرفوع اعتماداً على المعرفات الصريحة (IDs).
   */
  async importFromExcel(
    centerId: string,
    fileBuffer: Buffer,
    dryRun = false,
  ): Promise<
    ExcelImportSummary<{
      name: string;
      gradeId: string;
      gradeName: string;
      subjectId: string;
      subjectName: string;
      teacherId: string;
      teacherName: string;
      monthlyFee: number;
    }>
  > {
    const { rows } = await this.excelService.parseSheetRows(fileBuffer, {
      expectedHeaders: ['اسم المجموعة', 'الاشتراك الشهري'],
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'ملف Excel لا يحتوي على أي صفوف بيانات للاستيراد.',
      );
    }

    const [centerGrades, centerSubjects, centerTeachers, existingGroups] =
      await Promise.all([
        this.prisma.grade.findMany({
          where: { centerId, isActive: true },
          select: { id: true, name: true },
        }),
        this.prisma.subject.findMany({
          where: { centerId, isActive: true, grade: { isActive: true } },
          select: { id: true, name: true, gradeId: true },
        }),
        this.prisma.teacher.findMany({
          where: { centerId, user: { isActive: true } },
          select: {
            id: true,
            user: { select: { fullName: true } },
            subjects: { select: { subjectId: true } },
          },
        }),
        this.prisma.group.findMany({
          where: { centerId },
          select: { name: true },
        }),
      ]);

    const gradeMap = new Map<string, { id: string; name: string }>();
    for (const g of centerGrades) {
      gradeMap.set(g.id, { id: g.id, name: g.name });
    }

    const subjectMap = new Map<
      string,
      { id: string; name: string; gradeId: string }
    >();
    for (const s of centerSubjects) {
      subjectMap.set(s.id, {
        id: s.id,
        name: s.name,
        gradeId: s.gradeId,
      });
    }

    const teacherMap = new Map<
      string,
      { id: string; name: string; subjectIds: Set<string> }
    >();
    for (const t of centerTeachers) {
      teacherMap.set(t.id, {
        id: t.id,
        name: t.user.fullName,
        subjectIds: new Set(t.subjects.map((s) => s.subjectId)),
      });
    }

    const dbExistingNames = new Set(
      existingGroups.map((g) => normalizeArabicText(g.name)),
    );

    const errors: RowValidationError[] = [];
    const fileSeenNames = new Set<string>();

    const validatedRows: Array<{
      name: string;
      gradeId: string;
      gradeName: string;
      subjectId: string;
      subjectName: string;
      teacherId: string;
      teacherName: string;
      monthlyFee: number;
      capacity: number | null;
      monthsCount: number;
    }> = [];

    for (const rowItem of rows) {
      const { rowNumber, values } = rowItem;
      const rawName: unknown = values['اسم المجموعة'];
      const rawGradeId: unknown =
        values['معرف المرحلة (Grade ID)'] ??
        values['معرف المرحلة'] ??
        values['gradeId'] ??
        values['المرحلة الدراسية'];
      const rawGradeName: unknown =
        values['المرحلة الدراسية (للتوضيح)'] ?? values['المرحلة الدراسية'];

      const rawSubjectId: unknown =
        values['معرف المادة (Subject ID)'] ??
        values['معرف المادة'] ??
        values['subjectId'] ??
        values['المادة الدراسية'];
      const rawSubjectName: unknown =
        values['المادة الدراسية (للتوضيح)'] ?? values['المادة الدراسية'];

      const rawTeacherId: unknown =
        values['معرف المدرس (Teacher ID)'] ??
        values['معرف المدرس'] ??
        values['teacherId'] ??
        values['اسم المدرس'];
      const rawTeacherName: unknown =
        values['اسم المدرس (للتوضيح)'] ?? values['اسم المدرس'];

      const rawFee: unknown = values['الاشتراك الشهري'];
      const rawCapacity: unknown = values['السعة الاستيعابية'];
      const rawMonths: unknown = values['عدد الأشهر'];

      // 1. اسم المجموعة
      let name = '';
      if (
        !rawName ||
        typeof rawName !== 'string' ||
        rawName.trim().length < 2
      ) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: rawName,
          message: 'اسم المجموعة إلزامي ويجب ألا يقل عن حرفين.',
        });
      } else {
        name = rawName.trim();
        const normName = normalizeArabicText(name);
        if (fileSeenNames.has(normName)) {
          errors.push({
            row: rowNumber,
            field: 'name',
            value: name,
            message: 'اسم المجموعة مكرر داخل نفس الملف المرفوع.',
          });
        } else if (dbExistingNames.has(normName)) {
          errors.push({
            row: rowNumber,
            field: 'name',
            value: name,
            message: 'اسم المجموعة مسجل بالفعل في هذا المركز.',
          });
        } else {
          fileSeenNames.add(normName);
        }
      }

      // 2. معرف المرحلة الدراسية (Grade ID)
      const gradeIdStr =
        typeof rawGradeId === 'string'
          ? rawGradeId.trim()
          : rawGradeId !== undefined && rawGradeId !== null
            ? String(rawGradeId).trim()
            : '';

      let gradeId = '';
      let gradeName =
        typeof rawGradeName === 'string' ? rawGradeName.trim() : '';

      if (!gradeIdStr) {
        errors.push({
          row: rowNumber,
          field: 'gradeId',
          value: rawGradeId,
          message:
            'معرف المرحلة (Grade ID) حقل إلزامي، يرجى نسخه من ورقة دليل الاستيراد.',
        });
      } else {
        const foundGrade = gradeMap.get(gradeIdStr);
        if (!foundGrade) {
          errors.push({
            row: rowNumber,
            field: 'gradeId',
            value: gradeIdStr,
            message:
              'معرف المرحلة المدخل غير صالح أو لا ينتمي لهذا المركز أو غير نشط.',
          });
        } else {
          gradeId = foundGrade.id;
          gradeName = gradeName || foundGrade.name;
        }
      }

      // 3. معرف المادة الدراسية (Subject ID)
      const subjectIdStr =
        typeof rawSubjectId === 'string'
          ? rawSubjectId.trim()
          : rawSubjectId !== undefined && rawSubjectId !== null
            ? String(rawSubjectId).trim()
            : '';

      let subjectId = '';
      let subjectName =
        typeof rawSubjectName === 'string' ? rawSubjectName.trim() : '';

      if (!subjectIdStr) {
        errors.push({
          row: rowNumber,
          field: 'subjectId',
          value: rawSubjectId,
          message:
            'معرف المادة (Subject ID) حقل إلزامي، يرجى نسخه من ورقة دليل الاستيراد.',
        });
      } else {
        const foundSubject = subjectMap.get(subjectIdStr);
        if (!foundSubject) {
          errors.push({
            row: rowNumber,
            field: 'subjectId',
            value: subjectIdStr,
            message:
              'معرف المادة المدخل غير صالح أو لا ينتمي لهذا المركز أو غير نشط.',
          });
        } else {
          if (gradeId && foundSubject.gradeId !== gradeId) {
            errors.push({
              row: rowNumber,
              field: 'subjectId',
              value: subjectIdStr,
              message:
                'المادة الدراسية المحددة لا تنتمي إلى المرحلة الدراسية المختارة.',
            });
          }
          subjectId = foundSubject.id;
          subjectName = subjectName || foundSubject.name;
        }
      }

      // 4. معرف المدرس (Teacher ID)
      const teacherIdStr =
        typeof rawTeacherId === 'string'
          ? rawTeacherId.trim()
          : rawTeacherId !== undefined && rawTeacherId !== null
            ? String(rawTeacherId).trim()
            : '';

      let teacherId = '';
      let teacherName =
        typeof rawTeacherName === 'string' ? rawTeacherName.trim() : '';

      if (!teacherIdStr) {
        errors.push({
          row: rowNumber,
          field: 'teacherId',
          value: rawTeacherId,
          message:
            'معرف المدرس (Teacher ID) حقل إلزامي، يرجى نسخه من ورقة دليل الاستيراد.',
        });
      } else {
        const foundTeacher = teacherMap.get(teacherIdStr);
        if (!foundTeacher) {
          errors.push({
            row: rowNumber,
            field: 'teacherId',
            value: teacherIdStr,
            message:
              'معرف المدرس المدخل غير صالح أو لا ينتمي لهذا المركز أو غير نشط.',
          });
        } else {
          if (subjectId && !foundTeacher.subjectIds.has(subjectId)) {
            errors.push({
              row: rowNumber,
              field: 'teacherId',
              value: teacherIdStr,
              message: 'المدرس المحدد غير مخصص لتدريس هذه المادة.',
            });
          }
          teacherId = foundTeacher.id;
          teacherName = teacherName || foundTeacher.name;
        }
      }

      // 5. الاشتراك الشهري
      let monthlyFee = 0;
      if (rawFee === undefined || rawFee === null || rawFee === '') {
        errors.push({
          row: rowNumber,
          field: 'monthlyFee',
          value: rawFee,
          message: 'قيمة الاشتراك الشهري حقل إلزامي.',
        });
      } else {
        const parsedFee = Number(rawFee);
        if (Number.isNaN(parsedFee) || parsedFee < 0) {
          errors.push({
            row: rowNumber,
            field: 'monthlyFee',
            value: rawFee,
            message:
              'قيمة الاشتراك الشهري يجب أن تكون رقماً أكبر من أو يساوي 0.',
          });
        } else {
          monthlyFee = parsedFee;
        }
      }

      // 6. السعة الاستيعابية
      let capacity: number | null = null;
      if (
        rawCapacity !== undefined &&
        rawCapacity !== null &&
        rawCapacity !== ''
      ) {
        const parsedCap = Number(rawCapacity);
        if (Number.isNaN(parsedCap) || parsedCap < 1) {
          errors.push({
            row: rowNumber,
            field: 'capacity',
            value: rawCapacity,
            message: 'السعة الاستيعابية يجب أن تكون رقماً أكبر من أو يساوي 1.',
          });
        } else {
          capacity = Math.floor(parsedCap);
        }
      }

      // 7. عدد الأشهر
      let monthsCount = 1;
      if (rawMonths !== undefined && rawMonths !== null && rawMonths !== '') {
        const parsedMonths = Number(rawMonths);
        if (Number.isNaN(parsedMonths) || parsedMonths < 1) {
          errors.push({
            row: rowNumber,
            field: 'monthsCount',
            value: rawMonths,
            message: 'عدد الأشهر يجب أن يكون رقماً أكبر من أو يساوي 1.',
          });
        } else {
          monthsCount = Math.floor(parsedMonths);
        }
      }

      if (errors.length === 0 || errors[errors.length - 1]?.row !== rowNumber) {
        validatedRows.push({
          name,
          gradeId,
          gradeName,
          subjectId,
          subjectName,
          teacherId,
          teacherName,
          monthlyFee,
          capacity,
          monthsCount,
        });
      }
    }

    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'تعذر استيراد الملف لوجود أخطاء في بيانات بعض المجموعات.',
        error: 'Unprocessable Entity',
        data: {
          totalRows: rows.length,
          validRows: rows.length - errors.length,
          failedRows: errors.length,
          remainingErrorsCount: Math.max(0, errors.length - 100),
          errors: errors.slice(0, 100),
        },
      });
    }

    if (dryRun) {
      return {
        totalRows: rows.length,
        validRows: validatedRows.length,
        failedRows: 0,
        errors: [],
        data: validatedRows.map((r) => ({
          name: r.name,
          gradeId: r.gradeId,
          gradeName: r.gradeName,
          subjectId: r.subjectId,
          subjectName: r.subjectName,
          teacherId: r.teacherId,
          teacherName: r.teacherName,
          monthlyFee: r.monthlyFee,
        })),
      };
    }

    const groupsToInsert = validatedRows.map((r) => ({
      centerId,
      name: r.name,
      gradeId: r.gradeId,
      subjectId: r.subjectId,
      teacherId: r.teacherId,
      monthlyFee: r.monthlyFee,
      capacity: r.capacity,
      monthsCount: r.monthsCount,
      isActive: true,
    }));

    await this.prisma.group.createMany({
      data: groupsToInsert,
    });

    return {
      totalRows: rows.length,
      validRows: validatedRows.length,
      failedRows: 0,
      errors: [],
    };
  }
}
