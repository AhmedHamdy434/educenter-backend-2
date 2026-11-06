import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ExcelService } from '../../shared/excel/excel.service';
import {
  Prisma,
  SettlementStatus,
  TeacherEarningType,
  ObligationStatus,
} from '@prisma/client';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { GetSettlementsDto } from './dto/get-settlements.dto';
import { GetTeachersOverviewDto } from './dto/get-teachers-overview.dto';
import { CancelSettlementDto } from './dto/cancel-settlement.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { buildMeta } from '../../common/utils/buildMeta';
import { AllocationPlan } from './interfaces/teacher-settlements.interface';

@Injectable()
export class TeacherSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelService: ExcelService,
  ) {}

  /**
   * استعراض النظرة المالية الشاملة لمستحقات وتسويات جميع المعلمين في السنتر.
   */
  async getTeachersFinancialOverview(
    centerId: string,
    query?: GetTeachersOverviewDto,
  ) {
    const whereTeacher: Prisma.TeacherWhereInput = {
      centerId,
    };

    if (query?.search?.trim()) {
      const term = query.search.trim();
      whereTeacher.user = {
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
        ],
      };
    }

    const teachers = await this.prisma.teacher.findMany({
      where: whereTeacher,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        earningEntries: {
          where: { centerId },
          select: {
            id: true,
            type: true,
            amount: true,
            allocatedToSettlementAmount: true,
          },
        },
        settlements: {
          where: { centerId },
          select: {
            id: true,
            amount: true,
            status: true,
          },
        },
      },
      orderBy: {
        user: { fullName: 'asc' },
      },
    });

    let centerTotalGrossEarnings = new Prisma.Decimal(0);
    let centerTotalRefunds = new Prisma.Decimal(0);
    let centerTotalNetEarnings = new Prisma.Decimal(0);
    let centerTotalSettled = new Prisma.Decimal(0);
    let centerTotalPending = new Prisma.Decimal(0);
    let centerTotalOutstanding = new Prisma.Decimal(0);
    let centerTotalAvailable = new Prisma.Decimal(0);

    const teacherRows = teachers.map((teacher) => {
      let grossEarnings = new Prisma.Decimal(0);
      let refundAdjustments = new Prisma.Decimal(0);
      let unsettledEntriesCount = 0;

      for (const entry of teacher.earningEntries) {
        if (entry.type === TeacherEarningType.EARNING) {
          grossEarnings = grossEarnings.plus(entry.amount);
          if (entry.allocatedToSettlementAmount.lessThan(entry.amount)) {
            unsettledEntriesCount++;
          }
        } else if (entry.type === TeacherEarningType.REFUND_ADJUSTMENT) {
          refundAdjustments = refundAdjustments.plus(entry.amount);
        }
      }

      const netEarnings = grossEarnings.minus(refundAdjustments);

      let settledAmount = new Prisma.Decimal(0);
      let pendingAmount = new Prisma.Decimal(0);

      for (const settlement of teacher.settlements) {
        if (settlement.status === SettlementStatus.COMPLETED) {
          settledAmount = settledAmount.plus(settlement.amount);
        } else if (settlement.status === SettlementStatus.PENDING) {
          pendingAmount = pendingAmount.plus(settlement.amount);
        }
      }

      const outstandingLiabilities = netEarnings.minus(settledAmount);
      const availableCalculated = outstandingLiabilities.minus(pendingAmount);
      const availablePayableBalance = availableCalculated.greaterThan(0)
        ? availableCalculated
        : new Prisma.Decimal(0);

      centerTotalGrossEarnings = centerTotalGrossEarnings.plus(grossEarnings);
      centerTotalRefunds = centerTotalRefunds.plus(refundAdjustments);
      centerTotalNetEarnings = centerTotalNetEarnings.plus(netEarnings);
      centerTotalSettled = centerTotalSettled.plus(settledAmount);
      centerTotalPending = centerTotalPending.plus(pendingAmount);
      centerTotalOutstanding = centerTotalOutstanding.plus(
        outstandingLiabilities,
      );
      centerTotalAvailable = centerTotalAvailable.plus(availablePayableBalance);

      return {
        teacherId: teacher.id,
        name: teacher.user.fullName,
        phone: teacher.user.phone,
        email: teacher.user.email,
        grossEarnings: Number(grossEarnings.toFixed(2)),
        refundAdjustments: Number(refundAdjustments.toFixed(2)),
        netEarnings: Number(netEarnings.toFixed(2)),
        settledAmount: Number(settledAmount.toFixed(2)),
        pendingAmount: Number(pendingAmount.toFixed(2)),
        outstandingLiabilities: Number(outstandingLiabilities.toFixed(2)),
        availablePayableBalance: Number(availablePayableBalance.toFixed(2)),
        unsettledEntriesCount,
      };
    });

    return {
      summary: {
        totalGrossEarnings: Number(centerTotalGrossEarnings.toFixed(2)),
        totalRefunds: Number(centerTotalRefunds.toFixed(2)),
        totalNetEarnings: Number(centerTotalNetEarnings.toFixed(2)),
        totalSettled: Number(centerTotalSettled.toFixed(2)),
        totalPending: Number(centerTotalPending.toFixed(2)),
        totalOutstanding: Number(centerTotalOutstanding.toFixed(2)),
        totalAvailable: Number(centerTotalAvailable.toFixed(2)),
        teachersCount: teachers.length,
      },
      teachers: teacherRows,
    };
  }

  /**
   * جلب البنود غير المسواة للمعلم لإتاحة الاختيار اليدوي أو المراجعة التفصيلية.
   */
  async getTeacherUnsettledEarnings(centerId: string, teacherId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, centerId },
      include: { user: { select: { fullName: true, phone: true } } },
    });

    if (!teacher) {
      throw new NotFoundException('المعلم غير موجود في هذا السنتر.');
    }

    const earningEntries = await this.prisma.teacherEarningEntry.findMany({
      where: {
        centerId,
        teacherId,
        type: TeacherEarningType.EARNING,
      },
      include: {
        sourceAllocation: {
          include: {
            transaction: {
              select: {
                receiptNumber: true,
                paymentDate: true,
                paymentMethod: true,
              },
            },
            obligation: {
              select: {
                id: true,
                type: true,
                periodDate: true,
                group: { select: { id: true, name: true } },
                student: {
                  select: { id: true, user: { select: { fullName: true } } },
                },
                extraSession: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const unsettled = earningEntries
      .filter((entry) =>
        entry.allocatedToSettlementAmount.lessThan(entry.amount),
      )
      .map((entry) => {
        const remainingUnsettled = entry.amount.minus(
          entry.allocatedToSettlementAmount,
        );
        const obligation = entry.sourceAllocation?.obligation;
        const studentName = obligation?.student?.user?.fullName || 'طالب';
        const groupOrSessionName =
          obligation?.group?.name ||
          obligation?.extraSession?.title ||
          'مجموعة';

        return {
          id: entry.id,
          entryNumber: entry.entryNumber,
          entryDate: entry.entryDate,
          totalAmount: Number(entry.amount.toFixed(2)),
          allocatedAmount: Number(entry.allocatedToSettlementAmount.toFixed(2)),
          remainingUnsettledAmount: Number(remainingUnsettled.toFixed(2)),
          notes: entry.notes,
          studentName,
          groupOrSessionName,
          obligationType: obligation?.type || 'MONTHLY_TUITION',
          periodDate: obligation?.periodDate,
          receiptNumber: entry.sourceAllocation?.transaction?.receiptNumber,
          paymentDate: entry.sourceAllocation?.transaction?.paymentDate,
          paymentMethod: entry.sourceAllocation?.transaction?.paymentMethod,
        };
      });

    return {
      teacher: {
        id: teacher.id,
        name: teacher.user.fullName,
        phone: teacher.user.phone,
      },
      entries: unsettled,
    };
  }

  /**
   * إنشاء تسوية مالية جديدة للمعلم مع قفل تشاؤمي للحماية التامة من التخصيص المزدوج أو التضارب.
   */
  async createSettlement(
    centerId: string,
    userId: string,
    dto: CreateSettlementDto,
  ) {
    const settlementAmount = new Prisma.Decimal(dto.amount);
    if (settlementAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('مبلغ التسوية يجب أن يكون أكبر من الصفر.');
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: { id: dto.teacherId, centerId },
    });
    if (!teacher) {
      throw new NotFoundException('المعلم المحدد غير موجود في هذا السنتر.');
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // 1. القفل التشاؤمي على بنود مستحقات المعلم (EARNING) غير المسواة بالكامل
        const lockedEntries = await tx.$queryRaw<
          Array<{
            id: string;
            amount: Prisma.Decimal;
            allocatedToSettlementAmount: Prisma.Decimal;
          }>
        >`
          SELECT id, amount, "allocatedToSettlementAmount"
          FROM "TeacherEarningEntry"
          WHERE "teacherId" = ${dto.teacherId}
            AND "centerId" = ${centerId}
            AND "type" = 'EARNING'
            AND "allocatedToSettlementAmount" < amount
          ORDER BY "createdAt" ASC
          FOR UPDATE
        `;

        if (!lockedEntries || lockedEntries.length === 0) {
          throw new BadRequestException(
            'لا توجد مستحقات مالية متاحة للصرف لهذا المعلم.',
          );
        }

        // 2. تحديد خطة التخصيص (إما مخصصة بالطلب أو تلقائية FIFO)
        const allocationPlan: AllocationPlan[] = [];

        if (dto.allocations && dto.allocations.length > 0) {
          let sumAllocated = new Prisma.Decimal(0);
          const lockedMap = new Map<
            string,
            { amount: Prisma.Decimal; allocated: Prisma.Decimal }
          >();
          for (const e of lockedEntries) {
            lockedMap.set(e.id, {
              amount: new Prisma.Decimal(e.amount),
              allocated: new Prisma.Decimal(e.allocatedToSettlementAmount),
            });
          }

          for (const item of dto.allocations) {
            const entryData = lockedMap.get(item.earningEntryId);
            if (!entryData) {
              throw new BadRequestException(
                `بند المستحق برقم ${item.earningEntryId} غير متاح أو تمت تسويته بالفعل.`,
              );
            }
            const itemAmount = new Prisma.Decimal(item.amount);
            const remainingOnEntry = entryData.amount.minus(
              entryData.allocated,
            );
            if (itemAmount.greaterThan(remainingOnEntry)) {
              throw new BadRequestException(
                `المبلغ المخصص (${item.amount} ج.م) للبند ${item.earningEntryId} يتجاوز المبلغ المتبقي غير المسوى (${remainingOnEntry} ج.م).`,
              );
            }

            allocationPlan.push({
              earningEntryId: item.earningEntryId,
              amountToAllocate: itemAmount,
            });
            sumAllocated = sumAllocated.plus(itemAmount);
          }

          if (!sumAllocated.equals(settlementAmount)) {
            throw new BadRequestException(
              `مجموع المبالغ المخصصة (${sumAllocated} ج.م) لا يتطابق مع إجمالي مبلغ التسوية المطلوب (${settlementAmount} ج.م).`,
            );
          }
        } else {
          // تخصيص تلقائي ذكي FIFO
          let remainingToAllocate = settlementAmount;

          for (const entry of lockedEntries) {
            if (remainingToAllocate.lessThanOrEqualTo(0)) break;

            const entryAmount = new Prisma.Decimal(entry.amount);
            const entryAllocated = new Prisma.Decimal(
              entry.allocatedToSettlementAmount,
            );
            const availableOnEntry = entryAmount.minus(entryAllocated);

            if (availableOnEntry.lessThanOrEqualTo(0)) continue;

            const toAllocate = Prisma.Decimal.min(
              remainingToAllocate,
              availableOnEntry,
            );
            allocationPlan.push({
              earningEntryId: entry.id,
              amountToAllocate: toAllocate,
            });
            remainingToAllocate = remainingToAllocate.minus(toAllocate);
          }

          if (remainingToAllocate.greaterThan(0)) {
            throw new BadRequestException(
              `مبلغ التسوية (${settlementAmount} ج.م) يتجاوز إجمالي المستحقات المتاحة للصرف حالياً (${settlementAmount.minus(remainingToAllocate)} ج.م).`,
            );
          }
        }

        // 3. إنشاء سجل التسوية
        const now = new Date();
        const settlementsCount = await tx.teacherSettlement.count({
          where: { centerId },
        });
        const settlementNumber = `SET-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(settlementsCount + 1).padStart(6, '0')}`;
        const targetStatus = dto.status || SettlementStatus.COMPLETED;

        const settlement = await tx.teacherSettlement.create({
          data: {
            centerId,
            teacherId: dto.teacherId,
            settlementNumber,
            amount: settlementAmount,
            status: targetStatus,
            paymentMethod: dto.paymentMethod,
            referenceNumber: dto.referenceNumber,
            notes: dto.notes,
            settlementDate: now,
            settledAt: targetStatus === SettlementStatus.COMPLETED ? now : null,
            createdById: userId,
          },
        });

        // 4. إنشاء عناصر التسوية (SettlementItems) وتحديث allocatedToSettlementAmount على البنود الأصلية
        for (const plan of allocationPlan) {
          await tx.settlementItem.create({
            data: {
              settlementId: settlement.id,
              earningEntryId: plan.earningEntryId,
              allocatedAmount: plan.amountToAllocate,
            },
          });

          await tx.teacherEarningEntry.update({
            where: { id: plan.earningEntryId },
            data: {
              allocatedToSettlementAmount: {
                increment: plan.amountToAllocate,
              },
            },
          });
        }

        // 5. إذا كانت التسوية مكتملة مباشرة (COMPLETED)، نسجل قيد الصرف في الدفتر المحاسبي
        if (targetStatus === SettlementStatus.COMPLETED) {
          const earningCount = await tx.teacherEarningEntry.count({
            where: { centerId },
          });
          const entryNumber = `TEE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(earningCount + 1).padStart(6, '0')}`;

          await tx.teacherEarningEntry.create({
            data: {
              centerId,
              teacherId: dto.teacherId,
              entryNumber,
              type: TeacherEarningType.SETTLEMENT,
              amount: settlementAmount,
              sourceSettlementId: settlement.id,
              allocatedToSettlementAmount: settlementAmount,
              entryDate: now,
              notes: dto.notes || `صرف تسوية مالية برقم ${settlementNumber}`,
            },
          });
        }

        return settlement;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  }

  /**
   * جلب قائمة التسويات مع الفلاتر والصفحات.
   */
  async getSettlements(centerId: string, query: GetSettlementsDto) {
    const where: Prisma.TeacherSettlementWhereInput = {
      centerId,
    };

    if (query.teacherId) {
      where.teacherId = query.teacherId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.from || query.to) {
      where.settlementDate = {};
      if (query.from) {
        where.settlementDate.gte = new Date(query.from);
      }
      if (query.to) {
        const toDate = new Date(query.to);
        toDate.setHours(23, 59, 59, 999);
        where.settlementDate.lte = toDate;
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.teacherSettlement.count({ where }),
      this.prisma.teacherSettlement.findMany({
        where,
        skip: query.skip,
        take: query.take,
        include: {
          teacher: {
            select: {
              id: true,
              user: {
                select: {
                  fullName: true,
                  phone: true,
                },
              },
            },
          },
          items: {
            include: {
              earningEntry: {
                select: {
                  id: true,
                  entryNumber: true,
                  amount: true,
                  entryDate: true,
                  notes: true,
                },
              },
            },
          },
        },
        orderBy: { settlementDate: 'desc' },
      }),
    ]);

    const formatted = data.map((item) => ({
      id: item.id,
      settlementNumber: item.settlementNumber,
      teacherId: item.teacherId,
      teacherName: item.teacher.user.fullName,
      teacherPhone: item.teacher.user.phone,
      amount: Number(item.amount.toFixed(2)),
      status: item.status,
      paymentMethod: item.paymentMethod,
      referenceNumber: item.referenceNumber,
      notes: item.notes,
      settlementDate: item.settlementDate,
      settledAt: item.settledAt,
      cancelledAt: item.cancelledAt,
      cancellationReason: item.cancellationReason,
      itemsCount: item.items.length,
      createdAt: item.createdAt,
    }));

    return {
      data: formatted,
      meta: buildMeta(query.page, query.limit, total),
    };
  }

  /**
   * جلب تفاصيل تسوية واحدة شاملة البنود والمستحقات المرتبطة.
   */
  async getSettlementById(centerId: string, id: string) {
    const settlement = await this.prisma.teacherSettlement.findFirst({
      where: { id, centerId },
      include: {
        teacher: {
          select: {
            id: true,
            user: { select: { fullName: true, phone: true, email: true } },
          },
        },
        items: {
          include: {
            earningEntry: {
              include: {
                sourceAllocation: {
                  include: {
                    transaction: {
                      select: {
                        receiptNumber: true,
                        paymentDate: true,
                        paymentMethod: true,
                      },
                    },
                    obligation: {
                      select: {
                        type: true,
                        periodDate: true,
                        group: { select: { name: true } },
                        student: {
                          select: { user: { select: { fullName: true } } },
                        },
                        extraSession: { select: { title: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!settlement) {
      throw new NotFoundException('التسوية غير موجودة أو تم حذفها.');
    }

    const items = settlement.items.map((it) => {
      const obligation = it.earningEntry?.sourceAllocation?.obligation;
      return {
        id: it.id,
        allocatedAmount: Number(it.allocatedAmount.toFixed(2)),
        earningEntryNumber: it.earningEntry?.entryNumber,
        earningDate: it.earningEntry?.entryDate,
        studentName: obligation?.student?.user?.fullName || 'غير محدد',
        groupName:
          obligation?.group?.name ||
          obligation?.extraSession?.title ||
          'غير محدد',
        receiptNumber:
          it.earningEntry?.sourceAllocation?.transaction?.receiptNumber,
      };
    });

    return {
      id: settlement.id,
      settlementNumber: settlement.settlementNumber,
      teacher: {
        id: settlement.teacher.id,
        name: settlement.teacher.user.fullName,
        phone: settlement.teacher.user.phone,
        email: settlement.teacher.user.email,
      },
      amount: Number(settlement.amount.toFixed(2)),
      status: settlement.status,
      paymentMethod: settlement.paymentMethod,
      referenceNumber: settlement.referenceNumber,
      notes: settlement.notes,
      settlementDate: settlement.settlementDate,
      settledAt: settlement.settledAt,
      cancelledAt: settlement.cancelledAt,
      cancellationReason: settlement.cancellationReason,
      createdAt: settlement.createdAt,
      items,
    };
  }

  /**
   * تأكيد وإكمال تسوية معلقة (PENDING -> COMPLETED).
   */
  async completeSettlement(centerId: string, id: string) {
    return await this.prisma.$transaction(
      async (tx) => {
        const settlement = await tx.teacherSettlement.findFirst({
          where: { id, centerId },
        });

        if (!settlement) {
          throw new NotFoundException('التسوية غير موجودة.');
        }

        if (settlement.status !== SettlementStatus.PENDING) {
          throw new BadRequestException('يمكن إكمال التسويات المعلقة فقط.');
        }

        const now = new Date();
        const updated = await tx.teacherSettlement.update({
          where: { id },
          data: {
            status: SettlementStatus.COMPLETED,
            settledAt: now,
          },
        });

        // تسجيل قيد الصرف في الدفتر المحاسبي
        const earningCount = await tx.teacherEarningEntry.count({
          where: { centerId },
        });
        const entryNumber = `TEE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(earningCount + 1).padStart(6, '0')}`;

        await tx.teacherEarningEntry.create({
          data: {
            centerId,
            teacherId: settlement.teacherId,
            entryNumber,
            type: TeacherEarningType.SETTLEMENT,
            amount: settlement.amount,
            sourceSettlementId: settlement.id,
            allocatedToSettlementAmount: settlement.amount,
            entryDate: now,
            notes:
              settlement.notes ||
              `صرف تسوية مالية معلقة رقم ${settlement.settlementNumber}`,
          },
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * إلغاء تسوية معلقة وفك الحجز عن البنود الأصلية (PENDING -> CANCELLED).
   */
  async cancelSettlement(
    centerId: string,
    id: string,
    dto: CancelSettlementDto,
  ) {
    return await this.prisma.$transaction(
      async (tx) => {
        const settlement = await tx.teacherSettlement.findFirst({
          where: { id, centerId },
          include: { items: true },
        });

        if (!settlement) {
          throw new NotFoundException('التسوية غير موجودة.');
        }

        if (settlement.status !== SettlementStatus.PENDING) {
          throw new BadRequestException(
            'يمكن إلغاء التسويات المعلقة فقط. التسويات المكتملة تم صرفها فعلياً.',
          );
        }

        // فك الحجز عن بنود المستحقات الأصلية
        for (const item of settlement.items) {
          await tx.teacherEarningEntry.update({
            where: { id: item.earningEntryId },
            data: {
              allocatedToSettlementAmount: {
                decrement: item.allocatedAmount,
              },
            },
          });
        }

        const now = new Date();
        const updated = await tx.teacherSettlement.update({
          where: { id },
          data: {
            status: SettlementStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: dto.cancellationReason,
          },
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * تنفيذ استرداد مالي (Refund) وتحديث الالتزام ومعاملة القبض وخصم نسبة المعلم من دفتر المستحقات.
   */
  async createRefund(centerId: string, userId: string, dto: CreateRefundDto) {
    const refundAmount = new Prisma.Decimal(dto.amount);
    if (refundAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'مبلغ الاسترداد يجب أن يكون أكبر من الصفر.',
      );
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // 1. قفل معاملة القبض الأصلية
        const transaction = await tx.paymentTransaction.findFirst({
          where: { id: dto.paymentTransactionId, centerId },
          include: {
            allocations: {
              include: {
                obligation: true,
              },
            },
          },
        });

        if (!transaction) {
          throw new NotFoundException('المعاملة المالية الأصلية غير موجودة.');
        }

        const maxRefundableOnTx = transaction.amount.minus(
          transaction.refundedAmount,
        );
        if (refundAmount.greaterThan(maxRefundableOnTx)) {
          throw new BadRequestException(
            `مبلغ الاسترداد (${refundAmount} ج.م) يتجاوز الرصيد القابل للاسترداد من هذه المعاملة (${maxRefundableOnTx} ج.م).`,
          );
        }

        // 2. تحديد التخصيص المستهدف
        const targetAllocation = dto.paymentAllocationId
          ? transaction.allocations.find(
              (a) => a.id === dto.paymentAllocationId,
            )
          : transaction.allocations[0];

        if (dto.paymentAllocationId && !targetAllocation) {
          throw new BadRequestException(
            'التخصيص المالي المحدد غير مرتبط بهذه المعاملة.',
          );
        }

        let teacherRefundShare = new Prisma.Decimal(0);
        let centerRefundShare = new Prisma.Decimal(0);
        let teacherId: string | null = null;

        if (targetAllocation) {
          const maxRefundableOnAlloc = targetAllocation.amount.minus(
            targetAllocation.refundedAmount,
          );
          if (refundAmount.greaterThan(maxRefundableOnAlloc)) {
            throw new BadRequestException(
              `مبلغ الاسترداد (${refundAmount} ج.م) يتجاوز الرصيد القابل للاسترداد من هذا التخصيص (${maxRefundableOnAlloc} ج.م).`,
            );
          }

          // احتساب نصيب المعلم والسنتر من الاسترداد بدقة
          teacherRefundShare = refundAmount
            .times(targetAllocation.teacherShareRate)
            .dividedBy(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          centerRefundShare = refundAmount.minus(teacherRefundShare);

          teacherId = targetAllocation.obligation.teacherId;

          // تحديث التخصيص
          await tx.paymentAllocation.update({
            where: { id: targetAllocation.id },
            data: {
              refundedAmount: { increment: refundAmount },
            },
          });

          // تحديث الالتزام (StudentFeeObligation)
          const obligation = targetAllocation.obligation;
          const newPaid = obligation.paidAmount.minus(refundAmount);
          const newRemaining = obligation.remainingAmount.plus(refundAmount);
          const newStatus = newPaid.equals(0)
            ? ObligationStatus.UNPAID
            : ObligationStatus.PARTIALLY_PAID;

          await tx.studentFeeObligation.update({
            where: { id: obligation.id },
            data: {
              paidAmount: newPaid,
              remainingAmount: newRemaining,
              status: newStatus,
            },
          });
        } else {
          // استرداد من رصيد المعاملة غير المخصص
          centerRefundShare = refundAmount;
        }

        // تحديث المعاملة
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            refundedAmount: { increment: refundAmount },
          },
        });

        // إنشاء سجل الاسترداد
        const now = new Date();
        const refundsCount = await tx.paymentRefund.count({
          where: { centerId },
        });
        const refundNumber = `REF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(refundsCount + 1).padStart(6, '0')}`;

        const refund = await tx.paymentRefund.create({
          data: {
            centerId,
            transactionId: transaction.id,
            allocationId: targetAllocation?.id,
            refundNumber,
            amount: refundAmount,
            teacherRefundShare,
            centerRefundShare,
            reason: dto.reason,
            createdById: userId,
          },
        });

        // 3. قيد تسوية الاسترداد في دفتر المعلم المحاسبي (REFUND_ADJUSTMENT)
        if (teacherId && teacherRefundShare.greaterThan(0)) {
          const earningCount = await tx.teacherEarningEntry.count({
            where: { centerId },
          });
          const entryNumber = `TEE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(earningCount + 1).padStart(6, '0')}`;

          await tx.teacherEarningEntry.create({
            data: {
              centerId,
              teacherId,
              entryNumber,
              type: TeacherEarningType.REFUND_ADJUSTMENT,
              amount: teacherRefundShare,
              sourceRefundId: refund.id,
              allocatedToSettlementAmount: new Prisma.Decimal(0),
              entryDate: now,
              notes: `خصم استرداد مالي: ${dto.reason}`,
            },
          });
        }

        return refund;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * تصدير كشف التسويات المالية إلى ملف Excel منسق بالكامل.
   */
  async exportSettlementsToExcel(
    centerId: string,
    query: GetSettlementsDto,
  ): Promise<Buffer> {
    const where: Prisma.TeacherSettlementWhereInput = { centerId };

    if (query.teacherId) where.teacherId = query.teacherId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.settlementDate = {};
      if (query.from) where.settlementDate.gte = new Date(query.from);
      if (query.to) {
        const toDate = new Date(query.to);
        toDate.setHours(23, 59, 59, 999);
        where.settlementDate.lte = toDate;
      }
    }

    const settlements = await this.prisma.teacherSettlement.findMany({
      where,
      include: {
        teacher: {
          select: { user: { select: { fullName: true, phone: true } } },
        },
      },
      orderBy: { settlementDate: 'desc' },
      take: 2000,
    });

    const statusLabels: Record<SettlementStatus, string> = {
      COMPLETED: 'مكتملة ومصروفة',
      PENDING: 'معلقة (حجز)',
      CANCELLED: 'ملغاة',
    };

    const methodLabels: Record<string, string> = {
      CASH: 'نقداً',
      BANK_TRANSFER: 'تحويل بنكي',
      WALLET: 'محفظة إلكترونية',
      POS: 'بطاقة دفع / POS',
    };

    const rows = settlements.map((s, idx) => ({
      index: idx + 1,
      settlementNumber: s.settlementNumber,
      teacherName: s.teacher.user.fullName,
      teacherPhone: s.teacher.user.phone || '-',
      amount: Number(s.amount.toFixed(2)),
      status: statusLabels[s.status] || s.status,
      paymentMethod: methodLabels[s.paymentMethod] || s.paymentMethod,
      referenceNumber: s.referenceNumber || '-',
      settlementDate: s.settlementDate.toISOString().split('T')[0],
      notes: s.notes || '-',
    }));

    return await this.excelService.buildWorkbookBuffer({
      sheetName: 'تسويات المعلمين',
      isRtl: true,
      columns: [
        { header: 'م', key: 'index', width: 8 },
        { header: 'رقم التسوية', key: 'settlementNumber', width: 22 },
        { header: 'اسم المعلم', key: 'teacherName', width: 26 },
        { header: 'رقم الهاتف', key: 'teacherPhone', width: 18 },
        {
          header: 'المبلغ (ج.م)',
          key: 'amount',
          width: 16,
          numFmt: '#,##0.00',
        },
        { header: 'حالة التسوية', key: 'status', width: 18 },
        { header: 'طريقة الصرف', key: 'paymentMethod', width: 16 },
        { header: 'المرجع', key: 'referenceNumber', width: 18 },
        { header: 'تاريخ التسوية', key: 'settlementDate', width: 16 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      data: rows,
    });
  }
}
