import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SubscriptionValidationService } from '../subscription-plans/subscription-validation.service';
import {
  subjectDetailsSelect,
  subjectListSelect,
  SubjectDetails,
  SubjectListItem,
} from './constants/subject.select';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { SubjectQueryDto } from './dto/get-subjects.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionValidationService: SubscriptionValidationService,
  ) {}

  /**
   * إنشاء مادة دراسية جديدة مع التحقق من صلاحية ونشاط المرحلة الدراسية التابعة لها
   * وعدم تكرار اسم المادة في نفس المرحلة لنفس المركز.
   */
  async create(
    centerId: string,
    data: CreateSubjectDto,
  ): Promise<SubjectDetails> {
    await this.subscriptionValidationService.validateSubjectLimit(centerId);
    // 1. التحقق من وجود المرحلة الدراسية ونشاطها
    await this.getAndValidateGrade(centerId, data.gradeId);

    // 2. التحقق من عدم تكرار الاسم في نفس المرحلة التابعة للمركز
    await this.ensureSubjectNameIsUnique(centerId, data.gradeId, data.name);

    return this.prisma.subject.create({
      data: {
        name: data.name,
        description: data.description,
        centerId,
        gradeId: data.gradeId,
      },
      select: subjectDetailsSelect,
    });
  }

  /**
   * جلب قائمة المواد الدراسية لمركز معين مع دعم البحث، الفلترة حسب الحالة والمرحلة الدراسية، والـ Pagination.
   */
  async findAll(
    centerId: string,
    query: SubjectQueryDto,
  ): Promise<{ data: SubjectListItem[]; meta: any }> {
    const { skip, take, active, gradeId } = query;
    const where = query.getWhere<Prisma.SubjectWhereInput>([
      'name',
      'description',
    ]);

    // عزل البيانات حسب المركز التعليمي
    where.centerId = centerId;

    if (active !== undefined) {
      where.isActive = active;
    }

    if (gradeId !== undefined) {
      where.gradeId = gradeId;
    }

    const [total, data] = await Promise.all([
      this.prisma.subject.count({ where }),
      this.prisma.subject.findMany({
        where,
        skip,
        take,
        select: subjectListSelect,
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }

  /**
   * جلب تفاصيل مادة دراسية معينة مع التحقق من تبعيتها للمركز.
   */
  async findOne(centerId: string, id: string): Promise<SubjectDetails> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, centerId },
      select: subjectDetailsSelect,
    });

    if (!subject) {
      throw new NotFoundException('المادة الدراسية المطلوبة غير موجودة.');
    }

    return subject;
  }

  /**
   * تحديث بيانات مادة دراسية محددة. (ملاحظة: لا يمكن تعديل المرحلة الدراسية gradeId)
   */
  async update(
    centerId: string,
    id: string,
    data: UpdateSubjectDto,
  ): Promise<SubjectDetails> {
    const currentSubject = await this.findOne(centerId, id);

    if (data.name && data.name !== currentSubject.name) {
      await this.ensureSubjectNameIsUnique(
        centerId,
        currentSubject.gradeId,
        data.name,
        id,
      );
    }

    return this.prisma.subject.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
      },
      select: subjectDetailsSelect,
    });
  }

  /**
   * تبديل حالة تفعيل مادة دراسية محددة (تفعيل/إلغاء تفعيل).
   */
  async toggleStatus(centerId: string, id: string): Promise<SubjectDetails> {
    const currentSubject = await this.findOne(centerId, id);

    return this.prisma.subject.update({
      where: { id },
      data: { isActive: !currentSubject.isActive },
      select: subjectDetailsSelect,
    });
  }

  /**
   * جلب قائمة خيارات المواد الدراسية النشطة لاستخدامها في حقول الاختيار (Select Options).
   */
  async findOptions(
    centerId: string,
    gradeId?: string,
  ): Promise<{ id: string; name: string; grade: { name: string } }[]> {
    const where: Prisma.SubjectWhereInput = {
      centerId,
      isActive: true,
    };

    if (gradeId) {
      where.gradeId = gradeId;
    }

    return this.prisma.subject.findMany({
      where,
      select: {
        id: true,
        name: true,
        grade: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  /**
   * التحقق التوكيدي من صحة ونشاط المرحلة الدراسية.
   */
  private async getAndValidateGrade(
    centerId: string,
    gradeId: string,
  ): Promise<void> {
    const grade = await this.prisma.grade.findFirst({
      where: { id: gradeId, centerId },
      select: { id: true, isActive: true },
    });

    if (!grade) {
      throw new NotFoundException('المرحلة الدراسية المحددة غير موجودة.');
    }

    if (!grade.isActive) {
      throw new BadRequestException(
        'لا يمكن إضافة مواد إلى مرحلة دراسية معطلة.',
      );
    }
  }

  /**
   * التحقق التوكيدي من عدم تكرار اسم المادة في نفس المرحلة التعليمية التابعة للمركز.
   */
  private async ensureSubjectNameIsUnique(
    centerId: string,
    gradeId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const where: Prisma.SubjectWhereInput = {
      centerId,
      gradeId,
      name,
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const existingSubject = await this.prisma.subject.findFirst({
      where,
      select: { id: true },
    });

    if (existingSubject) {
      throw new ConflictException(
        'اسم المادة الدراسية مستخدم بالفعل في هذه المرحلة الدراسية للمركز.',
      );
    }
  }
}
