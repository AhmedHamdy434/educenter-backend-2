import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SubscriptionValidationService } from '../subscription-plans/subscription-validation.service';
import {
  teacherDetailsSelect,
  TeacherDetails,
  TeacherListItem,
} from './constants/teacher.select';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherQueryDto } from './dto/get-teachers.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly subscriptionValidationService: SubscriptionValidationService,
  ) {}

  /**
   * إنشاء معلم جديد مع حسابه وعلاقاته بالمواد التعليمية في معاملة واحدة.
   */
  async create(
    centerId: string,
    data: CreateTeacherDto,
  ): Promise<TeacherDetails> {
    await this.subscriptionValidationService.validateTeacherLimit(centerId);
    return this.prisma.$transaction(async (tx) => {
      // 1. التحقق من المواد الدراسية وصلاحيتها
      if (data.subjectIds && data.subjectIds.length > 0) {
        await this.getAndValidateSubjects(tx, centerId, data.subjectIds);
      }

      // 2. إنشاء حساب المستخدم المرتبط (Role: TEACHER)
      const user = await this.usersService.createUserAccount(
        tx,
        centerId,
        'TEACHER',
        {
          fullName: data.fullName,
          email: data.email,
          password: data.password,
          phone: data.phone,
          avatar: data.avatar,
        },
      );

      // 3. إنشاء المعلم
      const teacher = await tx.teacher.create({
        data: {
          userId: user.id,
          centerId,
          bio: data.bio || null,
        },
      });

      // 4. ربط المواد التعليمية بالمعلم
      if (data.subjectIds && data.subjectIds.length > 0) {
        await tx.teacherSubject.createMany({
          data: data.subjectIds.map((subjectId) => ({
            teacherId: teacher.id,
            subjectId,
          })),
        });
      }

      // 5. استرجاع تفاصيل المعلم
      const result = await tx.teacher.findUnique({
        where: { id: teacher.id },
        select: teacherDetailsSelect,
      });

      if (!result) {
        throw new NotFoundException('فشل استرجاع بيانات المعلم بعد الإنشاء.');
      }

      return result;
    });
  }

  /**
   * جلب قائمة المعلمين للمركز التعليمي الحالي مع دعم البحث، التصفية والـ Pagination.
   */
  async findAll(
    centerId: string,
    query: TeacherQueryDto,
  ): Promise<{ data: TeacherListItem[]; meta: any }> {
    const { skip, take, active, subjectId } = query;

    const userWhere: Prisma.UserWhereInput = {
      centerId,
    };

    if (active !== undefined) {
      userWhere.isActive = active;
    }

    const where: Prisma.TeacherWhereInput = {
      user: userWhere,
    };

    if (query.search) {
      where.OR = [
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { user: { phone: { contains: query.search, mode: 'insensitive' } } },
        { bio: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (subjectId) {
      where.subjects = {
        some: {
          subjectId,
        },
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
        where,
        skip,
        take,
        select: teacherDetailsSelect,
        orderBy: [{ createdAt: 'desc' }], // ترتيب تنازلي مستقر
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }

  /**
   * جلب تفاصيل معلم معين مع التحقق من تبعيته للمركز الحالي.
   */
  async findOne(centerId: string, id: string): Promise<TeacherDetails> {
    const teacher = await this.prisma.teacher.findFirst({
      where: {
        id,
        centerId,
      },
      select: teacherDetailsSelect,
    });

    if (!teacher) {
      throw new NotFoundException('المعلم المطلوب غير موجود.');
    }

    return teacher;
  }

  /**
   * تحديث تفاصيل المعلم وحسابه وعلاقاته بالمواد التعليمية (باستخدام Diff للعلاقات).
   */
  async update(
    centerId: string,
    id: string,
    data: UpdateTeacherDto,
  ): Promise<TeacherDetails> {
    const currentTeacher = await this.findOne(centerId, id);

    return this.prisma.$transaction(async (tx) => {
      // 1. تحديث حساب المستخدم المرتبط بالمعلم
      await this.usersService.updateUserAccount(tx, currentTeacher.user.id, {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        phone: data.phone,
        avatar: data.avatar,
        isActive: data.isActive,
      });

      // 2. تحديث بيانات المعلم
      await tx.teacher.update({
        where: { id },
        data: {
          bio: data.bio !== undefined ? data.bio : undefined,
        },
      });

      // 3. تحديث علاقات المواد التعليمية باستخدام Diff
      if (data.subjectIds !== undefined) {
        await this.getAndValidateSubjects(tx, centerId, data.subjectIds);

        const existingRelations = await tx.teacherSubject.findMany({
          where: { teacherId: id },
          select: { subjectId: true },
        });
        const existingSubjectIds = existingRelations.map((r) => r.subjectId);

        const toDelete = existingSubjectIds.filter(
          (sid) => !data.subjectIds!.includes(sid),
        );
        const toCreate = data.subjectIds.filter(
          (sid) => !existingSubjectIds.includes(sid),
        );

        if (toDelete.length > 0) {
          await tx.teacherSubject.deleteMany({
            where: {
              teacherId: id,
              subjectId: { in: toDelete },
            },
          });
        }

        if (toCreate.length > 0) {
          await tx.teacherSubject.createMany({
            data: toCreate.map((subjectId) => ({
              teacherId: id,
              subjectId,
            })),
          });
        }
      }

      // 4. استرجاع تفاصيل المعلم المحدثة
      const result = await tx.teacher.findUnique({
        where: { id },
        select: teacherDetailsSelect,
      });

      if (!result) {
        throw new NotFoundException('فشل استرجاع بيانات المعلم بعد التحديث.');
      }

      return result;
    });
  }

  /**
   * تبديل حالة تفعيل حساب المعلم (نشط/معطل).
   */
  async toggleStatus(centerId: string, id: string): Promise<TeacherDetails> {
    const currentTeacher = await this.findOne(centerId, id);

    return this.prisma.$transaction(async (tx) => {
      await this.usersService.updateUserAccount(tx, currentTeacher.user.id, {
        isActive: !currentTeacher.user.isActive,
      });

      const result = await tx.teacher.findUnique({
        where: { id },
        select: teacherDetailsSelect,
      });

      if (!result) {
        throw new NotFoundException('المعلم المطلوب غير موجود.');
      }

      return result;
    });
  }

  // ==========================================
  // Private Assertion & Retrieval Helpers
  // ==========================================

  /**
   * التحقق من وجود المواد التعليمية ونشاطها وتبعيتها للمركز.
   */
  private async getAndValidateSubjects(
    tx: Prisma.TransactionClient,
    centerId: string,
    subjectIds: string[],
  ): Promise<void> {
    if (!subjectIds || subjectIds.length === 0) return;

    const uniqueSubjectIds = Array.from(new Set(subjectIds));

    const subjects = await tx.subject.findMany({
      where: {
        id: { in: uniqueSubjectIds },
        centerId,
        isActive: true,
      },
      select: { id: true },
    });

    if (subjects.length !== uniqueSubjectIds.length) {
      throw new BadRequestException(
        'بعض المواد الدراسية المحددة غير موجودة، أو لا تنتمي لهذا المركز، أو معطلة.',
      );
    }
  }
}
