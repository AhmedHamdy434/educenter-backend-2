import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  gradeDetailsSelect,
  gradeListSelect,
  GradeDetails,
  GradeListItem,
} from './constants/grade.select';
import { CreateGradeDto } from './dto/create-grade.dto';
import { GradeQueryDto } from './dto/get-grades.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * إنشاء مرحلة دراسية جديدة تابعة لمركز معين مع التحقق من عدم تكرار الاسم في نفس المركز.
   */
  async create(centerId: string, data: CreateGradeDto): Promise<GradeDetails> {
    await this.ensureGradeNameIsUnique(centerId, data.name);

    return this.prisma.grade.create({
      data: {
        name: data.name,
        description: data.description,
        order: data.order ?? 0,
        centerId,
      },
      select: gradeDetailsSelect,
    });
  }

  /**
   * جلب قائمة المراحل الدراسية لمركز معين مع دعم البحث، التصفية بالحالة، والـ Pagination والترتيب.
   */
  async findAll(
    centerId: string,
    query: GradeQueryDto,
  ): Promise<{ data: GradeListItem[]; meta: any }> {
    const { skip, take, active } = query;
    const where = query.getWhere<Prisma.GradeWhereInput>([
      'name',
      'description',
    ]);

    // عزل البيانات حسب المركز التعليمي
    where.centerId = centerId;

    if (active !== undefined) {
      where.isActive = active;
    }

    const [total, data] = await Promise.all([
      this.prisma.grade.count({ where }),
      this.prisma.grade.findMany({
        where,
        skip,
        take,
        select: gradeListSelect,
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);
    return { data, meta };
  }

  /**
   * جلب تفاصيل مرحلة دراسية معينة مع التحقق من تبعيتها للمركز.
   */
  async findOne(centerId: string, id: string): Promise<GradeDetails> {
    const grade = await this.prisma.grade.findFirst({
      where: { id, centerId },
      select: gradeDetailsSelect,
    });

    if (!grade) {
      throw new NotFoundException('المرحلة الدراسية المطلوبة غير موجودة.');
    }

    return grade;
  }

  /**
   * تحديث بيانات مرحلة دراسية محددة.
   */
  async update(
    centerId: string,
    id: string,
    data: UpdateGradeDto,
  ): Promise<GradeDetails> {
    const currentGrade = await this.findOne(centerId, id);

    if (data.name && data.name !== currentGrade.name) {
      await this.ensureGradeNameIsUnique(centerId, data.name);
    }

    return this.prisma.grade.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        order: data.order,
        isActive: data.isActive,
      },
      select: gradeDetailsSelect,
    });
  }

  /**
   * تبديل حالة تفعيل مرحلة دراسية محددة (تفعيل/إلغاء تفعيل).
   */
  async toggleStatus(centerId: string, id: string): Promise<GradeDetails> {
    const currentGrade = await this.findOne(centerId, id);

    return this.prisma.grade.update({
      where: { id },
      data: { isActive: !currentGrade.isActive },
      select: gradeDetailsSelect,
    });
  }

  /**
   * التحقق التوكيدي من عدم تكرار الاسم في نفس المركز.
   */
  private async ensureGradeNameIsUnique(
    centerId: string,
    name: string,
  ): Promise<void> {
    const existingGrade = await this.prisma.grade.findUnique({
      where: {
        centerId_name: {
          centerId,
          name,
        },
      },
    });

    if (existingGrade) {
      throw new ConflictException(
        'اسم المرحلة الدراسية مستخدم بالفعل في هذا المركز.',
      );
    }
  }
}
