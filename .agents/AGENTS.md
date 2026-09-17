# Workspace Coding Rules - SaaS Center Education API

## 1. Authentication & Authorization
* Always protect endpoints using `JwtAuthGuard` and `RolesGuard`.
* Allowed Roles: `AppRole = { SUPER_ADMIN: 'SUPER_ADMIN', OWNER: UserRole.OWNER, ADMIN: UserRole.ADMIN, TEACHER: UserRole.TEACHER, STUDENT: UserRole.STUDENT }`.
* **RolesGuard Behavior:** Return `403 ForbiddenException` for insufficient permissions, and `401 UnauthorizedException` if the user is unauthenticated.
* **Role Scopes & Permissions:**
  - `SUPER_ADMIN`: System administrator (`centerId: null`). Full access to global platform operations: managing subscription plans (`/subscription-plans`), provisioning centers, activating/deactivating centers, and assigning initial center subscriptions (`/centers`).
  - `OWNER`: Center owner. Full control over their center's data (`centerId`), managing administrators (`/admins`), all center users (`/users`), teachers, students, groups, grades, subjects, payments, attendance, notifications, audit logs, and viewing `/centers/me` & `/centers/my-subscription`.
  - `ADMIN`: Center manager. Operational management within their center (managing users `/users` with hierarchy restrictions, teachers, students, groups, attendance, payments, notifications, and audit logs).
  - `TEACHER`: Scoped strictly to groups assigned to them, attendance sessions for their classes, taught student payment history, and generating parent portal links (`/p/generate/:studentId`).
  - `STUDENT`: Read-only access scoped strictly to their own enrolled groups, attendance records, payments, and profile.
  - **Public / Unauthenticated**: Public landing endpoints (`/subscription-plans`, `/subscription-plans/:id`), auth endpoints (`/auth/login`, `/auth/forgot-password`, `/auth/reset-password`), and Parent Portal report (`/p/:token`).
* **Real-time Active Check:** `JwtStrategy.validate()` actively checks `isActive === true` from the database on every authenticated request. Inactive accounts are immediately rejected with `401 UnauthorizedException`.
* **Privilege Escalation Safeguards:**
  - `ADMIN` role is strictly forbidden from updating, disabling, or modifying the `OWNER` account or other `ADMIN` accounts in `UsersModule`.
  - User `role` is immutable and cannot be updated via `UpdateUserDto`.
* To inject the current user into a controller handler, use `@CurrentUser() user: RequestUser`.

## 2. SubscriptionGuard & Multi-Tenancy Rules
* **SubscriptionGuard Application:** Protect all educational/operational tenant controllers (`admins`, `users`, `teachers`, `students`, `groups`, `attendance`, `payments`, `grades`, `subjects`, `notifications`, `audit-logs`, and `/p/generate/:studentId`) with `SubscriptionGuard` in addition to `JwtAuthGuard` and `RolesGuard`:
  `@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)`
* **SubscriptionGuard Behavior & Lifecycle:**
  - If the user has no `centerId` (e.g., `SUPER_ADMIN`), access is granted immediately.
  - For center users (`OWNER`, `ADMIN`, `TEACHER`, `STUDENT`), it validates via `SubscriptionValidationService.validateActiveSubscription(centerId)` against the center's active subscription.
  - **Grace Period (3 Days):** If `now > endDate` but within the 3-day grace period, requests are permitted (read & write), and an HTTP response header is attached:
    `X-Subscription-Warning: Grace period active. X days remaining.`
  - **Read-Only Mode:** If the subscription has exceeded the 3-day grace period:
    - Safe read requests (`GET`, `HEAD`, `OPTIONS`) are **allowed** for viewing and exporting data.
    - Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) are **blocked** with `403 ForbiddenException`:
      `'اشتراك السنتر منتهي، برجاء التجديد لاستكمال الإضافة والتعديل.'`
  - Do NOT apply `SubscriptionGuard` to platform/management controllers (`auth`, `subscription-plans`, `centers`, and public `/p/:token`) so users can log in, view center status (`GET /centers/me`, `GET /centers/my-subscription`), and renew subscriptions.
* **Tenant Isolation Enforcement:**
  - In tenant-scoped controllers, verify that `user.centerId` is present before invoking service methods (throw `BadRequestException('المستخدم الحالي غير مرتبط بأي مركز.')` if missing).
  - In Prisma database queries, always scope by `where: { centerId: user.centerId }` or rely on `RequestContextService` and `tenantExtension`.

## 3. Controller Standards
* Put Guards and Roles decorators at the Controller level if they apply globally to all its endpoints (e.g. `@Controller('subscription-plans') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(AppRole.SUPER_ADMIN)`).
* Use explicit NestJS HTTP Status constants (e.g., `HttpStatus.OK`, `HttpStatus.CREATED`) in `@HttpCode` decorators.
* Use the custom decorator `@ResponseMessage('...')` for successful responses.
* Apply `@UseGuards(ThrottlerGuard)` and `@Throttle({ default: { limit, ttl } })` on public brute-force sensitive endpoints (`/auth/login`, `/auth/forgot-password`, `/auth/reset-password`).
* Keep controllers lightweight: only validate DTOs, authorize, and invoke services.

## 4. Services & Transactions
* Use Prisma transactions `this.prisma.$transaction(async (tx) => { ... })` for interconnected operations (such as onboarding or multi-table writes).
* Use `tx` exclusively inside the transaction block to ensure complete rollbacks.
* Implement private unique assertion helpers (`ensureSlugIsUnique`, `ensureEmailIsUnique`, etc.) and retrieval helpers (`getSubscriptionPlan`) running on the transaction client `tx` (or falling back to `this.prisma`) to assert prerequisites and throw early exceptions (`ConflictException`, `NotFoundException`, `BadRequestException`).
* Control database fields returned by defining separate select constants: `[entity]ListSelect` for lists, and `[entity]DetailsSelect` for detailed resources. Never expose password hashes.
* **Audit Logging:** Integrate `AuditLogsService.logAction(centerId, userId, action, entity, entityId, details)` for security-sensitive operations (e.g. payments, status changes, user edits).
* **Notifications & WhatsApp:** Integrate `NotificationsService.createAndDispatch(...)` for automated event-driven alerts (absence warnings, payment receipts, onboarding credentials).

## 5. Query DTOs, Pagination & Sorting
* Inherit all query DTOs from `BaseQueryDto` to reuse pagination (`page`, `limit`), search (`search`), and sorting (`sortBy`, `sortOrder`).
* Use `query.skip` and `query.take` getters inherited from `PaginationDto` to feed offset-based pagination directly.
* Use `query.getWhere(['searchField1', 'searchField2'])` helper to automatically construct insensitive `OR` search clauses.
* Use `query.getOrderBy(['allowedField1', 'allowedField2'], defaultOrder)` helper to safely construct Prisma `orderBy` clauses with whitelisted fields.
* Put entity-specific custom filters (such as `active: boolean`, `role: UserRole`, `type: NotificationType`) inside the module's query DTO instead of the base DTO.

## 6. DTO Properties & Validation Rules
* Mark all DTO properties as `readonly` to enforce immutability.
* Use appropriate `class-validator` decorators (e.g., `@IsNotEmpty`, `@IsString`, `@IsEmail`, `@MinLength`, `@IsOptional`) for parameter validation.
* Always add Arabic error messages to custom validations where possible.
* Use `class-transformer` decorators (e.g., `@Type(() => Number)` or `@Transform()`) to convert string query parameters to correct types (like numbers or booleans).

## 7. Response Structure & Interceptors
* Successful responses are automatically intercepted and wrapped by `TransformInterceptor` into:
  `{ success: true, message: "...", data: ... }`
  or for paginated results:
  `{ success: true, message: "...", data: ..., meta: ... }`
* Use `@BypassInterceptor()` if a handler must return raw data (e.g., file downloads or integrations).

## 8. Testing & TypeScript Standards
* Avoid using `any` in test helpers, mock execution contexts, and fixtures.
* Strongly type request objects, payload mocks, and user context using project types (e.g., `Partial<RequestUser>`, `RequestUser`, `ExecutionContext`) to maintain type safety and avoid ESLint `@typescript-eslint/no-unsafe-assignment` errors.
* Always ensure all unit tests and ESLint checks pass without warnings.
