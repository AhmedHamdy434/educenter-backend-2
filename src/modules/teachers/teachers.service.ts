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
  teacherDetailsSelect,
  teacherListSelect,
  TeacherDetails,
  TeacherListItem,
} from './constants/teacher.select';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherQueryDto } from './dto/get-teachers.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EGYPT_PHONE_REGEX = /^01[0125]\d{8}$/;
const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME_TYPE = 'application/pdf';
const TEACHER_RELATION_COUNT_FIELDS = {
  groups: 'groups',
  subjects: 'subjects',
};

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly subscriptionValidationService: SubscriptionValidationService,
    private readonly excelService: ExcelService,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * إنشاء معلم جديد مع حسابه وعلاقاته بالمواد التعليمية في معاملة واحدة.
   */
  async create(
    centerId: string,
    data: CreateTeacherDto,
  ): Promise<TeacherListItem> {
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
        select: teacherListSelect,
      });

      if (!result) {
        throw new NotFoundException('فشل استرجاع بيانات المعلم بعد الإنشاء.');
      }

      return result;
    });
  }

  /**
   * بناء كائن الترتيب (orderBy) للمعلمين مع دعم حقول المستخدم وعدادات العلاقات.
   */
  private buildOrderBy(
    query: TeacherQueryDto,
  ):
    | Prisma.TeacherOrderByWithRelationInput
    | Prisma.TeacherOrderByWithRelationInput[] {
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
      | Prisma.TeacherOrderByWithRelationInput
      | Prisma.TeacherOrderByWithRelationInput[]
    >(['createdAt'], [{ createdAt: 'desc' }], TEACHER_RELATION_COUNT_FIELDS);
  }

  /**
   * جلب قائمة المعلمين للمركز التعليمي الحالي مع دعم البحث، التصفية والـ Pagination.
   */
  async findAll(
    centerId: string,
    query: TeacherQueryDto,
  ): Promise<{ data: TeacherListItem[]; meta: any }> {
    const { skip, take, active, subjectId, gradeId } = query;

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

    if (subjectId || gradeId) {
      where.subjects = {
        some: {
          ...(subjectId && { subjectId }),
          ...(gradeId && { subject: { gradeId } }),
        },
      };
    }

    const orderBy = this.buildOrderBy(query);

    const [total, data] = await Promise.all([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
        where,
        skip,
        take,
        select: teacherListSelect,
        orderBy,
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
  ): Promise<TeacherListItem> {
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
        select: teacherListSelect,
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
  async toggleStatus(centerId: string, id: string): Promise<TeacherListItem> {
    const currentTeacher = await this.findOne(centerId, id);

    return this.prisma.$transaction(async (tx) => {
      await this.usersService.updateUserAccount(tx, currentTeacher.user.id, {
        isActive: !currentTeacher.user.isActive,
      });

      const result = await tx.teacher.findUnique({
        where: { id },
        select: teacherListSelect,
      });

      if (!result) {
        throw new NotFoundException('المعلم المطلوب غير موجود.');
      }

      return result;
    });
  }

  /**
   * حذف معلم معين مع حسابه بعد التحقق من عدم ارتباطه بأي مجموعات دراسية.
   */
  async remove(centerId: string, id: string): Promise<void> {
    const teacher = await this.findOne(centerId, id);

    if (teacher._count.groups > 0) {
      throw new BadRequestException(
        'لا يمكن حذف المعلم لوجود مجموعات دراسية مرتبطة به.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teacher.delete({
        where: { id },
      });
      await tx.user.delete({
        where: { id: teacher.user.id },
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
   * جلب وتجهيز بيانات المعلمين للمركز بصيغة مصفوفة مهيأة للتصدير (Excel / PDF).
   */
  private async getExportDataset(centerId: string, query: TeacherQueryDto) {
    const { active, subjectId } = query;

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

    const orderBy = this.buildOrderBy(query);

    const teachers = await this.prisma.teacher.findMany({
      where,
      select: teacherDetailsSelect,
      orderBy,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const rows = teachers.map((t) => {
      const subjectIds = t.subjects.map((s) => s.subject.id).join('، ') || '—';
      const subjectNames =
        t.subjects
          .map((s) => {
            const sName = s.subject.name;
            const gName = s.subject.grade?.name;
            return gName ? `${sName} (${gName})` : sName;
          })
          .join('، ') || '—';

      return {
        fullName: t.user.fullName,
        email: t.user.email,
        phone: t.user.phone || '—',
        subjectIds,
        subjects: subjectNames,
        status: t.user.isActive ? 'نشط' : 'معطل',
        groupsCount: t._count?.groups || 0,
        subjectsCount: t._count?.subjects || 0,
        bio: t.bio || '—',
        createdAt: t.createdAt
          ? new Date(t.createdAt).toISOString().split('T')[0]
          : '—',
      };
    });

    return { rows, dateStr };
  }

  /**
   * تصدير قائمة المدرسين للمركز إلى ملف Excel مع دعم الفلاتر والفرز.
   */
  async exportToExcel(
    centerId: string,
    query: TeacherQueryDto,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(centerId, query);

    const buffer = await this.excelService.buildWorkbookBuffer({
      sheetName: 'المدرسين',
      columns: [
        { header: 'اسم المدرس', key: 'fullName', width: 25 },
        { header: 'البريد الإلكتروني', key: 'email', width: 28 },
        { header: 'رقم الهاتف', key: 'phone', width: 18, numFmt: '@' },
        {
          header: 'معرفات المواد (Subject IDs)',
          key: 'subjectIds',
          width: 35,
          numFmt: '@',
        },
        { header: 'المواد المسندة', key: 'subjects', width: 35 },
        { header: 'الحالة', key: 'status', width: 14 },
        { header: 'عدد المجموعات', key: 'groupsCount', width: 15 },
        { header: 'عدد المواد', key: 'subjectsCount', width: 14 },
        { header: 'تاريخ الانضمام', key: 'createdAt', width: 18 },
        { header: 'نبذة تعريفية', key: 'bio', width: 30 },
      ],
      data: rows,
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        `teachers-${dateStr}.xlsx`,
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تصدير قائمة المدرسين للمركز إلى ملف PDF (Cairo Font RTL).
   */
  async exportToPdf(
    centerId: string,
    query: TeacherQueryDto,
    res?: Response,
  ): Promise<Buffer | void> {
    const { rows, dateStr } = await this.getExportDataset(centerId, query);

    const buffer = await this.pdfService.buildTablePdfBuffer({
      title: 'تقرير المدرسين',
      dateStr,
      columns: [
        { header: 'اسم المدرس', key: 'fullName', width: '*', align: 'right' },
        { header: 'الهاتف', key: 'phone', width: 80, align: 'center' },
        {
          header: 'المواد التعليمية',
          key: 'subjects',
          width: 120,
          align: 'right',
        },
        { header: 'الحالة', key: 'status', width: 45, align: 'center' },
        { header: 'المجموعات', key: 'groupsCount', width: 45, align: 'center' },
        { header: 'المواد', key: 'subjectsCount', width: 40, align: 'center' },
        {
          header: 'تاريخ الانضمام',
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
        `teachers-${dateStr}.pdf`,
        PDF_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * تحميل قالب Excel فارغ ومجهز لاستيراد بيانات المدرسين مع المواد المعتمدة.
   */
  async getImportTemplate(
    centerId: string,
    res?: Response,
  ): Promise<Buffer | void> {
    const subjects = await this.prisma.subject.findMany({
      where: { centerId, isActive: true },
      select: {
        id: true,
        name: true,
        grade: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const exampleSubjectId = subjects[0]?.id || 'subject_id_here';
    const exampleSubjectText = subjects[0]
      ? subjects[0].grade
        ? `${subjects[0].name} (${subjects[0].grade.name})`
        : subjects[0].name
      : 'لغة عربية';

    const buffer = await this.excelService.buildTemplateBuffer({
      dataSheetName: 'بيانات المدرسين',
      instructionsSheetName: 'دليل الاستيراد',
      columns: [
        {
          header: 'اسم المدرس',
          key: 'fullName',
          width: 25,
          example: 'محمد أحمد إبراهيم',
        },
        {
          header: 'البريد الإلكتروني',
          key: 'email',
          width: 28,
          example: 'teacher@example.com',
        },
        {
          header: 'رقم الهاتف',
          key: 'phone',
          width: 18,
          numFmt: '@',
          example: '01012345678',
        },
        {
          header: 'معرفات المواد (Subject IDs مفصولة بفاصلة)',
          key: 'subjectIds',
          width: 40,
          numFmt: '@',
          example: exampleSubjectId,
        },
        {
          header: 'المواد التعليمية (للتوضيح)',
          key: 'subjects',
          width: 35,
          example: exampleSubjectText,
        },
        {
          header: 'نبذة تعريفية',
          key: 'bio',
          width: 30,
          example: 'مدرس أول لغة عربية وخبير تربوي',
        },
      ],
      sampleRows: [
        {
          fullName: 'محمد أحمد إبراهيم',
          email: 'teacher@example.com',
          phone: '01012345678',
          subjectIds: exampleSubjectId,
          subjects: exampleSubjectText,
          bio: 'مدرس أول لغة عربية وخبير تربوي',
        },
      ],
      instructions: [
        'الحقول الإلزامية هي: (اسم المدرس، البريد الإلكتروني).',
        'البريد الإلكتروني يجب أن يكون فريداً وغير مستخدم لأي حساب آخر في النظام.',
        'رقم الهاتف اختياري، وفي حال إدخاله يجب أن يكون بصيغة مصرية صحيحة (11 رقماً تبدأ بـ 01).',
        'المواد التعليمية: أدخل معرفات المواد (Subject IDs) مفصولة بفاصلة في عمود "معرفات المواد (Subject IDs مفصولة بفاصلة)" من خلال نسخ الـ ID من جدول المواد المتاحة أدناه (مثال: id1,id2).',
        'عمود "المواد التعليمية (للتوضيح)" اختياري وللتوضيح فقط، ولا يُعتمد عليه في الربط.',
        'سيتم توليد كلمة مرور أولية موحدة للحسابات مع تفعيل خاصية إلزام تغيير كلمة المرور فور أول تسجيل دخول.',
        'يرجى عدم تعديل أو حذف صف العناوين في ورقة بيانات المدرسين.',
      ],
      referenceTables: [
        {
          title: 'المواد الدراسية المتاحة والمعتمدة في السنتر',
          headers: [
            'معرف المادة (Subject ID - للنسخ)',
            'اسم المادة والمرحلة الدراسية',
          ],
          rows:
            subjects.length > 0
              ? subjects.map((s) => ({
                  id: s.id,
                  name: s.grade ? `${s.name} (${s.grade.name})` : s.name,
                }))
              : [
                  {
                    id: 'لا يوجد',
                    name: 'لا توجد مواد دراسية مسجلة حالياً، يرجى إضافة مواد أولاً',
                  },
                ],
        },
      ],
    });

    if (res) {
      return this.sendFileDownload(
        res,
        buffer,
        'teachers-template.xlsx',
        EXCEL_MIME_TYPE,
      );
    }

    return buffer;
  }

  /**
   * استيراد المدرسين من ملف Excel عالي الأداء مع الحفظ الجماعي والتحقق الذري.
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
      subjectNames?: string;
    }> & { initialDefaultPassword?: string }
  > {
    // 1. قراءة صفوف الشيت وفحص العناوين الإلزامية
    const { rows } = await this.excelService.parseSheetRows(fileBuffer, {
      expectedHeaders: ['اسم المدرس', 'البريد الإلكتروني'],
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'ملف Excel لا يحتوي على أي صفوف بيانات للاستيراد.',
      );
    }

    // 2. التحقق من الحد الأقصى للمدرسين في باقة السنتر
    const plan =
      await this.subscriptionValidationService.getActiveSubscription(centerId);
    const currentTeachersCount = await this.prisma.teacher.count({
      where: { centerId },
    });

    if (currentTeachersCount + rows.length > plan.teacherLimit) {
      throw new BadRequestException(
        `لا يمكن استيراد ${rows.length} مدرس، لأن ذلك سيتجاوز الحد الأقصى المسموح به للمدرسين في باقتك الحالية (${plan.teacherLimit} مدرس). عدد المدرسين الحالي: ${currentTeachersCount}. يرجى ترقية الاشتراك.`,
      );
    }

    // 3. جلب المواد الدراسية النشطة للمركز
    const centerSubjects = await this.prisma.subject.findMany({
      where: { centerId, isActive: true },
      select: {
        id: true,
        name: true,
        grade: { select: { name: true } },
      },
    });
    const validSubjectMap = new Map<string, string>(
      centerSubjects.map((s) => [
        s.id,
        s.grade ? `${s.name} (${s.grade.name})` : s.name,
      ]),
    );

    // 4. فحص التكرار مع قاعدة البيانات دفعة واحدة (Prevent N+1)
    const fileCandidateEmails: string[] = [];
    const fileCandidatePhones: string[] = [];

    for (const r of rows) {
      const emailVal: unknown = r.values['البريد الإلكتروني'];
      if (typeof emailVal === 'string' && emailVal.trim()) {
        fileCandidateEmails.push(emailVal.trim().toLowerCase());
      }
      const phoneVal: unknown = r.values['رقم الهاتف'];
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
      subjectIds: string[];
      subjectNames: string;
      bio: string | null;
    }> = [];

    for (const rowItem of rows) {
      const { rowNumber, values } = rowItem;
      const rawFullName: unknown = values['اسم المدرس'];
      const rawEmail: unknown = values['البريد الإلكتروني'];
      const rawPhone: unknown = values['رقم الهاتف'];
      const rawSubjectIds: unknown =
        values['معرفات المواد (Subject IDs مفصولة بفاصلة)'] ??
        values['معرفات المواد'] ??
        values['subjectIds'] ??
        values['المواد التعليمية (مفصولة بفاصلة)'] ??
        values['المواد التعليمية'];
      const rawSubjectsText: unknown =
        values['المواد التعليمية (للتوضيح)'] ?? values['المواد التعليمية'];
      const rawBio: unknown = values['نبذة تعريفية'];

      // أ. اسم المدرس
      if (
        !rawFullName ||
        typeof rawFullName !== 'string' ||
        rawFullName.trim().length < 2
      ) {
        errors.push({
          row: rowNumber,
          field: 'fullName',
          value: rawFullName,
          message: 'اسم المدرس إلزامي ويجب ألا يقل عن حرفين.',
        });
      }

      // ب. البريد الإلكتروني
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

      // ج. رقم الهاتف
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
              'رقم الهاتف غير صالح، يجب أن يتكون من 11 رقماً ويبدأ بـ 01.',
          });
        } else if (fileSeenPhones.has(normalizedP)) {
          errors.push({
            row: rowNumber,
            field: 'phone',
            value: normalizedP,
            message: 'رقم الهاتف مكرر داخل نفس الملف المرفوع.',
          });
        } else if (dbExistingPhones.has(normalizedP)) {
          errors.push({
            row: rowNumber,
            field: 'phone',
            value: normalizedP,
            message: 'رقم الهاتف مسجل بالفعل.',
          });
        } else {
          fileSeenPhones.add(normalizedP);
          phone = normalizedP;
        }
      }

      // د. المواد التعليمية
      const subjectIds: string[] = [];
      const subjectNamesList: string[] = [];
      const subjectsInputStr =
        rawSubjectIds !== undefined && rawSubjectIds !== null
          ? String(rawSubjectIds).trim()
          : '';

      if (subjectsInputStr) {
        const parts = subjectsInputStr
          .split(/[,،]/)
          .map((p) => p.trim())
          .filter(Boolean);

        for (const part of parts) {
          const foundSubjectName = validSubjectMap.get(part);
          if (!foundSubjectName) {
            errors.push({
              row: rowNumber,
              field: 'subjectIds',
              value: part,
              message: `معرف المادة التعليمية "${part}" غير صالح أو لا ينتمي لهذا المركز أو غير نشط.`,
            });
          } else if (!subjectIds.includes(part)) {
            subjectIds.push(part);
            subjectNamesList.push(foundSubjectName);
          }
        }
      }

      const subjectsStr =
        subjectNamesList.join('، ') ||
        (typeof rawSubjectsText === 'string' ? rawSubjectsText.trim() : '');

      // هـ. النبذة التعريفية
      const bio =
        rawBio && typeof rawBio === 'string'
          ? rawBio.trim()
          : typeof rawBio === 'number'
            ? String(rawBio).trim()
            : null;

      if (errors.length === 0 || errors[errors.length - 1]?.row !== rowNumber) {
        validatedRows.push({
          fullName: String(rawFullName).trim(),
          email,
          phone,
          subjectIds,
          subjectNames: subjectsStr,
          bio,
        });
      }
    }

    // إذا وُجدت أي أخطاء، نرفض الملف بالكامل بكود 422 القياسي
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'تعذر استيراد الملف لوجود أخطاء في بيانات بعض المدرسين.',
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

    // وضع المعاينة (dryRun)
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
          subjectNames: r.subjectNames || undefined,
        })),
      };
    }

    // التنفيذ الجماعي الذري
    const initialDefaultPassword =
      'Teacher@' + Math.floor(100000 + Math.random() * 900000);
    const hashedPassword = await hashPassword(initialDefaultPassword);

    try {
      await this.prisma.$transaction(async (tx) => {
        // أ. إدخال المستخدمين دفعة واحدة
        const usersToInsert = validatedRows.map((r) => ({
          fullName: r.fullName,
          email: r.email,
          phone: r.phone,
          password: hashedPassword,
          role: 'TEACHER' as const,
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

        // ب. إدخال سجلات المدرسين دفعة واحدة
        const teachersToInsert = validatedRows.map((r) => {
          const userId = emailToUserId.get(r.email.toLowerCase());
          if (!userId) {
            throw new NotFoundException(
              'خطأ داخلي: تعذر مطابقة معرف المستخدم للمدرس.',
            );
          }
          return {
            userId,
            centerId,
            bio: r.bio,
          };
        });

        const createdTeachers = await tx.teacher.createManyAndReturn({
          data: teachersToInsert,
          select: { id: true, userId: true },
        });

        const userIdToTeacherId = new Map<string, string>();
        for (const t of createdTeachers) {
          userIdToTeacherId.set(t.userId, t.id);
        }

        // ج. إدخال علاقات المواد التعليمية دفعة واحدة
        const teacherSubjectsToInsert: Array<{
          teacherId: string;
          subjectId: string;
        }> = [];

        for (const r of validatedRows) {
          const userId = emailToUserId.get(r.email.toLowerCase());
          const teacherId = userId ? userIdToTeacherId.get(userId) : undefined;
          if (teacherId && r.subjectIds.length > 0) {
            for (const sId of r.subjectIds) {
              teacherSubjectsToInsert.push({
                teacherId,
                subjectId: sId,
              });
            }
          }
        }

        if (teacherSubjectsToInsert.length > 0) {
          await tx.teacherSubject.createMany({
            data: teacherSubjectsToInsert,
          });
        }
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
