# EduCenter Backend — Business Logic & Implementation Documentation

> **Document Status:** Comprehensive Codebase Analysis & Up-to-Date Platform Reference (Verified against Prisma Schema, Modules, Services, Controllers, Guards & DTOs)  
> **Backend Architecture:** NestJS 11, PostgreSQL, Prisma ORM, Passport JWT, Multer/Cloudinary, Schedule Cron, Throttler, WhatsApp Integration  
> **Target Audience:** Engineering Team, Frontend Developers, Product Managers, and System Architects

---

## 1. Domain & Multi-Tenant SaaS Overview

EduCenter is a **multi-tenant B2B SaaS platform** specifically tailored for **tutoring centers, educational academies, and private lesson hubs**. It is **not** a generic course-based LMS or a pre-recorded video streaming platform.

```
                                  ┌──────────────────────────────┐
                                  │      SuperAdmin Platform     │
                                  │  (SubscriptionPlans, Centers) │
                                  └──────────────┬───────────────┘
                                                 │ manages
                                                 ▼
                ┌─────────────────────────────────┴─────────────────────────────────┐
                │                                                                   │
                ▼                                                                   ▼
     ┌─────────────────────────┐                                         ┌─────────────────────────┐
     │     Center A (Tenant)   │                                         │     Center B (Tenant)   │
     │  Subscribed to Plan X   │                                         │  Subscribed to Plan Y   │
     └──────────┬──────────────┘                                         └──────────┬──────────────┘
                │                                                                   │
  ┌─────────────┼─────────────┬─────────────┬─────────────┐                   ┌─────┴─────┐
  │             │             │             │             │                   │           │
  ▼             ▼             ▼             ▼             ▼                   ▼           ▼
OWNER         ADMIN        TEACHER       STUDENT    PARENT PORTAL           OWNER      ...
(Full Ctr)  (Managers)    (Classes)    (Enrolled)   (Magic Token)
```

### Core Domain Entities Hierarchy
1. **Platform Level**:
   - `SuperAdmin`: System operator responsible for creating `SubscriptionPlan` offerings and provisioning new `Center` tenants.
   - `SubscriptionPlan`: Commercial subscription tier defining quotas (`studentLimit`, `teacherLimit`, `subjectLimit`), duration in days, pricing, and feature flags (`canCreateExams`, `canUploadFiles`, `canExportReports`).
2. **Tenant Level (Center)**:
   - `Center`: An isolated tutoring center with contact information, slug identifier, branding logo, and its own configuration.
   - `CenterSubscription`: Junction linking a `Center` to a `SubscriptionPlan`, defining duration (`startDate`, `endDate`), paid `price`, and lifecycle `status` (`ACTIVE`, `EXPIRED`, `CANCELED`).
3. **Identity & User Level**:
   - `User`: Global credentials entity scoped to a specific `centerId` with role `OWNER`, `ADMIN`, `TEACHER`, or `STUDENT`, and security flag `mustChangePassword`.
   - `Teacher`: Profile extension holding salary, specialization, biography, and subject capabilities (`TeacherSubject`).
   - `Student`: Profile extension holding parent phone, administrative notes, grade-level enrollment (`StudentEnrollment`), and group memberships (`GroupStudent`).
   - `PasswordResetToken`: Stores 6-digit OTP verification codes for secure password resets.
4. **Academic & Operational Structure**:
   - `Grade`: Educational year or stage (e.g., Grade 10, Secondary 1).
   - `Subject`: Curriculum subject belonging to a specific `Grade` (e.g., Chemistry, Physics).
   - `Group`: The actual teaching class unit. Encapsulates **Grade + Subject + Assigned Teacher + Weekly Schedule (`GroupSchedule`) + Capacity + Monthly Fee**.
   - `AttendanceSession` & `StudentAttendance`: Date-based tracking of student presence (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`) with absence reasons.
   - `MonthlyPayment`: Financial fee tracking recording student tuition payments for each enrolled group month.

---

## 2. Roles, Multi-Tenancy & Authorization

### 2.1 Multi-Tenancy & Tenant Isolation Mechanics
* **Token Structure**: The JWT payload contains `{ sub: userId, role: AppRole, centerId: string | null }`.
  - For `SuperAdmin`, `centerId` is `null` and `role` is `'SUPER_ADMIN'`.
  - For Center users (`OWNER`, `ADMIN`, `TEACHER`, `STUDENT`), `centerId` contains the center's CUID.
* **Authentication & Authorization Guards**:
  - Protected endpoints require `JwtAuthGuard` and `RolesGuard`.
  - `JwtStrategy` performs **real-time account validation** (`isActive === true`) on every request, immediately rejecting deactivated users with `401 UnauthorizedException`.
  - Operational tenant controllers are protected by `SubscriptionGuard`.
* **SubscriptionGuard Behavior & Lifecycle**:
  - **SuperAdmin**: Bypasses subscription checks.
  - **Inactive / Missing Subscription**: If the center has no subscription, an inactive subscription plan, or the center itself is deactivated (`!center.isActive`), requests are blocked with `403 ForbiddenException` returning the fixed machine-readable code `CENTER_SUBSCRIPTION_INACTIVE`:
    ```json
    {
      "statusCode": 403,
      "message": "المركز لا يمتلك اشتراكاً نشطاً حالياً. يرجى الاشتراك في إحدى الباقات.",
      "error": "Forbidden",
      "code": "CENTER_SUBSCRIPTION_INACTIVE"
    }
    ```
  - **Grace Period (3 Days)**: If a center's subscription has expired within the last 3 days, requests are permitted and an HTTP response header is returned:
    `X-Subscription-Warning: Grace period active. X days remaining.`
  - **Read-Only Mode**: After the 3-day grace period, `GET`, `HEAD`, and `OPTIONS` requests remain accessible (allowing data browsing and exports), while mutating operations (`POST`, `PUT`, `PATCH`, `DELETE`) are blocked with `403 ForbiddenException` (`'اشتراك السنتر منتهي، برجاء التجديد لاستكمال الإضافة والتعديل.'`).
  - **Exempted Routes**: `auth`, `subscription-plans`, `centers` (e.g., `GET /centers/me`, `GET /centers/my-subscription`), and public Parent Portal endpoints (`GET /p/:token`).
* **Tenant Isolation Enforcement**:
  - Request context is automatically managed via Node.js `AsyncLocalStorage` (`RequestContextService` & `RequestContextMiddleware`) paired with Prisma `tenantExtension` (`src/database/prisma/extensions/tenant.extension.ts`).
  - Explicit controller assertions verify `user.centerId` (throwing `400 BadRequestException` if absent).
  - All Prisma database queries are explicitly filtered by `where: { centerId }` or `where: { user: { centerId } }`.

---

### 2.2 Role Capabilities & Permission Matrix

| Operation / Feature Area | `SUPER_ADMIN` | `OWNER` | `ADMIN` | `TEACHER` | `STUDENT` | `PUBLIC` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Manage Subscription Plans** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ *(Read only)* |
| **Provision & Manage Centers** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Own Center (`GET /centers/me`)** | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **View Center Subscription Overview (`GET /centers/my-subscription`)** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Center Administrators (`/admins`)** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Manage Center Users (`/users`)** | ❌ | ✅ | ✅ *(Restricted)* | ❌ | ❌ | ❌ |
| **Create Grades & Subjects** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Update / Toggle Grades & Subjects** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View Grades & Subjects Catalog** | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Create & Update Teachers / Students** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View All Teachers in Center** | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **View All Students in Center** | ❌ | ✅ | ✅ | ✅ | ❌ *(Own Only)* | ❌ |
| **Create / Update / Delete Groups** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Enroll / Remove Students from Groups** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View Groups** | ❌ | ✅ *(All)* | ✅ *(All)* | ✅ *(Assigned)* | ✅ *(Enrolled)* | ❌ |
| **Open Attendance Session & Record Attendance** | ❌ | ✅ | ✅ | ✅ *(Assigned)* | ❌ | ❌ |
| **View Group Attendance Reports** | ❌ | ✅ | ✅ | ✅ *(Assigned)* | ❌ | ❌ |
| **View Student Attendance Report** | ❌ | ✅ | ✅ | ✅ | ✅ *(Own Only)* | ❌ |
| **Record Student Monthly Payment** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View Group Payments Matrix** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View Student Payment History** | ❌ | ✅ | ✅ | ✅ *(Taught)* | ✅ *(Own Only)* | ❌ |

#### Key Security Distinctions: `OWNER` vs `ADMIN`
1. **Administrator Management (`/admins`)**: Only `OWNER` can create and list center managers.
2. **Grade & Subject Creation**: Only `OWNER` can execute `POST /grades` and `POST /subjects`.
3. **Privilege Escalation Protection (`/users/:id`)**: An `ADMIN` cannot edit, deactivate, or activate the `OWNER` account or other `ADMIN` accounts.
4. **Role Immutability**: No user (including Admin) can modify user roles via `PATCH /users/:id`.

---

## 3. Core Business Modules & Implementation Details

### 3.1 SuperAdmin & Subscription Plans (`SubscriptionPlansModule`)
* **Plan Management (`/subscription-plans`)**: SuperAdmin defines pricing, limits (`studentLimit`, `teacherLimit`, `subjectLimit`), duration, and feature flags.
* **Public Discovery**: `GET /subscription-plans` and `GET /subscription-plans/:id` are public for landing page pricing tables.
* **Quota Enforcement (`SubscriptionValidationService`)**:
  - `validateStudentLimit(centerId)`: Throws `400 BadRequestException` if active students $\ge$ `studentLimit`.
  - `validateTeacherLimit(centerId)`: Throws `400 BadRequestException` if active teachers $\ge$ `teacherLimit`.
  - `validateSubjectLimit(centerId)`: Throws `400 BadRequestException` if active subjects $\ge$ `subjectLimit`.
* **Automated Expiry Cron (`SubscriptionExpiryService`)**:
  - Scheduled via `@Cron('0 0 * * *')` (midnight daily).
  - Identifies active subscriptions where `endDate < now` and updates status to `EXPIRED`.

---

### 3.2 Center & Center Subscription (`CentersModule`)
* **Provisioning Flow (`POST /centers`)**:
  - Executed inside a Prisma transaction: Uploads logo to Cloudinary, validates plan, creates `Center`, creates initial `OWNER` user, and activates the initial `CenterSubscription`.
* **Subscription Management & Renewal**:
  - `POST /centers/:id/subscribe`: Assigns a new plan starting immediately.
  - `POST /centers/:id/renew`: Extends active subscription or starts fresh if expired, supporting `monthsCount`.
* **Tenant Overview Endpoints**:
  - `GET /centers/me`: Returns center profile and branding.
  - `GET /centers/my-subscription`: Returns current plan limits, remaining days, active usage counts (students, teachers, subjects), and grace period status.

---

### 3.2.1 Center Subscription Payments (`SubscriptionPaymentsModule`)
* **Purpose**: Records offline/manual payments made by centers to the SaaS platform for subscriptions and renewals.
* **Schema Truth & Core Data Fields**:
  - `id`: CUID unique record identifier.
  - `centerId`: Center foreign key reference.
  - `subscriptionId`: Link to `CenterSubscription`.
  - `paid`: `Decimal` - Actual monetary amount received (Note: in the database model and DTO, this field is named `paid`, not `amount`).
  - `periodStart`: Start timestamp of the billing coverage period.
  - `periodEnd`: End timestamp of the billing coverage period.
  - `createdAt`: Timestamp when the payment was logged (used as the effective payment date; there is no separate `paidAt`).
* **Endpoints & Operations**:
  - `GET /api/subscription-payments/summary`: Aggregated stats for SuperAdmin dashboard (total revenue, active subscriptions count, total payments count).
  - `GET /api/subscription-payments`: Paginated list of all payments across all centers with date-range filters (`from`, `to`).
  - `POST /api/centers/:centerId/subscription-payments`: SuperAdmin records a manual payment for a specific center.
  - `GET /api/centers/:centerId/subscription-payments`: Paginated list of subscription payments belonging to a specific center (accessible by SuperAdmin and Center Owner).

---

### 3.3 Center Administrators (`AdminsModule`)
* **Admin Creation (`POST /admins`)**:
  - Restricted strictly to `OWNER`.
  - Creates a `User` record with role `ADMIN`.
  - Generates a secure random temporary password if none is provided, setting `mustChangePassword: true`.
  - Sends onboarding credentials to the admin's phone via `WhatsAppService`.
* **Admin Listing (`GET /admins`)**:
  - Paginated list of center managers with search support.

---

### 3.4 User Management (`UsersModule`)
* **Listing (`GET /users`)**:
  - Lists all center accounts (`OWNER`, `ADMIN`, `TEACHER`, `STUDENT`) with search and filtering by `role` and `isActive`.
* **Details (`GET /users/:id`)**:
  - Returns sanitized profile data (excluding password hash).
* **Updates & Status Toggle (`PATCH /users/:id`)**:
  - Allows updating `fullName`, `email`, `phone`, `avatar`, and `isActive`.
  - **Hierarchy Protection**: Blocks `ADMIN` from modifying or disabling `OWNER` or peer `ADMIN` accounts.
  - Logs status changes in `AuditLog`.

---

### 3.5 Teachers & Students (`TeachersModule` & `StudentsModule`)
* **Teachers**:
  - `POST /teachers`: Enforces `teacherLimit`, creates account (with `mustChangePassword` if default password generated), profile, and assigns `TeacherSubject` records.
  - `PATCH /teachers/:id`: Diff-synchronizes subject assignments.
* **Students**:
  - `POST /students`: Enforces `studentLimit`, creates account, profile (`parentPhone`, `notes`), and active `StudentEnrollment`.
  - `PATCH /students/:id`: Synchronizes grade changes.

---

### 3.6 Academic Structure: Grades & Subjects
* **Grades (`GradesModule`)**: Academic stages (e.g. "الصف الأول الثانوي"). Unique name per center (`@@unique([centerId, name])`). Creation restricted to `OWNER`.
* **Subjects (`SubjectsModule`)**: Curriculum subjects linked to a `Grade`. Unique name per grade (`@@unique([centerId, gradeId, name])`). Creation restricted to `OWNER`. Enforces `subjectLimit`.
* `GET /subjects/options`: Lightweight dropdown endpoint for UI forms.

---

### 3.7 Groups & Scheduling (`GroupsModule`)
* **Group Concept**: Encapsulates Grade + Subject + Teacher + Seat Capacity + Monthly Fee + Weekly Time Slots (`GroupSchedule`).
* **Enrollment (`POST /groups/:id/students`)**:
  - Validates student grade enrollment.
  - **Capacity Check**: Asserts $\text{currentEnrolled} + \text{newStudents} \le \text{group.capacity}$.
  - Sets `subscriptionStartDate` for billing calculations.
* **Removal (`DELETE /groups/:id/students`)**: Removes student from active group tracking.

---

### 3.8 Attendance Management (`AttendanceModule`)
* **Date Normalization & Cairo Timezone**: Date calculations for attendance sessions and daily evaluations must strictly use `src/common/utils/date.util.ts` (`getTodayMidnightUtcInCairo()`). The calendar date in Egypt (`Africa/Cairo`) is evaluated and converted to UTC midnight (`00:00:00.000Z`) to prevent timezone drift across midnight.
* **Strict Date Protection (No Early Start)**: Opening or starting any attendance session (`POST /groups/:groupId/attendance/session`) or saving records (`save`) is strictly blocked for future dates (`sessionDate > today`). Sessions can only be opened in the same day or retroactively after it (`today >= sessionDate`).
* **Session Lifecycle**: `POST /groups/:groupId/attendance/session` opens or retrieves the attendance session for the current Cairo day (`@@unique([groupId, date])`), an extra session (`extraSessionId`), or a past date. Gracefully handles concurrent race conditions (`P2002`).
* **Bulk Save (`POST /groups/:groupId/attendance/session/:sessionId/save`)**:
  - Automatically deduplicates records by `studentId` taking the latest entry.
  - Upserts attendance records (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`, `ATTENDED_ANOTHER_GROUP`) with absence reasons / notes (حقل `absenceReason` يُسجل ويُسترجع لجميع الحالات سواء كان الطالب حاضراً أو غائباً أو متأخراً لتمكين تسجيل الملاحظات وأسباب الغياب والتأخير بدون قيود).
  - **WhatsApp Alert**: Automatically triggers `WhatsAppService` to alert parents when an `ABSENT` status is recorded.
* **Reports**:
  - `GET /groups/:groupId/attendance/report`: Attendance rate, top absentees, perfect attendance list.
  - `GET /students/:studentId/attendance/report`: Chronological student attendance history.

---

### 3.9 Student Billing & Monthly Payments (`PaymentsModule`)
* **Payment Concept**: Tracked per `GroupStudent` enrollment normalized to the 1st of the target month in UTC midnight.
* **Recording Payment (`POST /group-students/:groupStudentId/payments`)**:
  - Enforces duplicate prevention via `@@unique([groupStudentId, subscriptionDate])`.
  - Captures `group.monthlyFee` as the payment `amount`.
  - Records an audit log entry (`PAYMENT_COLLECTION`).
  - Automatically dispatches an electronic payment receipt to the parent via `WhatsAppService`.
* **Group Payment Matrix (`GET /groups/:groupId/payments`)**:
  - Accepts query parameters (`search`, `month`, `page`, `limit`, `sortBy`, `sortOrder`).
  - Defaults to the current month in UTC if within group duration, or the group's first month.
  - Computes `requiredMonths`, `paidMonths`, and `unpaidMonths` for every student in the group.
  - Returns calculated `stats` object: `{ activeMonth, total, paid, unpaid, expected, collected, groupMonths }`.
  - Adds computed `currentMonth` object per student: `{ month, isRequired, isPaid, payment }`.
* **Payment History & Excel Exports**:
  - `GET /students/:studentId/payments`: Historical payments per student.
  - `GET /students/:studentId/payments/export/excel`: Export individual student payments to formatted Excel spreadsheet.
  - `GET /groups/:groupId/payments/export/excel`: Export group monthly payment matrix to formatted Excel spreadsheet.

---

### 3.10 Schedule & Calendar Module (`ScheduleModule`)
* **Calendar View (`GET /api/schedule/calendar`)**:
  - Restricted to `OWNER`.
  - Accepts `month` (`YYYY-MM`), `teacherId`, `gradeId`, `subjectId`, `groupId`.
  - Resolves all scheduled group lesson slots for each day of the month using Cairo timezone calendar mapping.
  - Cross-references real `AttendanceSession` records to report live session status (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`), student count, and attendance completion.
* **Upcoming View (`GET /api/schedule/upcoming`)**:
  - Restricted to `OWNER`.
  - Generates lessons from today (in Cairo) until the end of the current month.
  - Sorted chronologically for accordion/timeline dashboards.

---

### 3.11 Extra Sessions Module (`ExtraSessionsModule`)
* **Core Concept**: Dedicated management of supplementary or ad-hoc classes (revisions, makeup sessions, exam preparations) attached to a specific group.
* **Flexible Creation & Scheduling (`POST /groups/:groupId/extra-sessions`)**:
  - Configures participants either for the entire group (`audience: ALL_GROUP`) or selected students (`audience: SELECTED`, `studentIds`).
  - **No Session Duration & No Overlap Restrictions**: There is no duration field (`durationMinutes`) or artificial schedule conflict check. Extra sessions are scheduled freely at any `date`, `hour`, and `minute` without requiring a `force` flag or generating conflict warnings.
  - **No Premature Attendance Session**: An `AttendanceSession` is NOT created automatically on scheduling (`attendanceSession: null`). This prevents the session from appearing as "started" prematurely.
  - **Starting Attendance Session (`POST /extra-sessions/:id/session`)**: Attendance can only be opened when the session date arrives or after it (`today >= sessionDate`). Any attempt to start attendance before the session date is strictly blocked with `400 BadRequestException`.
  - Direct creation response (`201 Created`) returning full session details with participants and financial summary.
* **Participant Fee Tracking & Financials**:
  - `POST /extra-sessions/:id/students/:studentId/pay`: Collects session fee for an individual student.
  - `PATCH /extra-sessions/:id/students/:studentId/waive`: Waives session fee for an individual student (`isWaived: true`), zeroing out any recorded payment.
* **Session Lifecycle & Management**:
  - `GET /groups/:groupId/extra-sessions`: Paginated list of extra sessions for a specific group with date and status filters.
  - `GET /extra-sessions/:id`: Full details including student participants, payment status, attendance record, and financial summary.
  - `PATCH /extra-sessions/:id`: Update session metadata (title, location, fee, notes, date, time).
  - `POST /extra-sessions/:id/students`: Enroll additional students into an existing extra session.
  - `PATCH /extra-sessions/:id/cancel`: Cancels the session (`status: CANCELED`), preserving existing attendance and payment records.

---

## 4. Authentication, Onboarding & Security

### 4.1 Login Flow (`POST /auth/login`)
1. User provides `identifier` (Email or Phone) and `password`.
2. **SuperAdmin Resolution**: Checks `SuperAdmin` table first if identifier contains `@`. If valid and active, signs in as `SUPER_ADMIN`.
3. **Center User Resolution**: Queries `User` table for email or phone match. Verifies password and `user.isActive`.
4. Returns JWT `accessToken` and user profile, including the `mustChangePassword` flag.
5. **Rate Limiting**: Protected by `ThrottlerGuard` (maximum 5 attempts per minute).

### 4.2 Mandatory Password Change (`mustChangePassword`)
* When user accounts are generated without an explicit password, `mustChangePassword: true` is set.
* Frontend detects this flag on login and prompts the user to invoke `PATCH /auth/change-password`.
* Upon updating password, the flag is cleared.

### 4.3 Password Reset via OTP (`POST /auth/forgot-password` & `/reset-password`)
* **Forgot Password**: Accepts `email`. Generates a 6-digit cryptographic OTP stored in `PasswordResetToken` with 10-minute expiry. Protects against user enumeration (always returns success message).
* **Reset Password**: Validates `email`, `otp`, and updates password, marking OTP as used.
* Protected by strict rate limits (3 requests per minute for forgot password).

---

## 5. Prisma Schema Coverage & Gap Analysis

### 5.1 Models Implementation Status

| Prisma Model | Associated Module | Implementation Status | Notes / Capabilities |
| :--- | :--- | :---: | :--- |
| `SubscriptionPlan` | `SubscriptionPlansModule` | **Full** | SuperAdmin CRUD + Status toggle. Public read endpoints. |
| `Center` | `CentersModule` | **Full** | SuperAdmin CRUD + Status + Subscribe/Renew. Tenant `me` & `my-subscription`. |
| `CenterSubscription` | `CentersModule` | **Full** | Subscription lifecycle, 3-day grace period, daily expiry cron. |
| `SubscriptionPayment` | `SubscriptionPaymentsModule` | **Full** | Records offline/manual center payments (`paid`, `periodStart`, `periodEnd`, `createdAt`). |
| `User` | `UsersModule` / `AuthModule` | **Full** | Full management, role hierarchy safeguards, real-time `isActive` validation. |
| `SuperAdmin` | `AuthModule` | **Full** | Authenticated via `POST /auth/login`. Seeded via script. |
| `Teacher` | `TeachersModule` | **Full** | Full CRUD, Status toggle, User account sync, Subject assignments. |
| `Student` | `StudentsModule` | **Full** | Full CRUD, Status toggle, User account sync, Grade enrollment. |
| `Grade` | `GradesModule` | **Full** | Full CRUD, Status toggle, unique name validation per center. |
| `Subject` | `SubjectsModule` | **Full** | Full CRUD, Status toggle, unique name validation per grade, options endpoint. |
| `TeacherSubject` | `TeachersModule` | **Full** | Diff-synchronized inside Teacher create/update workflows. |
| `StudentEnrollment` | `StudentsModule` | **Full** | Synchronized inside Student create/update workflows. |
| `Group` | `GroupsModule` | **Full** | Full CRUD, Weekly schedule slots, Teacher-Subject assignment assertion. |
| `GroupSchedule` | `GroupsModule` | **Full** | Managed via Group create/update. |
| `GroupStudent` | `GroupsModule` | **Full** | Enrolls/removes students, enforces seat capacity. |
| `AttendanceSession` | `AttendanceModule` | **Full** | Date-normalized session management per group. |
| `StudentAttendance` | `AttendanceModule` | **Full** | Bulk upsert of attendance records. Auto WhatsApp absence alert. |
| `MonthlyPayment` | `PaymentsModule` | **Full** | Monthly fee tracking, duplicate prevention, auto WhatsApp receipt. |
| `PasswordResetToken` | `AuthModule` | **Full** | 6-digit OTP reset flow with 10-minute expiry and enumeration safety. |
| `Notification` | `NotificationsModule` | **Full** | In-app notification log and automated WhatsApp dispatching. |
| `AuditLog` | `AuditLogsModule` | **Full** | Immutable audit trail for financial and administrative actions. |
| `ParentMagicToken` | `ParentPortalModule` | **Full** | 30-day token generation and public report endpoint. |
| *(Exams / Assignments)* | *None* | **Missing** | **Zero backend support (models and endpoints missing).** |

---

## 6. Complete API Reference Table

The following table documents all **78 endpoints** implemented in the EduCenter backend API:

| Module | Method | Endpoint Path | Allowed Roles | Business Purpose |
| :--- | :---: | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/auth/login` | Public (Throttled) | Authenticate user/admin, check `isActive`, return JWT & `mustChangePassword`. |
| **Auth** | `POST` | `/api/auth/super-admin/login` | Public (Throttled) | Authenticate SuperAdmin specifically, return platform JWT. |
| **Auth** | `GET` | `/api/auth/super-admin/me` | `SUPER_ADMIN` | Retrieve SuperAdmin profile details. |
| **Auth** | `GET` | `/api/auth/me` | Authenticated | Retrieve authenticated user profile and tenant details. |
| **Auth** | `PATCH` | `/api/auth/change-password` | Authenticated | Change current user's password and clear `mustChangePassword`. |
| **Auth** | `POST` | `/api/auth/forgot-password` | Public (Throttled) | Request 6-digit OTP password reset code (safe against enumeration). |
| **Auth** | `POST` | `/api/auth/reset-password` | Public (Throttled) | Verify OTP and reset account password. |
| **Subscription Plans** | `POST` | `/api/subscription-plans` | `SUPER_ADMIN` | Create a new SaaS pricing plan with limits and feature flags. |
| **Subscription Plans** | `GET` | `/api/subscription-plans` | Public / All | List all available subscription plans with pagination & filtering. |
| **Subscription Plans** | `GET` | `/api/subscription-plans/:id` | Public / All | Get detailed specifications of a single subscription plan. |
| **Subscription Plans** | `PATCH` | `/api/subscription-plans/:id` | `SUPER_ADMIN` | Update an existing subscription plan's pricing, limits, or flags. |
| **Subscription Plans** | `PATCH` | `/api/subscription-plans/:id/toggle-status` | `SUPER_ADMIN` | Toggle active/inactive status of a subscription plan. |
| **Centers** | `POST` | `/api/centers` | `SUPER_ADMIN` | Provision Center, upload logo, create Owner account, activate initial plan. |
| **Centers** | `GET` | `/api/centers` | `SUPER_ADMIN` | List all centers with search, status filtering, and pagination. |
| **Centers** | `GET` | `/api/centers/me` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Get details and branding of the current user's center. |
| **Centers** | `GET` | `/api/centers/my-subscription` | `OWNER`, `ADMIN` | Get center subscription overview, active usage quotas, and expiry status. |
| **Centers** | `GET` | `/api/centers/:id` | `SUPER_ADMIN` | Get comprehensive center details including owner and subscriptions. |
| **Centers** | `PATCH` | `/api/centers/:id` | `SUPER_ADMIN` | Update center basic details (name, slug, email, phone, logo, address). |
| **Centers** | `PATCH` | `/api/centers/:id/status` | `SUPER_ADMIN` | Toggle center active/suspended status. |
| **Centers** | `POST` | `/api/centers/:id/subscribe` | `SUPER_ADMIN` | Assign a new subscription plan to a center starting immediately. |
| **Centers** | `POST` | `/api/centers/:id/renew` | `SUPER_ADMIN` | Renew a center's subscription with smart extension logic. |
| **Subscription Payments** | `GET` | `/api/subscription-payments/summary` | `SUPER_ADMIN` | SuperAdmin overview of total revenue, active subscriptions, and payments count. |
| **Subscription Payments** | `GET` | `/api/subscription-payments` | `SUPER_ADMIN` | Paginated list of all subscription payments across all centers. |
| **Subscription Payments** | `POST` | `/api/centers/:centerId/subscription-payments` | `SUPER_ADMIN` | Record a manual/offline subscription payment for a specific center. |
| **Subscription Payments** | `GET` | `/api/centers/:centerId/subscription-payments` | `SUPER_ADMIN`, `OWNER` | List subscription payments belonging to a specific center. |
| **Admins** | `POST` | `/api/admins` | `OWNER` | Create a new center administrator (`ADMIN`) and dispatch credentials. |
| **Admins** | `GET` | `/api/admins` | `OWNER` | List center administrators with search and pagination. |
| **Users** | `GET` | `/api/users` | `OWNER`, `ADMIN` | List all center accounts with role and status filtering, search, pagination. |
| **Users** | `GET` | `/api/users/:id` | `OWNER`, `ADMIN` | Retrieve user account details. |
| **Users** | `PATCH` | `/api/users/:id` | `OWNER`, `ADMIN` | Update user details or toggle `isActive` (with hierarchy safeguards). |
| **Grades** | `POST` | `/api/grades` | `OWNER` | Create a new academic grade/year for the center. |
| **Grades** | `GET` | `/api/grades` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | List all academic grades for the center. |
| **Grades** | `GET` | `/api/grades/:id` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Get details of a specific academic grade. |
| **Grades** | `PATCH` | `/api/grades/:id` | `OWNER`, `ADMIN` | Update grade name, description, order, or status. |
| **Grades** | `PATCH` | `/api/grades/:id/toggle-status` | `OWNER`, `ADMIN` | Toggle active/inactive status of a grade. |
| **Subjects** | `GET` | `/api/subjects/options` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Fetch lightweight list of active subjects for UI dropdown menus. |
| **Subjects** | `POST` | `/api/subjects` | `OWNER` | Create a new subject under a grade (enforces center subject limit). |
| **Subjects** | `GET` | `/api/subjects` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | List all subjects with search, grade filter, and pagination. |
| **Subjects** | `GET` | `/api/subjects/:id` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Get details of a specific subject. |
| **Subjects** | `PATCH` | `/api/subjects/:id` | `OWNER`, `ADMIN` | Update subject name, description, or active status. |
| **Subjects** | `PATCH` | `/api/subjects/:id/toggle-status` | `OWNER`, `ADMIN` | Toggle active/inactive status of a subject. |
| **Teachers** | `POST` | `/api/teachers` | `OWNER`, `ADMIN` | Add teacher (creates User, Teacher profile, assigns subjects, checks limit). |
| **Teachers** | `GET` | `/api/teachers` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | List all teachers in center with search, subject filter, and pagination. |
| **Teachers** | `GET` | `/api/teachers/:id` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Get full profile and assigned subjects of a teacher. |
| **Teachers** | `PATCH` | `/api/teachers/:id` | `OWNER`, `ADMIN` | Update teacher user account, profile info, and diff-synced subjects. |
| **Teachers** | `PATCH` | `/api/teachers/:id/toggle-status` | `OWNER`, `ADMIN` | Toggle active/inactive status of a teacher account. |
| **Students** | `POST` | `/api/students` | `OWNER`, `ADMIN` | Add student (creates User, Student profile, grade enrollment, checks limit). |
| **Students** | `GET` | `/api/students` | `OWNER`, `ADMIN`, `TEACHER` | List all students with search, grade filter, and pagination. |
| **Students** | `GET` | `/api/students/:id` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Get student details *(Student restricted to viewing own account)*. |
| **Students** | `PATCH` | `/api/students/:id` | `OWNER`, `ADMIN` | Update student user account, profile info, and grade enrollment. |
| **Students** | `PATCH` | `/api/students/:id/toggle-status` | `OWNER`, `ADMIN` | Toggle active/inactive status of a student account. |
| **Groups** | `POST` | `/api/groups` | `OWNER`, `ADMIN` | Create group (grade + subject + teacher + capacity + fee + schedule). |
| **Groups** | `GET` | `/api/groups` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | List groups *(Teacher sees own groups; Student sees enrolled groups)*. |
| **Groups** | `GET` | `/api/groups/:id` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Get group details *(Enforces teacher ownership or student enrollment)*. |
| **Groups** | `PATCH` | `/api/groups/:id` | `OWNER`, `ADMIN` | Update group info and weekly schedule slots. |
| **Groups** | `PATCH` | `/api/groups/:id/toggle-status` | `OWNER`, `ADMIN` | Toggle active/inactive status of a group. |
| **Groups** | `POST` | `/api/groups/:id/students` | `OWNER`, `ADMIN` | Enroll students into group (validates grade and enforces seat capacity). |
| **Groups** | `DELETE` | `/api/groups/:id/students` | `OWNER`, `ADMIN` | Remove enrolled students from a group. |
| **Groups** | `DELETE` | `/api/groups/:id` | `OWNER`, `ADMIN` | Delete a group and cascade associated schedules/records. |
| **Attendance** | `POST` | `/api/groups/:groupId/attendance/session` | `OWNER`, `ADMIN`, `TEACHER` | Open or get today's attendance session (UTC midnight normalized). |
| **Attendance** | `GET` | `/api/groups/:groupId/attendance/session/:sessionId` | `OWNER`, `ADMIN`, `TEACHER` | Get attendance session details and student roster with current statuses. |
| **Attendance** | `POST` | `/api/groups/:groupId/attendance/session/:sessionId/save` | `OWNER`, `ADMIN`, `TEACHER` | Bulk save attendance records & auto-dispatch WhatsApp absence alerts. |
| **Attendance** | `GET` | `/api/groups/:groupId/attendance/sessions` | `OWNER`, `ADMIN`, `TEACHER` | List all historical attendance sessions for a group. |
| **Attendance** | `GET` | `/api/groups/:groupId/attendance/report` | `OWNER`, `ADMIN`, `TEACHER` | Group attendance report (rate, top 5 absentees, perfect attendance). |
| **Attendance** | `GET` | `/api/students/:studentId/attendance/report` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Student attendance report & history *(Student restricted to own report)*. |
| **Payments** | `GET` | `/api/groups/:groupId/payments` | `OWNER`, `ADMIN` | Group payments matrix (computes required, paid, and unpaid months). |
| **Payments** | `GET` | `/api/groups/:groupId/payments/export/excel` | `OWNER`, `TEACHER` | Export group monthly payment matrix to Excel. |
| **Payments** | `POST` | `/api/group-students/:groupStudentId/payments` | `OWNER`, `ADMIN` | Record student tuition payment. |
| **Payments** | `GET` | `/api/students/:studentId/payments` | `OWNER`, `ADMIN`, `TEACHER`, `STUDENT` | Student payment history *(Student sees own; Teacher sees taught students)*. |
| **Payments** | `GET` | `/api/students/:studentId/payments/export/excel` | `OWNER`, `TEACHER`, `STUDENT` | Export student payment history to Excel. |
| **Schedule** | `GET` | `/api/schedule/calendar` | `OWNER` | Monthly calendar schedule view mapping lessons and session attendance. |
| **Schedule** | `GET` | `/api/schedule/upcoming` | `OWNER` | Chronological upcoming lessons from today through end of current month. |
| **Home Stats** | `GET` | `/api/home-stats` | `SUPER_ADMIN` | Platform metrics and KPI overview for SuperAdmin dashboard. |
| **Extra Sessions** | `POST` | `/api/groups/:groupId/extra-sessions` | `OWNER` | Create an extra session and enroll students (attendance session is deferred until scheduled date). |
| **Extra Sessions** | `POST` | `/api/extra-sessions/:id/session` | `OWNER`, `TEACHER` | Start/open attendance session for the extra session (enforces sessionDate <= today in Cairo timezone). |
| **Extra Sessions** | `GET` | `/api/groups/:groupId/extra-sessions` | `OWNER` | Paginated listing of group extra sessions with date and status filters. |
| **Extra Sessions** | `GET` | `/api/extra-sessions/:id` | `OWNER` | Full details, participant roster, payment status, and financial summary. |
| **Extra Sessions** | `PATCH` | `/api/extra-sessions/:id` | `OWNER` | Update extra session metadata (location, fee, date, time, notes). |
| **Extra Sessions** | `PATCH` | `/api/extra-sessions/:id/cancel` | `OWNER` | Cancel an extra session. |
| **Extra Sessions** | `POST` | `/api/extra-sessions/:id/students` | `OWNER` | Enroll additional students into an existing extra session. |
| **Extra Sessions** | `POST` | `/api/extra-sessions/:id/students/:studentId/pay` | `OWNER` | Collect extra session fee for an individual student. |
| **Extra Sessions** | `PATCH` | `/api/extra-sessions/:id/students/:studentId/waive` | `OWNER` | Waive extra session fee for an individual student. |

---

## 7. OpenAPI / Swagger Documentation & Live Status

### 7.1 OpenAPI Standards & Response Envelope Specifications
* **Single Source of Truth**: `docs/openapi.json` is maintained as the authoritative API spec and automatically merged in `src/main.ts` into NestJS Swagger UI.
* **Dual Definition Rule**: Both `schema` and `example` are declared on all `application/json` responses to ensure full Swagger UI body preview and type syntax rendering:
  ```json
  "content": {
    "application/json": {
      "schema": { "type": "object" },
      "example": { ... }
    }
  }
  ```
* **Unified Envelopes Agreed**:
  - **Single Resource**: `{ "success": true, "message": "...", "data": { ... } }`
  - **Paginated Collection**: `{ "success": true, "message": "...", "data": [ ... ], "meta": { "total": ..., "page": ..., "limit": ..., "totalPages": ..., "hasNextPage": ..., "hasPreviousPage": ... } }`
  - **Error (NestJS Standard)**: `{ "statusCode": ..., "message": "..." | [...], "error": "..." }`

### 7.2 Current Module Progress & Implementation Status (73 / 84 Operations Complete)

| Module | Endpoints Count | Swagger Status | Status Description |
| :--- | :---: | :---: | :--- |
| **Auth** | 7 | ✅ **Completed** | Full realistic examples for login (Center & SuperAdmin), me, change password, OTP reset. |
| **Centers** | 9 | ✅ **Completed** | Full CRUD, onboarding, status toggling, plan subscribe & renew. |
| **Subscription Plans** | 5 | ✅ **Completed** | Full CRUD, status toggle, public view endpoints. |
| **Subscription Payments** | 4 | ✅ **Completed** | Revenue summary, global list, and center-specific payment operations. |
| **Users** | 3 | ✅ **Completed** | Center user management, role immutability, hierarchy protection. |
| **Grades** | 10 | ✅ **Completed** | Academic grades CRUD, active status toggle, export/import Excel & PDF, template. |
| **Subjects** | 11 | ✅ **Completed** | Subjects CRUD, options dropdown, grade associations, limit checks, export/import Excel & PDF, template. |
| **Teachers** | 10 | ✅ **Completed** | Teacher onboarding, accounts, diff-synced subject relations, limit checks, export/import Excel & PDF, template. |
| **Students** | 10 | ✅ **Completed** | Student onboarding, accounts, grade enrollments, seat & plan limit checks, export/import Excel & PDF, template. |
| **Groups** | 12 | ✅ **Completed** | Full CRUD, schedule slots, capacity enforcement, student enroll/remove, export/import Excel & PDF, template. |
| **Home Stats** | 1 | ✅ **Completed** | SuperAdmin dashboard platform statistics. |
| **Schedule** | 2 | ✅ **Completed** | Calendar schedule and upcoming lessons endpoints with full schema and examples. |
| **Extra Sessions** | 9 | ✅ **Completed** | Scheduling, payment tracking, waiver, fee collection, cancelation, and on-date attendance session startup. |
| **Attendance** | 6 | ⏸️ **Pending** | Paused: Waiting for user updates to attendance session flow and reports. |
| **Payments** | 5 | ⏸️ **Pending** | Paused: Waiting for user updates to student monthly tuition fee logic. |

**Current Live Server Info**:
- Host: `http://localhost:5000`
- Swagger UI Documentation: `http://localhost:5000/api/docs`
- OpenAPI JSON Endpoint: `http://localhost:5000/api/docs-json`
