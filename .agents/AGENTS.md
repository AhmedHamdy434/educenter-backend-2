# Workspace Coding Rules - SaaS Center Education API

## 1. Authentication & Authorization
* Always protect endpoints using `JwtAuthGuard` and `RolesGuard`.
* Allowed Roles: `AppRole = { SUPER_ADMIN: 'SUPER_ADMIN', OWNER: UserRole.OWNER, TEACHER: UserRole.TEACHER, STUDENT: UserRole.STUDENT }`.
  - Roles are defined in `src/common/enums/app-role.enum.ts` mapping directly to Prisma `UserRole` enum plus `SUPER_ADMIN`.
* **RolesGuard Behavior:** Return `403 ForbiddenException` for insufficient permissions, and `401 UnauthorizedException` if the user is unauthenticated.
* **Role Scopes & Permissions:**
  - `SUPER_ADMIN`: System administrator (`centerId: null`, stored in `SuperAdmin` table). Full access to global platform operations: managing subscription plans (`/subscription-plans`), provisioning centers, activating/deactivating centers, and assigning center subscriptions (`/centers`).
  - `OWNER`: Center owner (`role: OWNER`, stored in `User` table). Full administrative and operational control over their center's data (`centerId`), managing center users (`/users`), teachers, students, groups, grades, subjects, payments, attendance, notifications, audit logs, and viewing `/centers/me` & `/centers/my-subscription`.
  - `TEACHER`: Center teacher (`role: TEACHER`, linked to `Teacher` table). Scoped strictly to groups assigned to them, attendance sessions for their classes, taught student payment history, and generating parent portal links (`/p/generate/:studentId`).
  - `STUDENT`: Enrolled student (`role: STUDENT`, linked to `Student` table). Read-only access scoped strictly to their own enrolled groups, attendance records, payments, and profile.
  - **Public / Unauthenticated**: Public landing endpoints (`/subscription-plans`, `/subscription-plans/:id`), auth endpoints (`/auth/login`, `/auth/forgot-password`, `/auth/reset-password`), and Parent Portal report (`/p/:token`).
* **Real-time Active Check:** `JwtStrategy.validate()` actively checks `isActive === true` from the database on every authenticated request. Inactive accounts are immediately rejected with `401 UnauthorizedException`.
* **Privilege Escalation Safeguards:**
  - User `role` is immutable and cannot be updated via `UpdateUserDto`.
* To inject the current user into a controller handler, use `@CurrentUser() user: RequestUser`.

## 2. SubscriptionGuard, Plans & Multi-Tenancy Rules
* **SubscriptionPlan Data Model (`prisma/schema.prisma`):**
  - Primary Key: `id String @id @default(cuid())`.
  - Plan Fields: `name`, `description`, `image`, `price`, `type` (`MONTHLY` | `YEARLY`), `studentLimit`, `teacherLimit`, `canCreateExams`, `isPopular`, `isActive`.
  - Quota Enforcement:
    * `studentLimit`: Enforced in `StudentsService` (`create`, `importFromExcel`) via `SubscriptionValidationService.validateStudentLimit(centerId)`.
    * `teacherLimit`: Enforced in `TeachersService` (`create`) via `SubscriptionValidationService.validateTeacherLimit(centerId)`.
    * `canCreateExams`: Enforced in Exam features via `SubscriptionValidationService.validateExamCreation(centerId)`.
    * **No Plan Quotas on Curriculum Entities:** Entities such as `Grades`, `Subjects`, and `Groups` are NOT capped by subscription plans (they are solely tenant-scoped to `centerId` and guarded by uniqueness).
* **SubscriptionGuard Application:** Protect all educational/operational tenant controllers (`users`, `teachers`, `students`, `groups`, `attendance`, `payments`, `grades`, `subjects`, `notifications`, `audit-logs`, and `/p/generate/:studentId`) with `SubscriptionGuard` in addition to `JwtAuthGuard` and `RolesGuard`:
  `@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)`
* **SubscriptionGuard Behavior & Lifecycle:**
  - If the user has no `centerId` (e.g., `SUPER_ADMIN`), access is granted immediately.
  - For center users (`OWNER`, `TEACHER`, `STUDENT`), it validates via `SubscriptionValidationService.validateActiveSubscription(centerId)` against the center's active subscription.
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
  - Primary keys and tenant foreign keys use `CUID` strings across all models.

## 3. Controller Standards
* Put Guards and Roles decorators at the Controller level if they apply globally to all its endpoints (e.g. `@Controller('subscription-plans') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(AppRole.SUPER_ADMIN)`).
* Use explicit NestJS HTTP Status constants (e.g., `HttpStatus.OK`, `HttpStatus.CREATED`) in `@HttpCode` decorators.
* Use the custom decorator `@ResponseMessage('...')` for successful responses.
* In tenant-scoped controllers, inject `@CurrentCenterId() centerId: string` parameter decorator to cleanly pass the center ID directly to service methods.
* **Express Route Precedence Rule (CRITICAL):** Always define static sub-routes (such as `export/excel`, `export/pdf`, `export/template`, `import/excel`, `options`) **before** parameterized routes (`:id`, `:id/*`, `:id/toggle-status`) to prevent Express from intercepting sub-paths as IDs.
* Apply `@UseGuards(ThrottlerGuard)` and `@Throttle({ default: { limit, ttl } })` on public brute-force sensitive endpoints (`/auth/login`, `/auth/forgot-password`, `/auth/reset-password`).
* **Strictly Lightweight Controllers (Zero Business/Formatting Logic):** Controllers must ONLY validate DTOs, authorize, and delegate immediately to services. Controllers must NOT perform date formatting, filename building, buffer handling, or manual response header setting (`Content-Type`, `Content-Disposition`). All export and file download logic belongs entirely in the Service layer.

## 4. Services & Transactions
* Use Prisma transactions `this.prisma.$transaction(async (tx) => { ... })` for interconnected operations (such as onboarding or multi-table writes).
* Use `tx` exclusively inside the transaction block to ensure complete rollbacks.
* Implement private unique assertion helpers (`ensureSlugIsUnique`, `ensureEmailIsUnique`, etc.) and retrieval helpers (`getSubscriptionPlan`) running on the transaction client `tx` (or falling back to `this.prisma`) to assert prerequisites and throw early exceptions (`ConflictException`, `NotFoundException`, `BadRequestException`).
* Control database fields returned by defining separate select constants: `[entity]ListSelect` for lists, and `[entity]DetailsSelect` for detailed resources. Never expose password hashes.
* **Audit Logging:** Integrate `AuditLogsService.logAction(centerId, userId, action, entity, entityId, details)` for security-sensitive operations (e.g. payments, status changes, user edits).
* **Notifications & WhatsApp:** Integrate `NotificationsService.createAndDispatch(...)` for automated event-driven alerts (absence warnings, payment receipts, onboarding credentials).
* **File Exports & Reporting (Excel & PDF):**
  - Use `ExcelService` (`src/shared/excel`) for generating formatted spreadsheets and import templates.
  - Use `PdfService` (`src/shared/pdf`) for generating RTL Arabic PDF reports using Cairo font.
  - Always enforce tenant scoping (`centerId`) and apply query filters (`search`, `active`, `orderBy`) on exported datasets.
  - Export service methods should accept `(centerId, query, res?: Response)`. When `res` is provided, the service sets headers and streams the buffer (`res.send(buffer)`). When omitted, it returns `Promise<Buffer>` to maintain clean unit testing.
  - **Zero-Duplication Export Architecture (DRY):**
    * When supporting multiple export formats (e.g., Excel & PDF) for the same entity, never duplicate database queries or row mapping logic. Extract a single private helper (e.g. `getExportDataset(centerId, query)`) that runs the filtered Prisma query, formats rows, and returns `{ rows, dateStr }`.
    * Use a reusable private response helper (e.g. `sendFileDownload(res, buffer, filename, contentType)`) to encapsulate setting `Content-Type`, `Content-Disposition`, and invoking `res.send(buffer)`.
    * Define centralized MIME type constants (`EXCEL_MIME_TYPE`, `PDF_MIME_TYPE`) instead of repeating hardcoded strings across methods.

## 5. Query DTOs, Pagination & Sorting
* Inherit all query DTOs from `BaseQueryDto` to reuse pagination (`page`, `limit`), search (`search`), and sorting (`sortBy`, `sortOrder`).
* Use `query.skip` and `query.take` getters inherited from `PaginationDto` to feed offset-based pagination directly.
* Use `query.getWhere(['searchField1', 'searchField2'])` helper to automatically construct insensitive `OR` search clauses.
* Use `query.getOrderBy(['allowedField1', 'allowedField2'], defaultOrder, relationCountFields)` helper to safely construct Prisma `orderBy` clauses with whitelisted scalar fields and support ordering by relation counts (`_count: { [relation]: sortOrder }`).
* **Relation Count Sorting Standard:** When supporting sorting by relation counts (e.g. sorting grades by `subjects`, `groups`, `enrollments` or sorting groups by `students`), define a centralized mapping object (e.g. `GRADE_RELATION_COUNT_FIELDS = { subjects: 'subjects', groups: 'groups', enrollments: 'enrollments' }`). Pass the clean relation name directly in the query (e.g., `sortBy=subjects`).
* Put entity-specific custom filters (such as `active: boolean`, `gradeId: string`, `subjectId: string`, `teacherId: string`) inside the module's query DTO instead of the base DTO.

## 6. DTO Properties & Validation Rules
* Mark all DTO properties as `readonly` to enforce immutability.
* Use appropriate `class-validator` decorators (e.g., `@IsNotEmpty`, `@IsString`, `@IsEmail`, `@MinLength`, `@IsOptional`) for parameter validation.
* Always add Arabic error messages to custom validations where possible.
* Use `class-transformer` decorators (e.g., `@Type(() => Number)` or `@Transform()`) to convert string query parameters to correct types (like numbers or booleans).
* **Boolean Query Transformation (`@ToBoolean`):** Always use the custom `@ToBoolean()` decorator (`src/common/decorators/to-boolean.decorator.ts`) for boolean query parameters (e.g. `active`, `isActive`, `popular`). It automatically converts `1`, `'1'`, `true`, `'true'` -> `true`, and `0`, `'0'`, `false`, `'false'` -> `false`, and returns `undefined` otherwise.

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
* Always use relative imports (`../../common/...`) rather than root-relative paths (`src/...`) to prevent Jest module resolution errors.

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
  - **Completed Modules (61 Operations Documented & Live in Swagger):**
    1. `Auth` (7 endpoints): `/api/auth/login`, `/api/auth/super-admin/login`, `/api/auth/super-admin/me`, `/api/auth/me`, `/api/auth/change-password`, `/api/auth/forgot-password`, `/api/auth/reset-password`
    2. `Centers` (9 endpoints): `POST /api/centers`, `GET /api/centers`, `GET /api/centers/me`, `GET /api/centers/my-subscription`, `GET /api/centers/:id`, `PATCH /api/centers/:id`, `PATCH /api/centers/:id/status`, `POST /api/centers/:id/subscribe`, `POST /api/centers/:id/renew`
    3. `Subscription Plans` (5 endpoints): `POST /api/subscription-plans`, `GET /api/subscription-plans`, `GET /api/subscription-plans/:id`, `PATCH /api/subscription-plans/:id`, `PATCH /api/subscription-plans/:id/toggle-status`
    4. `Subscription Payments` (4 endpoints): `GET /api/subscription-payments/summary`, `GET /api/subscription-payments`, `POST /api/centers/:centerId/subscription-payments`, `GET /api/centers/:centerId/subscription-payments`
    5. `Users` (3 endpoints): `GET /api/users`, `GET /api/users/:id`, `PATCH /api/users/:id`
    6. `Grades` (10 endpoints): `POST /api/grades`, `GET /api/grades`, `GET /api/grades/export/excel`, `GET /api/grades/export/pdf`, `GET /api/grades/export/template`, `POST /api/grades/import/excel`, `GET /api/grades/:id`, `PATCH /api/grades/:id`, `PATCH /api/grades/:id/toggle-status`, `DELETE /api/grades/:id`
    7. `Subjects` (11 endpoints): `GET /api/subjects/options`, `GET /api/subjects/export/excel`, `GET /api/subjects/export/pdf`, `GET /api/subjects/export/template`, `POST /api/subjects/import/excel`, `POST /api/subjects`, `GET /api/subjects`, `GET /api/subjects/:id`, `PATCH /api/subjects/:id`, `PATCH /api/subjects/:id/toggle-status`, `DELETE /api/subjects/:id`
    8. `Teachers` (10 endpoints): `POST /api/teachers`, `GET /api/teachers`, `GET /api/teachers/export/excel`, `GET /api/teachers/export/pdf`, `GET /api/teachers/export/template`, `POST /api/teachers/import/excel`, `GET /api/teachers/:id`, `PATCH /api/teachers/:id`, `PATCH /api/teachers/:id/toggle-status`, `DELETE /api/teachers/:id`
    9. `Students` (10 endpoints): `POST /api/students`, `GET /api/students`, `GET /api/students/export/excel`, `GET /api/students/export/pdf`, `GET /api/students/export/template`, `POST /api/students/import/excel`, `GET /api/students/:id`, `PATCH /api/students/:id`, `PATCH /api/students/:id/toggle-status`, `DELETE /api/students/:id`
    10. `Groups` (12 endpoints): `POST /api/groups`, `GET /api/groups`, `GET /api/groups/export/excel`, `GET /api/groups/export/pdf`, `GET /api/groups/export/template`, `POST /api/groups/import/excel`, `GET /api/groups/:id`, `PATCH /api/groups/:id`, `PATCH /api/groups/:id/toggle-status`, `POST /api/groups/:id/students`, `DELETE /api/groups/:id/students`, `DELETE /api/groups/:id`
    11. `Home Stats` (1 endpoint): `GET /api/home-stats`
  - **Pending Modules (Paused until User Finishes Pending Logic Changes):**
    1. `Attendance` (6 endpoints)
    2. `Payments` (3 endpoints)
    3. `Notifications` (1 endpoint)
    4. `AuditLogs` (1 endpoint)
    5. `ParentPortal` (2 endpoints)

## 10. Standard Entity Module Blueprint (The Educational Entity Module Architecture)
Every standard educational entity module (`Grades`, `Subjects`, `Teachers`, `Students`, `Groups`) MUST strictly mirror the structure, design patterns, and conventions established in this architecture:

### A. Folder & File Structure
```text
src/modules/[entities]/
├── constants/
│   └── [entity].select.ts          # Prisma select definitions & derived TypeScript payload types
├── dto/
│   ├── create-[entity].dto.ts      # Creation DTO with validations
│   ├── update-[entity].dto.ts      # Update DTO extending PartialType(Create...Dto)
│   └── get-[entities].dto.ts       # Query DTO extending BaseQueryDto
├── [entities].controller.ts        # Pure, lightweight NestJS controller
├── [entities].service.ts           # Business logic, exports, imports, validations
├── [entities].module.ts            # NestJS module declaration
└── [entities].service.spec.ts      # Comprehensive unit tests
```

### B. Select Constants & Type System (`constants/[entity].select.ts`)
* Define distinct select objects using the `satisfies Prisma.[Entity]Select` pattern:
  - `[entity]ListSelect`: Essential scalar and shallow relational fields for fast lookups, creations, updates, and toggle-status. **MUST NOT CONTAIN `_count`**.
  - `[entity]DetailsSelect`: Composes `...[entity]ListSelect` and adds relational counters `_count: { select: { ... } }` and deep relational fields.
* **Usage Rules across Operations:**
  - `create`, `update`, `toggleStatus`: MUST select `[entity]ListSelect` and return `Promise<[Entity]ListItem>` to avoid slow relational joins and unnecessary `_count` overhead during mutations.
  - `remove` (Delete): MUST fetch the target record using `[entity]DetailsSelect` specifically to inspect `_count` for relational protection, throwing `BadRequestException` if dependent records exist.
  - `findOne`: Returns `Promise<[Entity]Details>` or `Promise<[Entity]ListItem>` depending on whether deep details are exposed, using the respective select.
  - `findAll`: Uses `[entity]DetailsSelect` when count aggregates are displayed in data tables, or `[entity]ListSelect` for lightweight listings.
  - Data Exports (`getExportDataset`): Uses `[entity]DetailsSelect` when spreadsheet/PDF reports display counts of related entities.
* Derive and export payload types directly from Prisma:
  ```typescript
  export type [Entity]ListItem = Prisma.[Entity]GetPayload<{ select: typeof [entity]ListSelect }>;
  export type [Entity]Details = Prisma.[Entity]GetPayload<{ select: typeof [entity]DetailsSelect }>;
  ```
* Enforce explicit return types on all controller and service methods using these types (e.g. `Promise<[Entity]ListItem>`, `Promise<{ data: [Entity]Details[]; meta: any }>`).

### C. DTO Design & Validation Rules
* **Create DTO (`create-[entity].dto.ts`):**
  - All properties marked `readonly`.
  - Thorough `class-validator` rules with user-friendly Arabic validation messages (`@IsNotEmpty`, `@IsString`, `@MaxLength`, `@IsInt`, `@Min`).
  - Strict type transformation with `class-transformer` (`@Type(() => Number)`).
  - Explicit defaults where applicable (e.g., `readonly order?: number = 0;`).
* **Update DTO (`update-[entity].dto.ts`):**
  - Extends `PartialType(Create[Entity]Dto)`.
  - Explicitly adds update-only optional fields (e.g., `@IsOptional() @IsBoolean() readonly isActive?: boolean;`).
* **Query DTO (`get-[entities].dto.ts`):**
  - Extends `BaseQueryDto` to inherit pagination (`page`, `limit`), search (`search`), and sorting (`sortBy`, `sortOrder`).
  - Custom boolean filters decorated with `@ToBoolean()` and `@IsBoolean()`.
  - Override `sortBy` with `declare readonly sortBy?: string` and validate strictly with `@IsIn(['col1', 'col2', 'createdAt'])`.
  - Annotate with `@ApiPropertyOptional(...)` including description, example, and enum for Swagger.

### D. Controller Standards & Route Precedence
* **Class Decorators:**
  `@Controller('[entities]')`
  `@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)`
* **Tenant Scoping:** Use `@CurrentCenterId() centerId: string` parameter decorator to inject the authenticated user's center ID directly.
* **HTTP Responses & Statuses:**
  - `@HttpCode(HttpStatus.CREATED)` for POST creation.
  - `@HttpCode(HttpStatus.OK)` for DELETE, status toggle, and import.
  - `@ResponseMessage('...')` with Arabic confirmation text on all standard endpoints.
* **Express Route Precedence Rule (CRITICAL):**
  - Static sub-routes (`export/excel`, `export/pdf`, `export/template`, `import/excel`, `options`) **MUST** be placed before parameterized routes (`:id`, `:id/toggle-status`, `:id/students`) in the controller class to prevent route collisions in Express.
* **Standard Endpoints Mapping (10 to 12 Endpoints):**
  1. `POST /` -> Create entity (`@Roles(AppRole.OWNER)`)
  2. `GET /` -> Paginated list (`@Roles(AppRole.OWNER, AppRole.TEACHER, AppRole.STUDENT)`)
  3. `GET /export/excel` -> Export to Excel (`@BypassInterceptor()`, `@Res() res: Response`, delegates to service)
  4. `GET /export/pdf` -> Export to PDF (`@BypassInterceptor()`, `@Res() res: Response`, delegates to service)
  5. `GET /export/template` -> Download empty import template with reference tables (`@BypassInterceptor()`, `@Res() res: Response`)
  6. `POST /import/excel` -> Import from Excel (`@UseInterceptors(FileInterceptor('file'))`, `@ApiConsumes('multipart/form-data')`, `@UploadedFile(new ExcelValidationPipe())`, `@Query('dryRun', new DefaultValuePipe(false), ParseBoolPipe)`)
  7. `GET /:id` -> Single entity details
  8. `PATCH /:id` -> Update entity
  9. `PATCH /:id/toggle-status` -> Fast status toggle (active/inactive)
  10. `DELETE /:id` -> Safe deletion
  *(Sub-resource endpoints such as `/options` or `/:id/students` placed appropriately)*

### E. Service Business Logic & Integrity Standards
* **Tenant Isolation:** Every Prisma query and mutation must include `centerId` in its filter/data.
* **Uniqueness Assertion:**
  - Implement private helper `ensure[Entity]NameIsUnique(centerId, name)` using `prisma.[entity].findUnique({ where: { centerId_name: { centerId, name } } })` or scoped `findFirst`.
  - Throw `ConflictException` with Arabic message if already taken.
  - In updates: check uniqueness ONLY if the unique field has changed.
* **Safe Deletion & Relational Protection:**
  - Standard endpoint: `DELETE /:id` (HTTP 200 OK, `@ResponseMessage('تم حذف ... بنجاح.')`, restricted to `@Roles(AppRole.OWNER)`).
  - Fetch target record with `[entity]DetailsSelect` (or `findOne`) to inspect `_count` before attempting deletion.
  - Block deletion with `400 BadRequestException` if any dependent relational records exist:
    * **Grades (`Grade`):** Block if `_count.subjects > 0 || _count.groups > 0 || _count.enrollments > 0` (`'لا يمكن حذف المرحلة الدراسية لوجود مواد أو مجموعات أو طلاب مرتبطين بها.'`).
    * **Subjects (`Subject`):** Block if `_count.groups > 0 || _count.teacherSubjects > 0` (`'لا يمكن حذف المادة الدراسية لوجود مجموعات دراسية أو معلمين مرتبطين بها.'`).
    * **Teachers (`Teacher`):** Block if `_count.groups > 0 || _count.subjects > 0` (`'لا يمكن حذف المعلم لوجود مجموعات دراسية أو مواد دراسية مرتبطة به.'`). When clean, deletes both the `Teacher` record and associated `User` record atomically in a transaction (`tx.teacher.delete` then `tx.user.delete`).
    * **Students (`Student`):** Block if `_count.groups > 0 || _count.attendance > 0` (`'لا يمكن حذف الطالب لوجود مجموعات دراسية أو سجلات حضور مرتبطة به.'`). When clean, deletes both the `Student` record and associated `User` record atomically in a transaction (`tx.student.delete` then `tx.user.delete`).
    * **Groups (`Group`):** Block if `_count.students > 0` (`'لا يمكن حذف المجموعة لوجود طلاب مسجلين بها.'`).
* **Fast Status Toggle:**
  - Retrieve current status via `findOne(centerId, id)` and update `isActive: !current.isActive`.
* **Paginated Query (`findAll`):**
  - Extract `skip`, `take`, and filters from `query`.
  - Build `where` with `query.getWhere(['name', 'description'])` and set `where.centerId = centerId`.
  - Build `orderBy` with `query.getOrderBy([...allowed], [defaultOrder], relationCountFields)`.
  - Fetch count and items concurrently with `Promise.all([this.prisma.[entity].count({ where }), this.prisma.[entity].findMany({ where, skip, take, select: [entity]DetailsSelect, orderBy })])`.
  - Return `{ data, meta: buildMeta(total, query.page, query.limit) }`.

### F. File Export Architecture (Excel & PDF - DRY)
* Define centralized constants: `EXCEL_MIME_TYPE`, `PDF_MIME_TYPE`.
* **Single Reusable Dataset Extractor:**
  - Implement `private async getExportDataset(centerId: string, query: [Entity]QueryDto, ...): Promise<{ rows: any[]; dateStr: string }>` to run the Prisma query once, format dates and status labels, and supply rows to both Excel and PDF generators.
* **Dual-Mode Handler (Stream or Buffer):**
  - Accept `(centerId: string, query: [Entity]QueryDto, ..., res?: Response): Promise<Buffer | void>`.
  - If `res` is passed: call `this.sendFileDownload(res, buffer, filename, mimeType)` to set headers and stream.
  - If `res` is omitted: return `buffer` directly (enabling easy unit testing).
* **ID Columns in Exports:**
  - All Excel exports must explicitly include ID columns (formatted with `numFmt: '@'`) for the entity itself (e.g. `معرف المرحلة (Grade ID)`, `معرف المجموعة (Group ID)`) and for all related entities (e.g. `gradeId`, `subjectId`, `teacherId`), allowing users to easily copy IDs for batch editing or cross-module re-importing.

### G. Excel Import Pipeline & Error Envelope Standard
* **Validation Pipe:** Use `new ExcelValidationPipe()` on the uploaded file to ensure valid `.xlsx` / `.xls` MIME type and enforce the 5MB file size limit.
* **Header Verification:** Use `excelService.parseSheetRows(fileBuffer, { expectedHeaders: [...] })`. Throw `BadRequestException` if rows are empty.
* **Performance & N+1 Prevention:** Pre-fetch all active reference entities (`grades`, `subjects`, `teachers`) for the center in single queries and index them directly by their ID (`Map<string, Entity>`).
* **ID-Based Relational Linking (Zero Textual Matching for Relations):**
  - Any relation between entities (e.g., Student ↔ Grade, Group ↔ Grade / Subject / Teacher, Teacher ↔ Subjects, Subject ↔ Grade) MUST rely strictly on entity IDs (`gradeId`, `subjectId`, `teacherId`, comma-separated `subjectIds`).
  - Textual name columns (e.g., `المرحلة الدراسية (للتوضيح)`) are purely optional and informational for the user. They are NOT used for database lookups or validations.
  - If an ID is missing, does not exist, belongs to another center, or is deactivated (`isActive: false`), record a clear Arabic `RowValidationError`:
    `'معرف [الكيان] المدخل غير صالح أو لا ينتمي لهذا المركز أو غير نشط.'`
  - Zero reliance on `normalizeArabicText()` for foreign relation lookups.
* **Row-by-Row Validation:**
  - Validate all rows sequentially, collecting errors into `errors: RowValidationError[]`.
  - Track duplicates within the same file using a `Set<string>`.
  - Validate required fields, types, and uniqueness against the pre-fetched database Set.
* **Atomic 422 Error Envelope:**
  - If any row fails (`errors.length > 0`), reject the entire file and throw `UnprocessableEntityException` with the standardized structure:
    ```json
    {
      "statusCode": 422,
      "message": "تعذر استيراد الملف لوجود أخطاء في البيانات المرفقة.",
      "error": "Unprocessable Entity",
      "data": {
        "totalRows": 10,
        "validRows": 8,
        "failedRows": 2,
        "remainingErrorsCount": 0,
        "errors": [
          { "row": 3, "field": "gradeId", "value": "...", "message": "معرف المرحلة المدخل غير صالح أو لا ينتمي لهذا المركز أو غير نشط." }
        ]
      }
    }
    ```
  - Cap error details to the first 100 errors in `errors.slice(0, 100)` and report `remainingErrorsCount`.
* **Dry-Run Mode (`dryRun: boolean`):**
  - If `dryRun === true`, return the summary and parsed rows preview (including resolved IDs) without executing database writes.
* **Transactional Persistence:**
  - Wrap batch creation in `prisma.$transaction(async (tx) => { await tx.[entity].createMany({ data: validRowsToCreate }); })`.
  - Catch Prisma `P2002` (unique violation) errors and translate to `UnprocessableEntityException`.

### H. Excel Import Template Standard
* Provide `getImportTemplate(centerId: string, res?: Response)` leveraging `excelService.buildTemplateBuffer`.
* Include two sheets:
  1. Data sheet: column headers with clear ID labels (e.g. `معرف المرحلة (Grade ID)`), optional informational name columns, appropriate column widths, and cell formatting (`numFmt: '@'`).
  2. Instructions sheet: clear Arabic instructions and dedicated 2-column reference tables (`headers: ['معرف ... (ID - للنسخ)', 'الاسم ...']`, `rows: [{ id, name }]`). Column 2 is formatted in `Consolas` with text format `@` and width 38 to allow center admins to copy verified IDs with a single Ctrl+C.

### I. Unit Testing Standard (`[entity].service.spec.ts`)
* Mock `PrismaService`, `ExcelService`, and `PdfService`.
* Test scenarios must cover:
  1. Standard CRUD operations, tenant isolation, and `ConflictException` on duplicate names.
  2. Safe deletion blocking when relational counts > 0.
  3. Export to Excel & PDF (verifying buffer return and HTTP response streaming).
  4. Template generation with reference tables.
  5. Import validation: empty file (400), invalid rows (422), foreign/inactive ID rejection (422), duplicate in file (422), duplicate in DB (422), race condition P2002 (422), dry-run preview, and successful batch creation.

