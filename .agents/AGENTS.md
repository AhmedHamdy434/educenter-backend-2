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
  - **Inactive / Missing Subscription:** If the center has no subscription, an inactive subscription plan, or the center itself is deactivated, requests are **blocked** with `403 ForbiddenException` returning the fixed error code `CENTER_SUBSCRIPTION_INACTIVE`:
    ```json
    {
      "statusCode": 403,
      "message": "المركز لا يمتلك اشتراكاً نشطاً حالياً. يرجى الاشتراك في إحدى الباقات.",
      "error": "Forbidden",
      "code": "CENTER_SUBSCRIPTION_INACTIVE"
    }
    ```
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

## 9. OpenAPI / Swagger Documentation Standards & Status Tracking
* **Single Source of Truth:** `docs/openapi.json` defines the full OpenAPI specification and is dynamically merged into `SwaggerModule` in `src/main.ts` on startup.
* **Dual Schema & Example Rule:** In Swagger UI, `content['application/json']` MUST always define both `schema` AND `example`. Omitting `schema` causes Swagger UI to hide the response body example completely:
  ```json
  "content": {
    "application/json": {
      "schema": { "type": "object" },
      "example": { ... }
    }
  }
  ```
* **Strict Realism (No Guessing):** All examples must reflect exact field names, actual DTO validation error strings (in Arabic), real Service exception messages, Select Constants, and Prisma schema data types.
* **Unified Envelopes:**
  - **Success (Single Resource):**
    `{ "success": true, "message": "...", "data": { ... } }`
  - **Success (Paginated Collection):**
    `{ "success": true, "message": "...", "data": [ ... ], "meta": { "total": 0, "page": 1, "limit": 10, "totalPages": 0, "hasNextPage": false, "hasPreviousPage": false } }`
  - **Error (Default NestJS Format):**
    `{ "statusCode": 400, "message": "..." | ["...", "..."], "error": "Bad Request" }`
* **Current OpenAPI Documentation Status:**
  - **Completed Modules (48 Operations Documented & Live in Swagger):**
    1. `Auth` (6 endpoints): `/api/auth/login`, `/api/auth/super-admin/login`, `/api/auth/me`, `/api/auth/change-password`, `/api/auth/forgot-password`, `/api/auth/reset-password`
    2. `Centers` (9 endpoints): `POST /api/centers`, `GET /api/centers`, `GET /api/centers/me`, `GET /api/centers/my-subscription`, `GET /api/centers/:id`, `PATCH /api/centers/:id`, `PATCH /api/centers/:id/status`, `POST /api/centers/:id/subscribe`, `POST /api/centers/:id/renew`
    3. `Subscription Plans` (5 endpoints): `POST /api/subscription-plans`, `GET /api/subscription-plans`, `GET /api/subscription-plans/:id`, `PATCH /api/subscription-plans/:id`, `PATCH /api/subscription-plans/:id/toggle-status`
    4. `Subscription Payments` (4 endpoints): `GET /api/subscription-payments/summary`, `GET /api/subscription-payments`, `POST /api/centers/:centerId/subscription-payments`, `GET /api/centers/:centerId/subscription-payments`
    5. `Users` (3 endpoints): `GET /api/users`, `GET /api/users/:id`, `PATCH /api/users/:id`
    6. `Grades` (5 endpoints): `POST /api/grades`, `GET /api/grades`, `GET /api/grades/:id`, `PATCH /api/grades/:id`, `PATCH /api/grades/:id/toggle-status`
    7. `Subjects` (6 endpoints): `GET /api/subjects/options`, `POST /api/subjects`, `GET /api/subjects`, `GET /api/subjects/:id`, `PATCH /api/subjects/:id`, `PATCH /api/subjects/:id/toggle-status`
    8. `Teachers` (5 endpoints): `POST /api/teachers`, `GET /api/teachers`, `GET /api/teachers/:id`, `PATCH /api/teachers/:id`, `PATCH /api/teachers/:id/toggle-status`
    9. `Students` (5 endpoints): `POST /api/students`, `GET /api/students`, `GET /api/students/:id`, `PATCH /api/students/:id`, `PATCH /api/students/:id/toggle-status`
    10. `Home Stats` (1 endpoint): `GET /api/home-stats`
  - **Pending Modules (Paused until User Finishes Pending Logic Changes):**
    1. `Groups` (8 endpoints)
    2. `Attendance` (6 endpoints)
    3. `Payments` (3 endpoints)
    4. `Notifications` (1 endpoint)
    5. `AuditLogs` (1 endpoint)
    6. `ParentPortal` (2 endpoints)
