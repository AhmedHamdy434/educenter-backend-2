import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../../common/utils/buildMeta';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { Response } from 'express';
import { ExcelService } from '../../shared/excel/excel.service';
import { PdfService } from '../../shared/pdf/pdf.service';
import {
  ExcelImportSummary,
  RowValidationError,
} from '../../shared/excel/interfaces/excel.interface';
import { normalizeArabicText } from '../../shared/excel/utils/arabic-normalizer.util';
import {
  gradeDetailsSelect,
  gradeListSelect,
  GradeDetails,
  GradeListItem,
} from './constants/grade.select';
import { CreateGradeDto } from './dto/create-grade.dto';
import { GradeQueryDto } from './dto/get-grades.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';

const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME_TYPE = 'application/pdf';

const GRADE_RELATION_COUNT_FIELDS = ['subjects', 'groups', 'enrollments'];

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelService: ExcelService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * إنشاء مرحلة دراسية جديدة تابعة لمركز معين مع التحقق من عدم تكرار الاسم في نفس المركز.
   */
  async create(centerId: string, data: CreateGradeDto): Promise<GradeListItem> {
    await this.ensureGradeNameIsUnique(centerId, data.name);

    return this.prisma.grade.create({
      data: {
        name: data.name,
        description: data.description,
        order: data.order ?? 0,
        centerId,
      },
      select: gradeListSelect,
    });
  }

  /**
   * جلب قائمة المراحل الدراسية لمركز معين مع دعم البحث، التصفية بالحالة، والـ Pagination والترتيب.
   */
  async findAll(
    centerId: string,
    query: GradeQueryDto,
  ): Promise<{ data: GradeDetails[]; meta: any }> {
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

    const orderBy = query.getOrderBy<
      | Prisma.GradeOrderByWithRelationInput
      | Prisma.GradeOrderByWithRelationInput[]
    >(
      ['name', 'order', 'createdAt'],
      [{ order: 'asc' }, { createdAt: 'desc' }],
      GRADE_RELATION_COUNT_FIELDS,
    );

    const [total, data] = await Promise.all([
      this.prisma.grade.count({ where }),
      this.prisma.grade.findMany({
        where,
        skip,
        take,
        select: gradeDetailsSelect,
        orderBy,
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);
    return { data, meta };
  }

  /**
   * جلب تفاصيل مرحلة دراسية معينة مع التحقق من تبعيتها للمركز.
   */
  async findOne(centerId: string, id: string): Promise<GradeListItem> {
    const grade = await this.prisma.grade.findFirst({
      where: { id, centerId },
      select: gradeListSelect,
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
  ): Promise<GradeListItem> {
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
      select: gradeListSelect,
    });
  }

  /**
   * تبديل حالة تفعيل مرحلة دراسية محددة (تفعيل/إلغاء تفعيل).
   */
  async toggleStatus(centerId: string, id: string): Promise<GradeListItem> {
    const currentGrade = await this.findOne(centerId, id);

    return this.prisma.grade.update({
      where: { id },
      data: { isActive: !currentGrade.isActive },
      select: gradeListSelect,
    });
  }

  async remove(centerId: string, id: string): Promise<void> {
    const grade = await this.prisma.grade.findFirst({
      where: { id, centerId },
      select: gradeDetailsSelect,
    });

    if (!grade) {
      throw new NotFoundException('المرحلة الدراسية المطلوبة غير موجودة.');
    }

    if (
      grade._count.subjects > 0 ||
      grade._count.groups > 0 ||
      grade._count.enrollments > 0
    ) {
      throw new BadRequestException(
        'لا يمكن حذف المرحلة الدراسية لوجود مواد أو مجموعات أو طلاب مرتبطين بها.',
      );
    }

    await this.prisma.grade.delete({
      where: { id },
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
   * جلب وتجهيز بيانات المراحل الدراسية للمركز بصيغة مصفوفة مهيأة للتصدير (Excel / PDF).
   */
  private async getExportDataset(centerId: string, query: GradeQueryDto) {
    const { active } = query;
    const where = query.getWhere<Prisma.GradeWhereInput>([
      'name',
      'description',
    ]);
    where.centerId = centerId;

    if (active !== undefined) {
      where.isActive = active;
    }

    const orderBy = query.getOrderBy<
      | Prisma.GradeOrderByWithRelationInput
      | Prisma.GradeOrderByWithRelationInput[]
    >(
      ['name', 'order', 'createdAt'],
      [{ order: 'asc' }, { createdAt: 'desc' }],
      GRADE_RELATION_COUNT_FIELDS,
    );

    const grades = await this.prisma.grade.findMany({
      where,
      orderBy,
      select: gradeDetailsSelect,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const rows = grades.map((g) => ({
      id: g.id,
      name: g.name,
      order: g.order,
      description: g.description || '—',
      status: g.isActive ? 'نشط' : 'معطل',
      subjectsCount: g._count?.subjects || 0,
      groupsCount: g._count?.groups || 0,
      studentsCount: g._count?.enrollments || 0,
      createdAt: g.createdAt
        ? new Date(g.createdAt).toISOString().split('T')[0]
        : '—',
    }));

    return { rows, dateStr };
  }

  /**
   * تصدير المراحل الدراسية لمركز معين إلى ملف Excel مع تطبيق الفلاتر ومعرفات الكيانات.
   */
  async exportToExcel(
    centerId: string,
    query: GradeQueryDto,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(centerId, query);

    const buffer = await this.excelService.buildWorkbookBuffer({
      sheetName: 'المراحل الدراسية',
      columns: [
        {
          header: 'معرف المرحلة (Grade ID)',
          key: 'id',
          width: 32,
          numFmt: '@',
        },
        { header: 'اسم المرحلة الدراسية', key: 'name', width: 25 },
        { header: 'الترتيب', key: 'order', width: 12 },
        { header: 'الوصف', key: 'description', width: 35 },
        { header: 'الحالة', key: 'status', width: 15 },
        { header: 'عدد المواد', key: 'subjectsCount', width: 14 },
        { header: 'عدد المجموعات', key: 'groupsCount', width: 15 },
        { header: 'عدد الطلاب', key: 'studentsCount', width: 14 },
        { header: 'تاريخ الإنشاء', key: 'createdAt', width: 18 },
      ],
      data: rows,
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        `grades-${dateStr}.xlsx`,
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تصدير المراحل الدراسية لمركز معين إلى ملف PDF مع تطبيق الفلاتر والبحث.
   */
  async exportToPdf(
    centerId: string,
    query: GradeQueryDto,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(centerId, query);

    const buffer = await this.pdfService.buildTablePdfBuffer({
      title: 'تقرير المراحل الدراسية',
      dateStr,
      columns: [
        { header: 'اسم المرحلة', key: 'name', width: '*', align: 'right' },
        { header: 'الترتيب', key: 'order', width: 35, align: 'center' },
        { header: 'الحالة', key: 'status', width: 45, align: 'center' },
        { header: 'المواد', key: 'subjectsCount', width: 35, align: 'center' },
        { header: 'المجموعات', key: 'groupsCount', width: 45, align: 'center' },
        { header: 'الطلاب', key: 'studentsCount', width: 35, align: 'center' },
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
        `grades-${dateStr}.pdf`,
        PDF_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد المراحل الدراسية.
   */
  async getImportTemplate(res?: Response): Promise<Buffer | void> {
    const buffer = await this.excelService.buildTemplateBuffer({
      dataSheetName: 'المراحل الدراسية',
      instructionsSheetName: 'دليل الاستيراد',
      columns: [
        {
          header: 'اسم المرحلة الدراسية',
          key: 'name',
          width: 25,
          example: 'الصف الأول الثانوي',
        },
        {
          header: 'الترتيب',
          key: 'order',
          width: 14,
          numFmt: '0',
          example: 1,
        },
        {
          header: 'الوصف',
          key: 'description',
          width: 35,
          example: 'المرحلة الثانوية العامة',
        },
      ],
      sampleRows: [
        {
          name: 'الصف الأول الثانوي',
          order: 1,
          description: 'الصف الأول الثانوي العام',
        },
        {
          name: 'الصف الثاني الثانوي',
          order: 2,
          description: 'الصف الثاني الثانوي العام',
        },
      ],
      instructions: [
        'عمود "اسم المرحلة الدراسية" إلزامي وفريد داخل المركز، ولا يجوز تكراره.',
        'عمود "الترتيب" اختياري ويقبل أرقاماً صحيحة فقط (0، 1، 2...). القيمة الافتراضية 0.',
        'عمود "الوصف" اختياري لوضع أي ملاحظات إضافية.',
        'يرجى عدم تعديل أو حذف صف العناوين الأول في ورقة البيانات.',
      ],
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        'grades-template.xlsx',
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * استيراد المراحل الدراسية من ملف Excel مع التحقق الدقيق وإرجاع أخطاء الصفوف (422) ودعم المعاينة (dryRun).
   */
  async importFromExcel(
    centerId: string,
    fileBuffer: Buffer,
    dryRun = false,
  ): Promise<
    ExcelImportSummary<{ name: string; order: number; description?: string }>
  > {
    const { rows } = await this.excelService.parseSheetRows(fileBuffer, {
      expectedHeaders: ['اسم المرحلة الدراسية'],
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'ملف Excel لا يحتوي على أي صفوف بيانات للاستيراد.',
      );
    }

    const errors: RowValidationError[] = [];
    const normalizedFileNames = new Set<string>();
    const validRowsToCreate: Array<{
      name: string;
      order: number;
      description?: string | null;
      centerId: string;
    }> = [];

    // جلب المراحل الحالية للمركز للتحقق المسبق من التكرار
    const existingGrades = await this.prisma.grade.findMany({
      where: { centerId },
      select: { name: true },
    });
    const existingNormalizedNames = new Set(
      existingGrades.map((g) => normalizeArabicText(g.name)),
    );

    for (const rowItem of rows) {
      const { rowNumber, values } = rowItem;
      const rawName: unknown = values['اسم المرحلة الدراسية'];
      const rawOrder: unknown = values['الترتيب'];
      const rawDescription: unknown = values['الوصف'];

      // 1. فحص الاسم
      if (
        !rawName ||
        typeof rawName !== 'string' ||
        rawName.trim().length === 0
      ) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: rawName,
          message: 'اسم المرحلة الدراسية حقل إلزامي ولا يمكن تركه فارغاً.',
        });
        continue;
      }

      const name = rawName.trim();
      const normalizedName = normalizeArabicText(name);

      // 2. فحص التكرار داخل نفس الملف
      if (normalizedFileNames.has(normalizedName)) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: name,
          message: `اسم المرحلة الدراسية "${name}" مكرر داخل نفس الملف المرفوع.`,
        });
        continue;
      }
      normalizedFileNames.add(normalizedName);

      // 3. فحص التكرار مع قاعدة البيانات لنفس المركز
      if (existingNormalizedNames.has(normalizedName)) {
        errors.push({
          row: rowNumber,
          field: 'name',
          value: name,
          message: `المرحلة الدراسية "${name}" مسجلة بالفعل في هذا المركز.`,
        });
        continue;
      }

      // 4. فحص الترتيب
      let order = 0;
      if (rawOrder !== undefined && rawOrder !== null && rawOrder !== '') {
        const parsedOrder = Number(rawOrder);
        if (
          isNaN(parsedOrder) ||
          !Number.isInteger(parsedOrder) ||
          parsedOrder < 0
        ) {
          errors.push({
            row: rowNumber,
            field: 'order',
            value: rawOrder,
            message: 'حقل الترتيب يجب أن يكون رقماً صحيحاً موجباً أو صفراً.',
          });
          continue;
        }
        order = parsedOrder;
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
        order,
        description,
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

    // إذا كان وضع الفحص والمعاينة (dryRun)
    if (dryRun) {
      return {
        totalRows: rows.length,
        validRows: validRowsToCreate.length,
        failedRows: 0,
        errors: [],
        data: validRowsToCreate.map((r) => ({
          name: r.name,
          order: r.order,
          description: r.description || undefined,
        })),
      };
    }

    // التنفيذ الفعلي في معاملة قاعدة البيانات
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.grade.createMany({
          data: validRowsToCreate,
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
            'فشل الاستيراد بسبب وجود مرحلة مسجلة مسبقاً بنفس الاسم (تضارب في البيانات).',
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
