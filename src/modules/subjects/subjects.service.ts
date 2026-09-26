import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { buildMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { PdfService } from '../../shared/pdf/pdf.service';
import {
  ExcelImportSummary,
  RowValidationError,
} from '../../shared/excel/interfaces/excel.interface';
import { normalizeArabicText } from '../../shared/excel/utils/arabic-normalizer.util';
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

const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME_TYPE = 'application/pdf';

const SUBJECT_RELATION_COUNT_FIELDS: Record<string, string> = {
  groups: 'groups',
  teachers: 'teacherSubjects',
  teacherSubjects: 'teacherSubjects',
};

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionValidationService: SubscriptionValidationService,
    private readonly excelService: ExcelService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * إنشاء مادة دراسية جديدة مع التحقق من صلاحية ونشاط المرحلة الدراسية التابعة لها
   * وعدم تكرار اسم المادة في نفس المرحلة لنفس المركز.
   */
  async create(
    centerId: string,
    data: CreateSubjectDto,
  ): Promise<SubjectListItem> {
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
      select: subjectListSelect,
    });
  }

  /**
   * جلب قائمة المواد الدراسية لمركز معين مع دعم البحث، الفلترة حسب الحالة والمرحلة الدراسية، والـ Pagination والترتيب.
   */
  async findAll(
    centerId: string,
    query: SubjectQueryDto,
  ): Promise<{ data: SubjectDetails[]; meta: any }> {
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

    const orderBy = query.getOrderBy<
      | Prisma.SubjectOrderByWithRelationInput
      | Prisma.SubjectOrderByWithRelationInput[]
    >(
      ['name', 'createdAt'],
      [{ createdAt: 'desc' }],
      SUBJECT_RELATION_COUNT_FIELDS,
    );

    const [total, data] = await Promise.all([
      this.prisma.subject.count({ where }),
      this.prisma.subject.findMany({
        where,
        skip,
        take,
        select: subjectDetailsSelect,
        orderBy,
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }

  /**
   * جلب تفاصيل مادة دراسية معينة مع التحقق من تبعيتها للمركز.
   */
  async findOne(centerId: string, id: string): Promise<SubjectListItem> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, centerId },
      select: subjectListSelect,
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
  ): Promise<SubjectListItem> {
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
      select: subjectListSelect,
    });
  }

  /**
   * تبديل حالة تفعيل مادة دراسية محددة (تفعيل/إلغاء تفعيل).
   */
  async toggleStatus(centerId: string, id: string): Promise<SubjectListItem> {
    const currentSubject = await this.findOne(centerId, id);

    return this.prisma.subject.update({
      where: { id },
      data: { isActive: !currentSubject.isActive },
      select: subjectListSelect,
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
   * جلب وتجهيز بيانات المواد الدراسية للمركز بصيغة مصفوفة مهيأة للتصدير (Excel / PDF).
   */
  private async getExportDataset(centerId: string, query: SubjectQueryDto) {
    const { active, gradeId } = query;
    const where = query.getWhere<Prisma.SubjectWhereInput>([
      'name',
      'description',
    ]);
    where.centerId = centerId;

    if (active !== undefined) {
      where.isActive = active;
    }

    if (gradeId !== undefined) {
      where.gradeId = gradeId;
    }

    const orderBy = query.getOrderBy<
      | Prisma.SubjectOrderByWithRelationInput
      | Prisma.SubjectOrderByWithRelationInput[]
    >(
      ['name', 'createdAt'],
      [{ createdAt: 'desc' }],
      SUBJECT_RELATION_COUNT_FIELDS,
    );

    const subjects = await this.prisma.subject.findMany({
      where,
      orderBy,
      select: subjectDetailsSelect,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const rows = subjects.map((s) => ({
      name: s.name,
      gradeName: s.grade?.name || '—',
      description: s.description || '—',
      status: s.isActive ? 'نشط' : 'معطل',
      teachersCount: s._count?.teacherSubjects || 0,
      groupsCount: s._count?.groups || 0,
      createdAt: s.createdAt
        ? new Date(s.createdAt).toISOString().split('T')[0]
        : '—',
    }));

    return { rows, dateStr };
  }

  /**
   * تصدير المواد الدراسية لمركز معين إلى ملف Excel مع تطبيق الفلاتر.
   */
  async exportToExcel(
    centerId: string,
    query: SubjectQueryDto,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(centerId, query);

    const buffer = await this.excelService.buildWorkbookBuffer({
      sheetName: 'المواد الدراسية',
      columns: [
        { header: 'اسم المادة الدراسية', key: 'name', width: 25 },
        { header: 'المرحلة الدراسية', key: 'gradeName', width: 25 },
        { header: 'الوصف', key: 'description', width: 35 },
        { header: 'الحالة', key: 'status', width: 15 },
        { header: 'عدد المعلمين', key: 'teachersCount', width: 14 },
        { header: 'عدد المجموعات', key: 'groupsCount', width: 15 },
        { header: 'تاريخ الإنشاء', key: 'createdAt', width: 18 },
      ],
      data: rows,
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        `subjects-${dateStr}.xlsx`,
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تصدير المواد الدراسية لمركز معين إلى ملف PDF مع تطبيق الفلاتر والبحث.
   */
  async exportToPdf(
    centerId: string,
    query: SubjectQueryDto,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(centerId, query);

    const buffer = await this.pdfService.buildTablePdfBuffer({
      title: 'تقرير المواد الدراسية',
      dateStr,
      columns: [
        { header: 'اسم المادة', key: 'name', width: '*', align: 'right' },
        {
          header: 'المرحلة الدراسية',
          key: 'gradeName',
          width: 90,
          align: 'right',
        },
        { header: 'الحالة', key: 'status', width: 45, align: 'center' },
        {
          header: 'المعلمين',
          key: 'teachersCount',
          width: 45,
          align: 'center',
        },
        { header: 'المجموعات', key: 'groupsCount', width: 45, align: 'center' },
        {
          header: 'تاريخ الإنشاء',
          key: 'createdAt',
          width: 65,
          align: 'center',
        },
      ],
      data: rows,
      orientation: 'portrait',
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        `subjects-${dateStr}.pdf`,
        PDF_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد المواد الدراسية.
   */
  async getImportTemplate(res?: Response): Promise<Buffer | void> {
    const buffer = await this.excelService.buildTemplateBuffer({
      dataSheetName: 'المواد الدراسية',
      instructionsSheetName: 'دليل الاستيراد',
      columns: [
        {
          header: 'اسم المادة الدراسية',
          key: 'name',
          width: 25,
          example: 'اللغة العربية',
        },
        {
          header: 'اسم المرحلة الدراسية',
          key: 'gradeName',
          width: 25,
          example: 'الصف الأول الثانوي',
        },
        {
          header: 'الوصف',
          key: 'description',
          width: 35,
          example: 'منهج اللغة العربية للثانوية العامة',
        },
      ],
      sampleRows: [
        {
          name: 'اللغة العربية',
          gradeName: 'الصف الأول الثانوي',
          description: 'منهج اللغة العربية للثانوية العامة',
        },
        {
          name: 'الرياضيات',
          gradeName: 'الصف الأول الثانوي',
          description: 'الرياضيات العامة',
        },
        {
          name: 'الفيزياء',
          gradeName: 'الصف الثاني الثانوي',
          description: 'الفيزياء التخصصية',
        },
      ],
      instructions: [
        'عمود "اسم المادة الدراسية" إلزامي وفريد داخل نفس المرحلة الدراسية بالمركز.',
        'عمود "اسم المرحلة الدراسية" إلزامي، ويجب أن يطابق تماماً اسم مرحلة دراسية مسجلة ونشطة في مركزك.',
        'عمود "الوصف" اختياري لوضع أي ملاحظات إضافية.',
        'يرجى عدم تعديل أو حذف صف العناوين الأول في ورقة البيانات.',
      ],
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        'subjects-template.xlsx',
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * استيراد المواد الدراسية من ملف Excel مع التحقق الدقيق وإرجاع أخطاء الصفوف (422) ودعم المعاينة (dryRun).
   */
  async importFromExcel(
    centerId: string,
    fileBuffer: Buffer,
    dryRun = false,
  ): Promise<
    ExcelImportSummary<{
      name: string;
      gradeName: string;
      description?: string;
    }>
  > {
    const { rows } = await this.excelService.parseSheetRows(fileBuffer, {
      expectedHeaders: ['اسم المادة الدراسية', 'اسم المرحلة الدراسية'],
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'ملف Excel لا يحتوي على أي صفوف بيانات للاستيراد.',
      );
    }

    const errors: RowValidationError[] = [];
    const fileSubjectKeys = new Set<string>();
    const validRowsToCreate: Array<{
      name: string;
      gradeId: string;
      gradeName: string;
      description?: string | null;
      centerId: string;
    }> = [];

    // جلب المراحل الدراسية الحالية للمركز للتحقق المسبق والربط
    const existingGrades = await this.prisma.grade.findMany({
      where: { centerId },
      select: { id: true, name: true, isActive: true },
    });
    const gradeMap = new Map<
      string,
      { id: string; name: string; isActive: boolean }
    >();
    existingGrades.forEach((g) => {
      gradeMap.set(normalizeArabicText(g.name), g);
    });

    // جلب المواد الحالية للمركز للتحقق المسبق من التكرار
    const existingSubjects = await this.prisma.subject.findMany({
      where: { centerId },
      select: { name: true, gradeId: true },
    });
    const existingSubjectKeys = new Set(
      existingSubjects.map(
        (s) => `${s.gradeId}_${normalizeArabicText(s.name)}`,
      ),
    );

    for (const rowItem of rows) {
      const { rowNumber, values } = rowItem;
      const rawName: unknown = values['اسم المادة الدراسية'];
      const rawGradeName: unknown = values['اسم المرحلة الدراسية'];
      const rawDescription: unknown = values['الوصف'];

      // 1. فحص اسم المادة
      if (
        !rawName ||
        typeof rawName !== 'string' ||
        rawName.trim().length === 0
      ) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: rawName,
          message: 'اسم المادة الدراسية حقل إلزامي ولا يمكن تركه فارغاً.',
        });
        continue;
      }

      // 2. فحص اسم المرحلة الدراسية
      if (
        !rawGradeName ||
        typeof rawGradeName !== 'string' ||
        rawGradeName.trim().length === 0
      ) {
        errors.push({
          row: rowNumber,
          field: 'gradeName',
          value: rawGradeName,
          message: 'اسم المرحلة الدراسية حقل إلزامي لربط المادة بها.',
        });
        continue;
      }

      const name = rawName.trim();
      const gradeName = rawGradeName.trim();
      const normalizedGradeName = normalizeArabicText(gradeName);
      const targetGrade = gradeMap.get(normalizedGradeName);

      // 3. التحقق من وجود المرحلة الدراسية في المركز
      if (!targetGrade) {
        errors.push({
          row: rowNumber,
          field: 'gradeName',
          value: gradeName,
          message: `المرحلة الدراسية "${gradeName}" غير مسجلة في هذا المركز.`,
        });
        continue;
      }

      // 4. التحقق من نشاط المرحلة الدراسية
      if (!targetGrade.isActive) {
        errors.push({
          row: rowNumber,
          field: 'gradeName',
          value: gradeName,
          message: `المرحلة الدراسية "${targetGrade.name}" معطلة، ولا يمكن إضافة مواد إليها.`,
        });
        continue;
      }

      const normalizedName = normalizeArabicText(name);
      const compoundKey = `${targetGrade.id}_${normalizedName}`;

      // 5. التحقق من عدم التكرار داخل نفس الملف
      if (fileSubjectKeys.has(compoundKey)) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: name,
          message: `المادة الدراسية "${name}" مكررة لنفس المرحلة (${targetGrade.name}) داخل نفس الملف المرفوع.`,
        });
        continue;
      }
      fileSubjectKeys.add(compoundKey);

      // 6. التحقق من عدم التكرار في قاعدة البيانات لنفس المرحلة والمركز
      if (existingSubjectKeys.has(compoundKey)) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: name,
          message: `المادة الدراسية "${name}" مسجلة بالفعل في مرحلة "${targetGrade.name}" بهذا المركز.`,
        });
        continue;
      }

      // 7. الوصف
      const description =
        rawDescription && typeof rawDescription === 'string'
          ? rawDescription.trim()
          : typeof rawDescription === 'number'
            ? String(rawDescription).trim()
            : null;

      validRowsToCreate.push({
        name,
        description,
        gradeId: targetGrade.id,
        gradeName: targetGrade.name,
        centerId,
      });
    }

    // إذا وُجدت أي أخطاء، نرفض العملية بالكامل بكود 422
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'تعذر استيراد الملف لوجود أخطاء في البيانات المرفقة.',
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

    // التحقق من حد المواد في باقة الاشتراك إذا كانت هناك صفوف جديدة للإضافة
    if (validRowsToCreate.length > 0) {
      const plan =
        await this.subscriptionValidationService.getActiveSubscription(
          centerId,
        );
      const subjectLimit = (plan as unknown as { subjectLimit?: number })
        ?.subjectLimit;
      if (subjectLimit !== undefined && subjectLimit !== null) {
        const currentCount = await this.prisma.subject.count({
          where: { centerId },
        });
        if (currentCount + validRowsToCreate.length > subjectLimit) {
          throw new BadRequestException(
            `استيراد ${validRowsToCreate.length} مادة سيتجاوز الحد الأقصى المسموح به في باقتك الحالية (${subjectLimit} مادة، مسجل منها حالياً ${currentCount}). يرجى ترقية الاشتراك.`,
          );
        }
      }
    }

    // إذا كان وضع الفحص والمعاينة (dryRun)
    if (dryRun) {
      return {
        totalRows: rows.length,
        validRows: validRowsToCreate.length,
        failedRows: 0,
        errors: [],
        data: validRowsToCreate.map((r) => ({
          name: r.name,
          gradeName: r.gradeName,
          description: r.description || undefined,
        })),
      };
    }

    // التنفيذ الفعلي في معاملة قاعدة البيانات
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.subject.createMany({
          data: validRowsToCreate.map(
            ({ name, description, gradeId, centerId: cId }) => ({
              name,
              description,
              gradeId,
              centerId: cId,
            }),
          ),
        });
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new UnprocessableEntityException({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message:
            'فشل الاستيراد بسبب وجود مادة مسجلة مسبقاً بنفس الاسم في نفس المرحلة (تضارب في البيانات).',
          error: 'Unprocessable Entity',
        });
      }
      throw err;
    }

    return {
      totalRows: rows.length,
      validRows: validRowsToCreate.length,
      failedRows: 0,
      errors: [],
    };
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
