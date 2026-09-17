import { Injectable } from '@nestjs/common';
import { Prisma, AuditAction } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogQueryDto } from './dto/get-audit-logs.dto';
import { buildMeta, PaginationMeta } from '../../common/utils/buildMeta';

export type AuditLogItem = Prisma.AuditLogGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        fullName: true;
        email: true;
        role: true;
      };
    };
  };
}>;

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * تسجيل حركة جديدة في سجل التدقيق (Audit Log).
   */
  async log(params: {
    centerId: string;
    userId?: string | null;
    action: AuditAction;
    entity: string;
    entityId: string;
    details?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        centerId: params.centerId,
        userId: params.userId || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        details: params.details || Prisma.JsonNull,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
  }

  /**
   * استعراض سجلات التدقيق الخاصة بالمركز الحالي مع دعم الفلترة والـ Pagination.
   */
  async findAll(
    centerId: string,
    query: AuditLogQueryDto,
  ): Promise<{ data: AuditLogItem[]; meta: PaginationMeta }> {
    const { skip, take, action, entity, search } = query;

    const where: Prisma.AuditLogWhereInput = {
      centerId,
    };

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (search) {
      where.OR = [
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }
}
