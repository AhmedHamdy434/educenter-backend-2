import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';

/**
 * =========================================================================================
 * ARCHITECTURAL DECISION NOTE: POSTPONING POSTGRESQL ROW-LEVEL SECURITY (RLS)
 * =========================================================================================
 * Decision: Postpone PostgreSQL RLS in favor of Prisma Client Extension + Direct Denormalization.
 *
 * Rationale:
 * 1. Operational Complexity: PostgreSQL RLS with Prisma requires running `SET LOCAL app.current_tenant_id`
 *    before every single query or transaction across pooled connections (pgBouncer / node-postgres pool).
 *    This adds connection leak risks and transaction wrapping overhead on every single ORM query.
 * 2. Performance & Simplicity: Having `centerId` directly denormalized on all tenant tables
 *    (Grade, Subject, Group, AttendanceSession, Teacher, Student, GroupStudent, StudentAttendance, MonthlyPayment)
 *    allows this Prisma Extension to inject `{ where: { centerId } }` transparently with zero connection pooling issues.
 * 3. Future Path: If the architecture scales out to direct microservices or custom tenant proxies,
 *    RLS can be re-evaluated on top of the already-denormalized `centerId` columns.
 * =========================================================================================
 */

const DIRECT_TENANT_MODELS = [
  'Grade',
  'Subject',
  'Group',
  'AttendanceSession',
  'Teacher',
  'Student',
  'GroupStudent',
  'StudentAttendance',
  'MonthlyPayment',
] as const;

export const createTenantExtension = () =>
  Prisma.defineExtension({
    name: 'tenant-isolation-extension',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const context = getRequestContext();
          const centerId = context?.centerId;

          // If no centerId (e.g. unauthenticated, SuperAdmin, background cron) or explicitly bypassed, proceed normally
          if (!centerId || context?.isSuperAdmin || context?.bypassTenant) {
            return query(args);
          }

          // Direct Tenant Models: automatically enforce centerId on filtering operations
          if (
            DIRECT_TENANT_MODELS.includes(
              model as (typeof DIRECT_TENANT_MODELS)[number],
            )
          ) {
            if (
              [
                'findFirst',
                'findMany',
                'count',
                'updateMany',
                'deleteMany',
              ].includes(operation)
            ) {
              const queryArgs = (args || {}) as { where?: Record<string, any> };
              queryArgs.where = {
                ...(queryArgs.where || {}),
                centerId,
              };
              return query(queryArgs);
            }
          }

          return query(args);
        },
      },
    },
  });
