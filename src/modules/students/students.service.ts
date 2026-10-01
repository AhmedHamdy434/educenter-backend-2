import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { buildMeta } from '../../common/utils/buildMeta';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SubscriptionValidationService } from '../subscription-plans/subscription-validation.service';
import { ExcelService } from '../../shared/excel/excel.service';
import { PdfService } from '../../shared/pdf/pdf.service';
import {
  ExcelImportSummary,
  RowValidationError,
} from '../../shared/excel/interfaces/excel.interface';
import { normalizeEgyptianPhone } from '../../shared/excel/utils/arabic-normalizer.util';
import {
  studentByCodeSelect,
  studentDetailsSelect,
  studentListSelect,
  StudentByCodeDetails,
  StudentDetails,
  StudentListItem,
} from './constants/student.select';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/get-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EGYPT_PHONE_REGEX = /^01[0125]\d{8}$/;
const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME_TYPE = 'application/pdf';
const STUDENT_RELATION_COUNT_FIELDS = {
  groups: 'groups',
  attendance: 'attendance',
};

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly subscriptionValidationService: SubscriptionValidationService,
    private readonly excelService: ExcelService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * توليد كود فريد للطالب غير مستخدم مسبقاً في النظام.
   * بصيغة ملائمة للباركود والـ QR Code والقراءة البشرية (مثل STU-104928).
   */
  async generateUniqueStudentCode(
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const maxAttempts = 15;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const candidateCode = `STU-${randomDigits}`;

      const existing = await client.student.findUnique({
        where: { code: candidateCode },
        select: { id: true },
      });

      if (!existing) {
        return candidateCode;
      }
    }

    const timestampSuffix = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    return `STU-${timestampSuffix}${randomSuffix}`;
  }

  /**
   * توليد مجموعة أكواد فريدة دفعة واحدة لعمليات الاستيراد الجماعي.
   */
  async generateBatchUniqueStudentCodes(
    count: number,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const client = tx ?? this.prisma;
    const codes = new Set<string>();

    while (codes.size < count) {
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const candidateCode = `STU-${randomDigits}`;
      if (!codes.has(candidateCode)) {
        const existing = await client.student.findUnique({
          where: { code: candidateCode },
          select: { id: true },
        });
        if (!existing) {
          codes.add(candidateCode);
        }
      }
    }

    return Array.from(codes);
  }

  /**
   * إنشاء طالب جديد مع حسابه وسجله الدراسي في معاملة واحدة.
   */
  async create(
    centerId: string,
    data: CreateStudentDto,
  ): Promise<StudentListItem> {
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

      // 3. توليد كود الطالب وإنشاء سجل الطالب
      const code = await this.generateUniqueStudentCode(tx);
      const student = await tx.student.create({
        data: {
          userId: user.id,
          centerId,
          code,
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

      // 5. استرجاع بيانات الطالب المنشأ
      const result = await tx.student.findUnique({
        where: { id: student.id },
        select: studentListSelect,
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
        { code: { contains: query.search, mode: 'insensitive' } },
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

    const orderBy = this.buildOrderBy(query);

    const [total, data] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        skip,
        take,
        select: studentListSelect,
        orderBy,
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
   * جلب بيانات الطالب للتعرف عليه بواسطة الكود أو الباركود مع مراعاة العزل التام للمركز.
   */
  async findByCode(
    centerId: string,
    rawCode: string,
  ): Promise<StudentByCodeDetails> {
    const code = rawCode?.trim();
    if (!code) {
      throw new BadRequestException('كود الطالب مطلوب.');
    }

    const searchCodes = [code.toUpperCase()];
    if (!code.toUpperCase().startsWith('STU-')) {
      searchCodes.push(`STU-${code.toUpperCase()}`);
    }

    const student = await this.prisma.student.findFirst({
      where: {
        centerId,
        code: { in: searchCodes },
      },
      select: studentByCodeSelect,
    });

    if (!student) {
      throw new NotFoundException(
        'لم يتم العثور على طالب بهذا الكود في هذا المركز.',
      );
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
  ): Promise<StudentListItem> {
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

      // 3. تحديث التسجيل في المرحلة الدراسية إذا تم تمريره وتغييره
      const currentActiveEnrollment =
        currentStudent.enrollments.find((e) => e.isActive) ??
        currentStudent.enrollments[0];
      const currentGradeId =
        currentActiveEnrollment?.grade?.id || currentActiveEnrollment?.gradeId;

      if (data.gradeId !== undefined && data.gradeId !== currentGradeId) {
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

      // 4. استرجاع بيانات الطالب المحدثة
      const result = await tx.student.findUnique({
        where: { id },
        select: studentListSelect,
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
  async toggleStatus(centerId: string, id: string): Promise<StudentListItem> {
    const currentStudent = await this.findOne(centerId, id);

    return this.prisma.$transaction(async (tx) => {
      await this.usersService.updateUserAccount(tx, currentStudent.user.id, {
        isActive: !currentStudent.user.isActive,
      });

      const result = await tx.student.findUnique({
        where: { id },
        select: studentListSelect,
      });

      if (!result) {
        throw new NotFoundException('الطالب المطلوب غير موجود.');
      }

      return result;
    });
  }

  /**
   * حذف طالب معين مع حسابه بعد التحقق من عدم ارتباطه بأي مجموعات دراسية أو سجلات حضور.
   */
  async remove(centerId: string, id: string): Promise<void> {
    const student = await this.findOne(centerId, id);

    if (student._count.groups > 0 || student._count.attendance > 0) {
      throw new BadRequestException(
        'لا يمكن حذف الطالب لوجود مجموعات دراسية أو سجلات حضور مرتبطة به.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.student.delete({
        where: { id },
      });
      await tx.user.delete({
        where: { id: student.user.id },
      });
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
   * بناء كائن الترتيب (orderBy) للطلاب مع دعم حقول المستخدم وعدادات العلاقات.
   */
  private buildOrderBy(
    query: StudentQueryDto,
  ):
    | Prisma.StudentOrderByWithRelationInput
    | Prisma.StudentOrderByWithRelationInput[] {
    const { sortBy, sortOrder } = query;
    const order = sortOrder || 'desc';

    if (
      sortBy === 'fullName' ||
      sortBy === 'name' ||
      sortBy === 'email' ||
      sortBy === 'phone'
    ) {
      const field = sortBy === 'name' ? 'fullName' : sortBy;
      return { user: { [field]: order } };
    }

    return query.getOrderBy<
      | Prisma.StudentOrderByWithRelationInput
      | Prisma.StudentOrderByWithRelationInput[]
    >(
      ['createdAt', 'parentPhone'],
      [{ createdAt: 'desc' }],
      STUDENT_RELATION_COUNT_FIELDS,
    );
  }

  /**
   * جلب وتجهيز بيانات الطلاب للمركز بصيغة مصفوفة مهيأة للتصدير (Excel / PDF).
   */
  private async getExportDataset(centerId: string, query: StudentQueryDto) {
    const { active, gradeId } = query;

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
        { code: { contains: query.search, mode: 'insensitive' } },
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

    const orderBy = this.buildOrderBy(query);

    const students = await this.prisma.student.findMany({
      where,
      select: studentDetailsSelect,
      orderBy,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const rows = students.map((s) => ({
      code: s.code,
      fullName: s.user.fullName,
      email: s.user.email,
      phone: s.user.phone || '—',
      parentPhone: s.parentPhone || '—',
      gradeId: s.enrollments[0]?.grade?.id || '—',
      gradeName: s.enrollments[0]?.grade?.name || '—',
      status: s.user.isActive ? 'نشط' : 'معطل',
      groupsCount: s._count?.groups || 0,
      attendanceCount: s._count?.attendance || 0,
      notes: s.notes || '—',
      createdAt: s.createdAt
        ? new Date(s.createdAt).toISOString().split('T')[0]
        : '—',
    }));

    return { rows, dateStr };
  }

  /**
   * تصدير قائمة الطلاب للمركز إلى ملف Excel مع دعم الفلاتر والفرز.
   */
  async exportToExcel(
    centerId: string,
    query: StudentQueryDto,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(centerId, query);

    const buffer = await this.excelService.buildWorkbookBuffer({
      sheetName: 'الطلاب',
      columns: [
        {
          header: 'كود الطالب (Code / Barcode)',
          key: 'code',
          width: 22,
          numFmt: '@',
        },
        { header: 'اسم الطالب', key: 'fullName', width: 25 },
        { header: 'البريد الإلكتروني', key: 'email', width: 28 },
        { header: 'رقم هاتف الطالب', key: 'phone', width: 18, numFmt: '@' },
        { header: 'رقم ولي الأمر', key: 'parentPhone', width: 18, numFmt: '@' },
        {
          header: 'معرف المرحلة (Grade ID)',
          key: 'gradeId',
          width: 30,
          numFmt: '@',
        },
        { header: 'المرحلة الدراسية', key: 'gradeName', width: 22 },
        { header: 'الحالة', key: 'status', width: 14 },
        { header: 'عدد المجموعات', key: 'groupsCount', width: 15 },
        { header: 'مرات الحضور', key: 'attendanceCount', width: 15 },
        { header: 'تاريخ التسجيل', key: 'createdAt', width: 18 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      data: rows,
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        `students-${dateStr}.xlsx`,
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تصدير قائمة الطلاب للمركز إلى ملف PDF (Cairo Font RTL).
   */
  async exportToPdf(
    centerId: string,
    query: StudentQueryDto,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(centerId, query);

    const buffer = await this.pdfService.buildTablePdfBuffer({
      title: 'تقرير الطلاب',
      dateStr,
      columns: [
        { header: 'اسم الطالب', key: 'fullName', width: '*', align: 'right' },
        { header: 'الهاتف', key: 'phone', width: 75, align: 'center' },
        { header: 'ولي الأمر', key: 'parentPhone', width: 75, align: 'center' },
        { header: 'المرحلة', key: 'gradeName', width: 85, align: 'right' },
        { header: 'الحالة', key: 'status', width: 45, align: 'center' },
        { header: 'المجموعات', key: 'groupsCount', width: 45, align: 'center' },
        {
          header: 'الحضور',
          key: 'attendanceCount',
          width: 45,
          align: 'center',
        },
        {
          header: 'تاريخ التسجيل',
          key: 'createdAt',
          width: 65,
          align: 'center',
        },
      ],
      data: rows,
      orientation: 'landscape',
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        `students-${dateStr}.pdf`,
        PDF_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد الطلاب مع قائمة المراحل المعتمدة بالمركز.
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
      dataSheetName: 'بيانات الطلاب',
      instructionsSheetName: 'دليل الاستيراد',
      columns: [
        {
          header: 'اسم الطالب',
          key: 'fullName',
          width: 25,
          example: 'أحمد محمود علي',
        },
        {
          header: 'البريد الإلكتروني',
          key: 'email',
          width: 28,
          example: 'ahmed.student@example.com',
        },
        {
          header: 'رقم هاتف الطالب',
          key: 'phone',
          width: 18,
          numFmt: '@',
          example: '01012345678',
        },
        {
          header: 'رقم ولي الأمر',
          key: 'parentPhone',
          width: 18,
          numFmt: '@',
          example: '01198765432',
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
          header: 'ملاحظات',
          key: 'notes',
          width: 30,
          example: 'طالب مستجد',
        },
      ],
      sampleRows: [
        {
          fullName: 'أحمد محمود علي',
          email: 'ahmed.student@example.com',
          phone: '01012345678',
          parentPhone: '01198765432',
          gradeId: exampleGradeId,
          gradeName: exampleGradeName,
          notes: 'طالب مستجد',
        },
      ],
      instructions: [
        'الحقول الإلزامية هي: (اسم الطالب، البريد الإلكتروني، معرف المرحلة Grade ID).',
        'يجب نسخ معرف المرحلة (Grade ID) المعتمد من ورقة "دليل الاستيراد" ولصقه في عمود "معرف المرحلة (Grade ID)".',
        'عمود "المرحلة الدراسية (للتوضيح)" اختياري وللتوضيح فقط، ولا يُعتمد عليه في عملية التحقق أو الربط.',
        'البريد الإلكتروني يجب أن يكون فريداً وغير مستخدم لأي حساب آخر.',
        'أرقام الهواتف (هاتف الطالب وهاتف ولي الأمر) اختيارية، وفي حال كتابتها يجب أن تكون بصيغة مصرية صحيحة (11 رقماً تبدأ بـ 01).',
        'سيتم توليد كلمة مرور أولية موحدة للحسابات مع تفعيل خاصية إلزام تغيير كلمة المرور فور أول تسجيل دخول.',
        'يرجى عدم تعديل أو حذف صف العناوين في ورقة بيانات الطلاب.',
      ],
      referenceTables: [
        {
          title: 'المراحل الدراسية المتاحة والمعتمدة في السنتر',
          headers: ['معرف المرحلة (Grade ID - للنسخ)', 'اسم المرحلة الدراسية'],
          rows:
            grades.length > 0
              ? grades.map((g) => ({ id: g.id, name: g.name }))
              : [
                  {
                    id: 'لا يوجد',
                    name: 'لا توجد مراحل مسجلة حالياً، يرجى إضافة مرحلة أولاً',
                  },
                ],
        },
      ],
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        'students-template.xlsx',
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * استيراد الطلاب من ملف Excel عالي الأداء مع الحفظ الجماعي وتشفير الهاش الموحد.
   */
  async importFromExcel(
    centerId: string,
    fileBuffer: Buffer,
    dryRun = false,
  ): Promise<
    ExcelImportSummary<{
      fullName: string;
      email: string;
      phone?: string;
      gradeId: string;
      gradeName: string;
    }> & { initialDefaultPassword?: string }
  > {
    // 1. قراءة صفوف الشيت وفحص العناوين الإلزامية
    const { rows } = await this.excelService.parseSheetRows(fileBuffer, {
      expectedHeaders: ['اسم الطالب', 'البريد الإلكتروني'],
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'ملف Excel لا يحتوي على أي صفوف بيانات للاستيراد.',
      );
    }

    // 2. التحقق من الحد الأقصى للطلاب في باقة الاشتراك النشطة
    const plan =
      await this.subscriptionValidationService.getActiveSubscription(centerId);
    const currentStudentsCount = await this.prisma.student.count({
      where: { centerId },
    });

    if (currentStudentsCount + rows.length > plan.studentLimit) {
      throw new BadRequestException(
        `لا يمكن استيراد ${rows.length} طالب، لأن ذلك سيتجاوز الحد الأقصى المسموح به للطلاب في باقتك الحالية (${plan.studentLimit} طالب). عدد الطلاب الحالي: ${currentStudentsCount}. يرجى ترقية الاشتراك.`,
      );
    }

    // 3. جلب المراحل الدراسية النشطة للمركز
    const centerGrades = await this.prisma.grade.findMany({
      where: { centerId, isActive: true },
      select: { id: true, name: true },
    });
    const validGradeMap = new Map<string, string>(
      centerGrades.map((g) => [g.id, g.name]),
    );

    // 4. استخراج كافة الإيميلات والهواتف لفحص التكرار مع قاعدة البيانات دفعة واحدة
    const fileCandidateEmails: string[] = [];
    const fileCandidatePhones: string[] = [];

    for (const r of rows) {
      const emailVal: unknown = r.values['البريد الإلكتروني'];
      if (typeof emailVal === 'string' && emailVal.trim()) {
        fileCandidateEmails.push(emailVal.trim().toLowerCase());
      }
      const phoneVal: unknown = r.values['رقم هاتف الطالب'];
      const normalizedP = normalizeEgyptianPhone(
        typeof phoneVal === 'string' || typeof phoneVal === 'number'
          ? phoneVal
          : '',
      );
      if (normalizedP) {
        fileCandidatePhones.push(normalizedP);
      }
    }

    const existingUsers = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { in: fileCandidateEmails } },
          ...(fileCandidatePhones.length > 0
            ? [{ phone: { in: fileCandidatePhones } }]
            : []),
        ],
      },
      select: { email: true, phone: true },
    });

    const dbExistingEmails = new Set(
      existingUsers.map((u) => u.email.toLowerCase()),
    );
    const dbExistingPhones = new Set(
      existingUsers
        .filter((u): u is typeof u & { phone: string } => Boolean(u.phone))
        .map((u) => u.phone),
    );

    // 5. التحقق من كل صف وجمع الأخطاء
    const errors: RowValidationError[] = [];
    const fileSeenEmails = new Set<string>();
    const fileSeenPhones = new Set<string>();

    const validatedRows: Array<{
      fullName: string;
      email: string;
      phone: string | null;
      parentPhone: string | null;
      gradeId: string;
      gradeName: string;
      notes: string | null;
    }> = [];

    for (const rowItem of rows) {
      const { rowNumber, values } = rowItem;
      const rawFullName: unknown = values['اسم الطالب'];
      const rawEmail: unknown = values['البريد الإلكتروني'];
      const rawPhone: unknown = values['رقم هاتف الطالب'];
      const rawParentPhone: unknown = values['رقم ولي الأمر'];
      const rawNotes: unknown = values['ملاحظات'];

      // أ. فحص اسم الطالب
      if (
        !rawFullName ||
        typeof rawFullName !== 'string' ||
        rawFullName.trim().length < 2
      ) {
        errors.push({
          row: rowNumber,
          field: 'fullName',
          value: rawFullName,
          message: 'اسم الطالب إلزامي ويجب ألا يقل عن حرفين.',
        });
      }

      // ب. فحص البريد الإلكتروني
      let email = '';
      if (!rawEmail || typeof rawEmail !== 'string') {
        errors.push({
          row: rowNumber,
          field: 'email',
          value: rawEmail,
          message: 'البريد الإلكتروني حقل إلزامي.',
        });
      } else {
        email = rawEmail.trim().toLowerCase();
        if (!EMAIL_REGEX.test(email)) {
          errors.push({
            row: rowNumber,
            field: 'email',
            value: rawEmail,
            message: 'صيغة البريد الإلكتروني غير صالحة.',
          });
        } else if (fileSeenEmails.has(email)) {
          errors.push({
            row: rowNumber,
            field: 'email',
            value: email,
            message: 'البريد الإلكتروني مكرر داخل نفس الملف المرفوع.',
          });
        } else if (dbExistingEmails.has(email)) {
          errors.push({
            row: rowNumber,
            field: 'email',
            value: email,
            message: 'البريد الإلكتروني غير متاح للاستخدام.',
          });
        } else {
          fileSeenEmails.add(email);
        }
      }

      // ج. فحص رقم هاتف الطالب
      let phone: string | null = null;
      if (rawPhone !== undefined && rawPhone !== null && rawPhone !== '') {
        const normalizedP = normalizeEgyptianPhone(
          typeof rawPhone === 'string' || typeof rawPhone === 'number'
            ? rawPhone
            : '',
        );
        if (!EGYPT_PHONE_REGEX.test(normalizedP)) {
          errors.push({
            row: rowNumber,
            field: 'phone',
            value: rawPhone,
            message:
              'رقم هاتف الطالب غير صالح، يجب أن يتكون من 11 رقماً ويبدأ بـ 01.',
          });
        } else if (fileSeenPhones.has(normalizedP)) {
          errors.push({
            row: rowNumber,
            field: 'phone',
            value: normalizedP,
            message: 'رقم هاتف الطالب مكرر داخل نفس الملف المرفوع.',
          });
        } else if (dbExistingPhones.has(normalizedP)) {
          errors.push({
            row: rowNumber,
            field: 'phone',
            value: normalizedP,
            message: 'رقم هاتف الطالب مسجل بالفعل.',
          });
        } else {
          fileSeenPhones.add(normalizedP);
          phone = normalizedP;
        }
      }

      // د. فحص رقم هاتف ولي الأمر
      let parentPhone: string | null = null;
      if (
        rawParentPhone !== undefined &&
        rawParentPhone !== null &&
        rawParentPhone !== ''
      ) {
        const normalizedParentP = normalizeEgyptianPhone(
          typeof rawParentPhone === 'string' ||
            typeof rawParentPhone === 'number'
            ? rawParentPhone
            : '',
        );
        if (!EGYPT_PHONE_REGEX.test(normalizedParentP)) {
          errors.push({
            row: rowNumber,
            field: 'parentPhone',
            value: rawParentPhone,
            message:
              'رقم ولي الأمر غير صالح، يجب أن يتكون من 11 رقماً ويبدأ بـ 01.',
          });
        } else {
          parentPhone = normalizedParentP;
        }
      }

      // هـ. فحص معرف المرحلة الدراسية (Grade ID)
      const rawGradeId: unknown =
        values['معرف المرحلة (Grade ID)'] ??
        values['معرف المرحلة'] ??
        values['gradeId'] ??
        values['المرحلة الدراسية'];
      const rawGradeName: unknown =
        values['المرحلة الدراسية (للتوضيح)'] ?? values['المرحلة الدراسية'];

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
        const foundGradeName = validGradeMap.get(gradeIdStr);
        if (!foundGradeName) {
          errors.push({
            row: rowNumber,
            field: 'gradeId',
            value: gradeIdStr,
            message:
              'معرف المرحلة المدخل غير صالح أو لا ينتمي لهذا المركز أو غير نشط.',
          });
        } else {
          gradeId = gradeIdStr;
          gradeName = gradeName || foundGradeName;
        }
      }

      // و. الملاحظات
      const notes =
        rawNotes && typeof rawNotes === 'string'
          ? rawNotes.trim()
          : typeof rawNotes === 'number'
            ? String(rawNotes).trim()
            : null;

      if (errors.length === 0 || errors[errors.length - 1]?.row !== rowNumber) {
        validatedRows.push({
          fullName: String(rawFullName).trim(),
          email,
          phone,
          parentPhone,
          gradeId,
          gradeName,
          notes,
        });
      }
    }

    // إذا وُجدت أي أخطاء، نرفض العملية بالكامل بكود 422
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'تعذر استيراد الملف لوجود أخطاء في بيانات بعض الطلاب.',
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
        validRows: validatedRows.length,
        failedRows: 0,
        errors: [],
        data: validatedRows.map((r) => ({
          fullName: r.fullName,
          email: r.email,
          phone: r.phone || undefined,
          gradeId: r.gradeId,
          gradeName: r.gradeName,
        })),
      };
    }

    // 6. التنفيذ الجماعي فائق السرعة عبر Prisma 7
    // توليد كلمة مرور أولية موحدة للدفعة وتشفيرها مرة واحدة فقط عبر bcrypt (80ms بدلاً من 4 دقائق!)
    const initialDefaultPassword =
      'Student@' + Math.floor(100000 + Math.random() * 900000);
    const hashedPassword = await hashPassword(initialDefaultPassword);

    try {
      await this.prisma.$transaction(async (tx) => {
        // أ. إدخال المستخدمين دفعة واحدة والحصول على الـ IDs
        const usersToInsert = validatedRows.map((r) => ({
          fullName: r.fullName,
          email: r.email,
          phone: r.phone,
          password: hashedPassword,
          role: 'STUDENT' as const,
          centerId,
          isActive: true,
          mustChangePassword: true,
        }));

        const createdUsers = await tx.user.createManyAndReturn({
          data: usersToInsert,
          select: { id: true, email: true },
        });

        const emailToUserId = new Map<string, string>();
        for (const u of createdUsers) {
          emailToUserId.set(u.email.toLowerCase(), u.id);
        }

        const generatedCodes = await this.generateBatchUniqueStudentCodes(
          validatedRows.length,
          tx,
        );

        // ب. إدخال سجلات الطلاب دفعة واحدة والحصول على الـ IDs
        const studentsToInsert = validatedRows.map((r, index) => {
          const userId = emailToUserId.get(r.email.toLowerCase());
          if (!userId) {
            throw new NotFoundException(
              'خطأ داخلي: تعذر مطابقة معرف المستخدم للطالب.',
            );
          }
          return {
            userId,
            centerId,
            code: generatedCodes[index],
            parentPhone: r.parentPhone,
            notes: r.notes,
          };
        });

        const createdStudents = await tx.student.createManyAndReturn({
          data: studentsToInsert,
          select: { id: true, userId: true },
        });

        const userIdToStudentId = new Map<string, string>();
        for (const s of createdStudents) {
          userIdToStudentId.set(s.userId, s.id);
        }

        // ج. إدخال تسجيلات المراحل الدراسية دفعة واحدة
        const enrollmentsToInsert = validatedRows.map((r) => {
          const userId = emailToUserId.get(r.email.toLowerCase());
          const studentId = userId ? userIdToStudentId.get(userId) : undefined;
          if (!studentId) {
            throw new NotFoundException(
              'خطأ داخلي: تعذر مطابقة معرف الطالب للتسجيل.',
            );
          }
          return {
            studentId,
            gradeId: r.gradeId,
            isActive: true,
          };
        });

        await tx.studentEnrollment.createMany({
          data: enrollmentsToInsert,
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
            'فشل الاستيراد بسبب وجود تضارب متزامن في البريد أو الهاتف مع حساب آخر.',
          error: 'Unprocessable Entity',
        });
      }
      throw err;
    }

    return {
      totalRows: rows.length,
      validRows: validatedRows.length,
      failedRows: 0,
      errors: [],
      initialDefaultPassword,
    };
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
