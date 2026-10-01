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
   * حذف مادة دراسية معينة بعد التحقق من عدم ارتباطها بأي مجموعات دراسية أو معلمين.
   */
  async remove(centerId: string, id: string): Promise<void> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, centerId },
      select: subjectDetailsSelect,
    });

    if (!subject) {
      throw new NotFoundException('المادة الدراسية المطلوبة غير موجودة.');
    }

    if (subject._count.groups > 0 || subject._count.teacherSubjects > 0) {
      throw new BadRequestException(
        'لا يمكن حذف المادة الدراسية لوجود مجموعات دراسية أو معلمين مرتبطين بها.',
      );
    }

    await this.prisma.subject.delete({
      where: { id },
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
      grade: {
        isActive: true,
      },
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
      id: s.id,
      name: s.name,
      gradeId: s.gradeId,
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
   * تصدير المواد الدراسية لمركز معين إلى ملف Excel مع تطبيق الفلاتر ومعرفات الكيانات.
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
        {
          header: 'معرف المادة (Subject ID)',
          key: 'id',
          width: 32,
          numFmt: '@',
        },
        { header: 'اسم المادة الدراسية', key: 'name', width: 25 },
        {
          header: 'معرف المرحلة (Grade ID)',
          key: 'gradeId',
          width: 32,
          numFmt: '@',
        },
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
   * تحميل قالب Excel فارغ ومجهز لاستيراد المواد الدراسية مع الجداول المرجعية (ID | Name).
   */
  async getImportTemplate(
    centerId: string,
    res?: Response,
  ): Promise<Buffer | void> {
    const grades = await this.prisma.grade.findMany({
      where: { centerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { order: 'asc' },
    });

    const exampleGradeId = grades[0]?.id || 'grade_id_here';
    const exampleGradeName = grades[0]?.name || 'الصف الأول الثانوي';

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
          header: 'معرف المرحلة (Grade ID)',
          key: 'gradeId',
          width: 32,
          numFmt: '@',
          example: exampleGradeId,
        },
        {
          header: 'المرحلة الدراسية (للتوضيح)',
          key: 'gradeName',
          width: 25,
          example: exampleGradeName,
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
          gradeId: exampleGradeId,
          gradeName: exampleGradeName,
          description: 'منهج اللغة العربية للثانوية العامة',
        },
        {
          name: 'الرياضيات',
          gradeId: exampleGradeId,
          gradeName: exampleGradeName,
          description: 'الرياضيات العامة',
        },
      ],
      instructions: [
        'عمود "اسم المادة الدراسية" إلزامي وفريد داخل نفس المرحلة الدراسية بالمركز.',
        'عمود "معرف المرحلة (Grade ID)" إلزامي، يرجى نسخه من جدول المراحل المعتمدة في ورقة "دليل الاستيراد".',
        'عمود "المرحلة الدراسية (للتوضيح)" اختياري وللتوضيح فقط، ولا يُعتمد عليه في عملية التحقق أو الربط.',
        'عمود "الوصف" اختياري لوضع أي ملاحظات إضافية.',
        'يرجى عدم تعديل أو حذف صف العناوين الأول في ورقة البيانات.',
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
      gradeId: string;
      gradeName: string;
      description?: string;
    }>
  > {
    const { rows } = await this.excelService.parseSheetRows(fileBuffer, {
      expectedHeaders: ['اسم المادة الدراسية'],
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

    // جلب المراحل الدراسية النشطة للمركز للتحقق المسبق والربط بالـ ID
    const activeGrades = await this.prisma.grade.findMany({
      where: { centerId, isActive: true },
      select: { id: true, name: true },
    });
    const validGradeMap = new Map<string, string>(
      activeGrades.map((g) => [g.id, g.name]),
    );

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
      const rawGradeId: unknown =
        values['معرف المرحلة (Grade ID)'] ??
        values['معرف المرحلة'] ??
        values['gradeId'] ??
        values['اسم المرحلة الدراسية'];
      const rawGradeName: unknown =
        values['المرحلة الدراسية (للتوضيح)'] ?? values['اسم المرحلة الدراسية'];
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

      // 2. فحص معرف المرحلة الدراسية (Grade ID)
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
        continue;
      }

      const foundGradeName = validGradeMap.get(gradeIdStr);
      if (!foundGradeName) {
        errors.push({
          row: rowNumber,
          field: 'gradeId',
          value: gradeIdStr,
          message:
            'معرف المرحلة المدخل غير صالح أو لا ينتمي لهذا المركز أو غير نشط.',
        });
        continue;
      }

      gradeId = gradeIdStr;
      gradeName = gradeName || foundGradeName;

      const name = rawName.trim();
      const normalizedName = normalizeArabicText(name);
      const compoundKey = `${gradeId}_${normalizedName}`;

      // 3. التحقق من عدم التكرار داخل نفس الملف
      if (fileSubjectKeys.has(compoundKey)) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: name,
          message: `المادة الدراسية "${name}" مكررة لنفس المرحلة داخل نفس الملف المرفوع.`,
        });
        continue;
      }
      fileSubjectKeys.add(compoundKey);

      // 4. التحقق من عدم التكرار في قاعدة البيانات لنفس المرحلة والمركز
      if (existingSubjectKeys.has(compoundKey)) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: name,
          message: `المادة الدراسية "${name}" مسجلة بالفعل في هذه المرحلة بهذا المركز.`,
        });
        continue;
      }

      // 5. الوصف
      const description =
        rawDescription && typeof rawDescription === 'string'
          ? rawDescription.trim()
          : typeof rawDescription === 'number'
            ? String(rawDescription).trim()
            : null;

      validRowsToCreate.push({
        name,
        description,
        gradeId,
        gradeName,
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
          gradeId: r.gradeId,
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
