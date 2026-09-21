import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppRole } from '../../common/enums/app-role.enum';
import { PayMonthDto } from './dto/pay-month.dto';

import { ExcelService } from '../../shared/excel/excel.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelService: ExcelService,
  ) {}

  /**
   * تحويل أي تاريخ إلى اليوم الأول من الشهر في التوقيت العالمي (UTC midnight) لتسهيل المقارنة.
   */
  private normalizeToFirstOfMonth(input: string | Date): Date {
    let year: number;
    let month: number;

    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
      const parts = input.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1; // 0-based month
    } else {
      const dateObj = new Date(input);
      if (isNaN(dateObj.getTime())) {
        throw new BadRequestException('التاريخ المدخل غير صالح.');
      }
      year = dateObj.getUTCFullYear();
      month = dateObj.getUTCMonth();
    }

    return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  }

  /**
   * تنسيق التاريخ ليكون بصيغة YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * توليد قائمة التواريخ الشهرية للمجموعة بناءً على تاريخ البداية وعدد الأشهر.
   */
  private getGroupMonths(startDate: Date, monthsCount: number): Date[] {
    const months: Date[] = [];
    const normalizedStart = this.normalizeToFirstOfMonth(startDate);
    for (let i = 0; i < monthsCount; i++) {
      const d = new Date(
        Date.UTC(
          normalizedStart.getUTCFullYear(),
          normalizedStart.getUTCMonth() + i,
          1,
          0,
          0,
          0,
          0,
        ),
      );
      months.push(d);
    }
    return months;
  }

  /**
   * جلب تفاصيل مدفوعات طلاب مجموعة معينة.
   */
  async getGroupPayments(centerId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, centerId },
      include: {
        students: {
          include: {
            payments: {
              orderBy: { subscriptionDate: 'asc' },
            },
            student: {
              include: {
                user: {
                  select: {
                    fullName: true,
                    email: true,
                    phone: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    const groupMonths = this.getGroupMonths(group.startDate, group.monthsCount);
    const monthlyFee = Number(group.monthlyFee);

    const studentsData = group.students.map((gs) => {
      const studentStart = this.normalizeToFirstOfMonth(
        gs.subscriptionStartDate,
      );

      // الشهور المطلوبة هي شهور المجموعة التي تبدأ من تاريخ اشتراك الطالب فما فوق
      const requiredMonths = groupMonths
        .filter((m) => m.getTime() >= studentStart.getTime())
        .map((m) => this.formatDate(m));

      const paidMonths = gs.payments.map((p) => ({
        id: p.id,
        subscriptionDate: this.formatDate(p.subscriptionDate),
        amount: Number(p.amount),
        paidAt: p.paidAt,
        notes: p.notes,
      }));

      const paidDatesSet = new Set(paidMonths.map((pm) => pm.subscriptionDate));
      const unpaidMonths = requiredMonths.filter((rm) => !paidDatesSet.has(rm));

      return {
        groupStudentId: gs.id,
        studentId: gs.studentId,
        studentInfo: {
          fullName: gs.student.user.fullName,
          email: gs.student.user.email,
          phone: gs.student.user.phone,
          avatar: gs.student.user.avatar,
        },
        subscriptionStartDate: this.formatDate(gs.subscriptionStartDate),
        monthlyFee,
        requiredMonths,
        paidMonths,
        unpaidMonths,
      };
    });

    return studentsData;
  }

  /**
   * دفع اشتراك شهر معين لطالب في مجموعة.
   */
  async payMonth(centerId: string, groupStudentId: string, dto: PayMonthDto) {
    const groupStudent = await this.prisma.groupStudent.findUnique({
      where: { id: groupStudentId },
      include: {
        group: true,
      },
    });

    if (!groupStudent || groupStudent.group.centerId !== centerId) {
      throw new NotFoundException(
        'علاقة الطالب بالمجموعة غير موجودة في هذا المركز.',
      );
    }

    const targetMonth = this.normalizeToFirstOfMonth(dto.subscriptionDate);

    // التحقق من صحة وقوع الشهر ضمن فترة اشتراك الطالب بالمجموعة
    const groupStart = this.normalizeToFirstOfMonth(
      groupStudent.group.startDate,
    );
    const studentStart = this.normalizeToFirstOfMonth(
      groupStudent.subscriptionStartDate,
    );

    // فترة اشتراك الطالب تبدأ من الحد الأقصى بين بداية المجموعة وبداية اشتراك الطالب
    const activeStart =
      studentStart.getTime() > groupStart.getTime() ? studentStart : groupStart;
    const groupEnd = new Date(
      Date.UTC(
        groupStart.getUTCFullYear(),
        groupStart.getUTCMonth() + groupStudent.group.monthsCount - 1,
        1,
        0,
        0,
        0,
        0,
      ),
    );

    if (
      targetMonth.getTime() < activeStart.getTime() ||
      targetMonth.getTime() > groupEnd.getTime()
    ) {
      throw new BadRequestException(
        `تاريخ الاشتراك المدخل خارج فترة اشتراك الطالب بالمجموعة (الفترة المتاحة: من ${this.formatDate(
          activeStart,
        )} إلى ${this.formatDate(groupEnd)}).`,
      );
    }

    // التحقق من عدم دفع هذا الشهر مسبقاً
    const existingPayment = await this.prisma.monthlyPayment.findUnique({
      where: {
        groupStudentId_subscriptionDate: {
          groupStudentId,
          subscriptionDate: targetMonth,
        },
      },
    });

    if (existingPayment) {
      throw new ConflictException(
        'تم دفع اشتراك هذا الشهر بالفعل لهذا الطالب.',
      );
    }

    // حفظ الدفع بنجاح مع تسجيل القيمة الحالية للمجموعة
    return this.prisma.monthlyPayment.create({
      data: {
        groupStudentId,
        centerId,
        subscriptionDate: targetMonth,
        amount: groupStudent.group.monthlyFee,
        paidAt: new Date(),
        notes: dto.notes,
      },
    });
  }

  /**
   * جلب سجل مدفوعات طالب معين.
   */
  async getStudentPayments(
    centerId: string,
    studentId: string,
    userRole: AppRole,
    userId: string,
  ) {
    let resolvedStudentId = studentId;

    if (studentId === 'me') {
      const currentStudent = await this.prisma.student.findUnique({
        where: { userId },
      });
      if (!currentStudent) {
        throw new NotFoundException('حساب الطالب المطلوب غير موجود.');
      }
      resolvedStudentId = currentStudent.id;
    }

    const student = await this.prisma.student.findUnique({
      where: { id: resolvedStudentId },
      include: {
        user: true,
      },
    });

    if (!student || student.user.centerId !== centerId) {
      throw new NotFoundException('الطالب المطلوب غير موجود في هذا المركز.');
    }

    // التحقق من الصلاحيات الإضافية
    if (userRole === AppRole.STUDENT) {
      if (student.userId !== userId) {
        throw new ForbiddenException('ليس لديك صلاحية لعرض مدفوعات طالب آخر.');
      }
    } else if (userRole === AppRole.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
      });
      if (!teacher) {
        throw new NotFoundException('حساب المعلم الحالي غير موجود.');
      }

      // التحقق من أن الطالب مسجل في إحدى مجموعات هذا المعلم
      const isTeached = await this.prisma.groupStudent.findFirst({
        where: {
          studentId: resolvedStudentId,
          group: {
            teacherId: teacher.id,
            centerId,
          },
        },
      });

      if (!isTeached) {
        throw new ForbiddenException(
          'ليس لديك صلاحية لعرض مدفوعات هذا الطالب.',
        );
      }
    }

    const payments = await this.prisma.monthlyPayment.findMany({
      where: {
        centerId,
        groupStudent: {
          studentId: resolvedStudentId,
        },
      },
      include: {
        groupStudent: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        subscriptionDate: 'desc',
      },
    });

    return payments.map((p) => ({
      id: p.id,
      subscriptionDate: this.formatDate(p.subscriptionDate),
      amount: Number(p.amount),
      paidAt: p.paidAt,
      notes: p.notes,
      group: {
        id: p.groupStudent.group.id,
        name: p.groupStudent.group.name,
      },
    }));
  }

  /**
   * تصدير كشف مصفوفة مدفوعات المجموعة إلى ملف Excel.
   */
  async exportGroupPaymentsToExcel(
    centerId: string,
    groupId: string,
  ): Promise<Buffer> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, centerId },
      select: {
        id: true,
        name: true,
        startDate: true,
        monthsCount: true,
      },
    });

    if (!group) {
      throw new NotFoundException('المجموعة الدراسية المطلوبة غير موجودة.');
    }

    const studentsData = await this.getGroupPayments(centerId, groupId);
    const groupMonths = this.getGroupMonths(group.startDate, group.monthsCount);
    const monthHeaders = groupMonths.map((m) => this.formatDate(m));

    const columns = [
      { header: 'اسم الطالب', key: 'fullName', width: 25 },
      { header: 'رقم الهاتف', key: 'phone', width: 16, numFmt: '@' },
      ...monthHeaders.map((m) => ({
        header: m,
        key: `month_${m}`,
        width: 16,
      })),
      { header: 'الشهور المسددة', key: 'paidCount', width: 15 },
      { header: 'الشهور المستحقة', key: 'unpaidCount', width: 15 },
    ];

    const rows = studentsData.map((st) => {
      const row: Record<string, any> = {
        fullName: st.studentInfo.fullName,
        phone: st.studentInfo.phone || '—',
        paidCount: st.paidMonths.length,
        unpaidCount: st.unpaidMonths.length,
      };

      const paidMap = new Map(
        st.paidMonths.map((pm) => [pm.subscriptionDate, pm.amount]),
      );

      for (const m of monthHeaders) {
        if (paidMap.has(m)) {
          row[`month_${m}`] = `مدفوع (${paidMap.get(m)} ج.م)`;
        } else if (st.unpaidMonths.includes(m)) {
          row[`month_${m}`] = 'مستحق (غير مدفوع)';
        } else {
          row[`month_${m}`] = 'غير مسجل';
        }
      }

      return row;
    });

    return this.excelService.buildWorkbookBuffer({
      sheetName: group.name.slice(0, 31),
      columns,
      data: rows,
    });
  }

  /**
   * تصدير كشف حساب مدفوعات طالب محدد إلى ملف Excel.
   */
  async exportStudentPaymentsToExcel(
    centerId: string,
    studentId: string,
    userRole: AppRole,
    userId: string,
  ): Promise<Buffer> {
    const payments = await this.getStudentPayments(
      centerId,
      studentId,
      userRole,
      userId,
    );

    let resolvedStudentId = studentId;
    if (studentId === 'me') {
      const currentStudent = await this.prisma.student.findUnique({
        where: { userId },
      });
      if (currentStudent) {
        resolvedStudentId = currentStudent.id;
      }
    }

    const student = await this.prisma.student.findUnique({
      where: { id: resolvedStudentId },
      include: { user: { select: { fullName: true } } },
    });

    const studentName = student?.user?.fullName || 'الطالب';

    const columns = [
      { header: 'المجموعة الدراسية', key: 'groupName', width: 25 },
      { header: 'الشهر المستحق', key: 'subscriptionDate', width: 16 },
      { header: 'المبلغ المدفوع', key: 'amount', width: 16 },
      { header: 'تاريخ الدفع', key: 'paidAt', width: 18 },
      { header: 'ملاحظات', key: 'notes', width: 30 },
    ];

    const rows = payments.map((p) => ({
      groupName: p.group.name,
      subscriptionDate: p.subscriptionDate,
      amount: `${p.amount} ج.م`,
      paidAt: p.paidAt ? new Date(p.paidAt).toISOString().split('T')[0] : '—',
      notes: p.notes || '—',
    }));

    return this.excelService.buildWorkbookBuffer({
      sheetName: `مدفوعات ${studentName}`.slice(0, 31),
      columns,
      data: rows,
    });
  }
}
