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
  studentDetailsSelect,
  studentListSelect,
  StudentDetails,
  StudentListItem,
} from './constants/student.select';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/get-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly subscriptionValidationService: SubscriptionValidationService,
  ) {}

  /**
   * إنشاء طالب جديد مع حسابه وسجله الدراسي في معاملة واحدة.
   */
  async create(
    centerId: string,
    data: CreateStudentDto,
  ): Promise<StudentDetails> {
    await this.subscriptionValidationService.validateStudentLimit(centerId);
    return this.prisma.$transaction(async (tx) => {
      // 1. التحقق من المرحلة الدراسية وصلاحيتها
      await this.getAndValidateGrade(tx, centerId, data.gradeId);

      // 2. إنشاء حساب المستخدم المرتبط (Role: STUDENT)
      const user = await this.usersService.createUserAccount(
        tx,
        centerId,
        'STUDENT',
        {
          fullName: data.fullName,
          email: data.email,
          password: data.password,
          phone: data.phone,
          avatar: data.avatar,
        },
      );

      // 3. إنشاء سجل الطالب
      const student = await tx.student.create({
        data: {
          userId: user.id,
          centerId,
          parentPhone: data.parentPhone || null,
          notes: data.notes || null,
        },
      });

      // 4. إنشاء تسجيل الطالب في المرحلة الدراسية
      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          gradeId: data.gradeId,
          isActive: true,
        },
      });

      // 5. استرجاع تفاصيل الطالب كاملة
      const result = await tx.student.findUnique({
        where: { id: student.id },
        select: studentDetailsSelect,
      });

      if (!result) {
        throw new NotFoundException('فشل استرجاع بيانات الطالب بعد الإنشاء.');
      }

      return result;
    });
  }

  /**
   * جلب قائمة الطلاب للمركز التعليمي الحالي مع دعم البحث، التصفية والـ Pagination.
   */
  async findAll(
    centerId: string,
    query: StudentQueryDto,
  ): Promise<{ data: StudentListItem[]; meta: any }> {
    const { skip, take, active, gradeId } = query;

    const userWhere: Prisma.UserWhereInput = {
      centerId,
    };

    if (active !== undefined) {
      userWhere.isActive = active;
    }

    const where: Prisma.StudentWhereInput = {
      user: userWhere,
    };

    if (query.search) {
      where.OR = [
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { user: { phone: { contains: query.search, mode: 'insensitive' } } },
        { parentPhone: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (gradeId) {
      where.enrollments = {
        some: {
          gradeId,
          isActive: true,
        },
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        skip,
        take,
        select: studentListSelect,
        orderBy: [{ createdAt: 'desc' }], // ترتيب تنازلي مستقر
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }

  /**
   * جلب تفاصيل طالب معين مع التحقق من تبعيته للمركز الحالي.
   */
  async findOne(centerId: string, id: string): Promise<StudentDetails> {
    const student = await this.prisma.student.findFirst({
      where: {
        id,
        centerId,
      },
      select: studentDetailsSelect,
    });

    if (!student) {
      throw new NotFoundException('الطالب المطلوب غير موجود.');
    }

    return student;
  }

  /**
   * تحديث تفاصيل الطالب وحسابه وسجله الدراسي.
   */
  async update(
    centerId: string,
    id: string,
    data: UpdateStudentDto,
  ): Promise<StudentDetails> {
    const currentStudent = await this.findOne(centerId, id);

    return this.prisma.$transaction(async (tx) => {
      // 1. تحديث حساب المستخدم المرتبط بالطالب
      await this.usersService.updateUserAccount(tx, currentStudent.user.id, {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        phone: data.phone,
        avatar: data.avatar,
        isActive: data.isActive,
      });

      // 2. تحديث بيانات سجل الطالب
      await tx.student.update({
        where: { id },
        data: {
          parentPhone:
            data.parentPhone !== undefined ? data.parentPhone : undefined,
          notes: data.notes !== undefined ? data.notes : undefined,
        },
      });

      // 3. تحديث التسجيل في المرحلة الدراسية إذا تم تمريره
      if (data.gradeId !== undefined) {
        await this.getAndValidateGrade(tx, centerId, data.gradeId);

        // إلغاء تفعيل التسجيلات النشطة الأخرى للطالب
        await tx.studentEnrollment.updateMany({
          where: {
            studentId: id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        // إنشاء أو إعادة تفعيل التسجيل للمرحلة الدراسية الجديدة
        await tx.studentEnrollment.upsert({
          where: {
            studentId_gradeId: {
              studentId: id,
              gradeId: data.gradeId,
            },
          },
          update: {
            isActive: true,
          },
          create: {
            studentId: id,
            gradeId: data.gradeId,
            isActive: true,
          },
        });
      }

      // 4. استرجاع تفاصيل الطالب المحدثة
      const result = await tx.student.findUnique({
        where: { id },
        select: studentDetailsSelect,
      });

      if (!result) {
        throw new NotFoundException('فشل استرجاع بيانات الطالب بعد التحديث.');
      }

      return result;
    });
  }

  /**
   * تبديل حالة تفعيل حساب الطالب (نشط/معطل).
   */
  async toggleStatus(centerId: string, id: string): Promise<StudentDetails> {
    const currentStudent = await this.findOne(centerId, id);

    return this.prisma.$transaction(async (tx) => {
      await this.usersService.updateUserAccount(tx, currentStudent.user.id, {
        isActive: !currentStudent.user.isActive,
      });

      const result = await tx.student.findUnique({
        where: { id },
        select: studentDetailsSelect,
      });

      if (!result) {
        throw new NotFoundException('الطالب المطلوب غير موجود.');
      }

      return result;
    });
  }

  // ==========================================
  // Private Assertion & Retrieval Helpers
  // ==========================================

  /**
   * التحقق من وجود المرحلة الدراسية ونشاطها وتبعيتها للمركز.
   */
  private async getAndValidateGrade(
    tx: Prisma.TransactionClient,
    centerId: string,
    gradeId: string,
  ): Promise<void> {
    const grade = await tx.grade.findFirst({
      where: {
        id: gradeId,
        centerId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!grade) {
      throw new BadRequestException(
        'المرحلة الدراسية المحددة غير موجودة، أو لا تنتمي لهذا المركز، أو معطلة.',
      );
    }
  }
}
