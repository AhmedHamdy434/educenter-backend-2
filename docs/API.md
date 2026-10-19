# EduCenter API — Complete Endpoint Reference

> **Base URL:** `http://localhost:5000/api`  
> **Global Prefix:** `/api`  
> **Authentication Header:** `Authorization: Bearer <accessToken>`  
> **Standard Response Format:** `{ "success": true, "message": "...", "data": ..., "meta": ... }`  
> **Total Implemented Operations:** 98 endpoints across 16 business modules.

---

## Table of Contents

- [Module 01: Authentication (`/auth`) — 7 Endpoints](#module-01-authentication-auth--7-endpoints)
- [Module 02: Centers Management (`/centers`) — 9 Endpoints](#module-02-centers-management-centers--9-endpoints)
- [Module 03: Subscription Plans (`/subscription-plans`) — 5 Endpoints](#module-03-subscription-plans-subscription-plans--5-endpoints)
- [Module 04: Subscription Payments (`/subscription-payments`) — 4 Endpoints](#module-04-subscription-payments-subscription-payments--4-endpoints)
- [Module 05: Users Management (`/users`) — 3 Endpoints](#module-05-users-management-users--3-endpoints)
- [Module 06: Academic Structure — Grades (`/grades`) — 10 Endpoints](#module-06-academic-structure--grades-grades--10-endpoints)
- [Module 07: Academic Structure — Subjects (`/subjects`) — 11 Endpoints](#module-07-academic-structure--subjects-subjects--11-endpoints)
- [Module 08: Teachers Management (`/teachers`) — 10 Endpoints](#module-08-teachers-management-teachers--10-endpoints)
- [Module 09: Students Management (`/students`) — 11 Endpoints](#module-09-students-management-students--11-endpoints)
- [Module 10: Groups & Classes (`/groups`) — 12 Endpoints](#module-10-groups--classes-groups--12-endpoints)
- [Module 11: Attendance Tracking (`/groups/:id/attendance`, `/students/:id/attendance`) — 6 Endpoints](#module-11-attendance-tracking--6-endpoints)
- [Module 12: Student Tuition & Payments (`/groups/:id/payments`, `/group-students/:id/payments`, `/students/:id/payments`) — 5 Endpoints](#module-12-student-tuition--payments--5-endpoints)
- [Module 13: Home & Dashboard Stats (`/home-stats`) — 1 Endpoint](#module-13-home--dashboard-stats-home-stats--1-endpoint)
- [Module 14: Notifications (`/notifications`) — 1 Endpoint](#module-14-notifications-notifications--1-endpoint)
- [Module 15: Security Audit Logs (`/audit-logs`) — 1 Endpoint](#module-15-security-audit-logs-audit-logs--1-endpoint)
- [Module 16: Parent Portal (`/p`) — 2 Endpoints](#module-16-parent-portal-p--2-endpoints)

---

## Module 01: Authentication (`/auth`) — 7 Endpoints

### 1.1 Center User Login
- **Endpoint:** `POST /api/auth/login`
- **Purpose:** Authenticates educational center users (`OWNER`, `TEACHER`, `STUDENT`) via email or phone number.
- **Auth / Role:** Public (Unauthenticated).
- **Rate Limit:** 5 requests per minute (`ThrottlerGuard`).
- **Request Body (`LoginDto`):**
  ```json
  {
    "identifier": "owner@alrowad.com",
    "password": "Owner@123456"
  }
  ```
  - `identifier` (string, required): Center user's registered email or phone number.
  - `password` (string, required): Account password.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم تسجيل الدخول بنجاح.",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "clyuser001",
        "fullName": "د. هاني الأحمدي",
        "email": "owner@alrowad.com",
        "phone": "01099887766",
        "role": "OWNER",
        "centerId": "clycenter001",
        "mustChangePassword": false,
        "center": {
          "id": "clycenter001",
          "name": "سنتر الرواد للغات",
          "slug": "alrowad-academy"
        }
      }
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Validation failure (empty identifier or password).
  - `401 Unauthorized`: `"بيانات الاعتماد غير صالحة"` or `"تم تعطيل هذا الحساب أو لم يعد صالحاً للاستخدام."`.
  - `429 Too Many Requests`: Rate limit exceeded.

---

### 1.2 Super Admin Login
- **Endpoint:** `POST /api/auth/super-admin/login`
- **Purpose:** Dedicated authentication gateway for the Platform Super Administrator.
- **Auth / Role:** Public (Unauthenticated).
- **Rate Limit:** 5 requests per minute (`ThrottlerGuard`).
- **Request Body (`LoginDto`):**
  ```json
  {
    "identifier": "superadmin@educenter.com",
    "password": "Admin@123456"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم تسجيل الدخول بنجاح.",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "clysuperadmin001",
        "fullName": "المدير العام (Super Admin)",
        "email": "superadmin@educenter.com",
        "role": "SUPER_ADMIN",
        "centerId": null
      }
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Invalid credentials or deactivated Super Admin account.

---

### 1.3 Get Super Admin Profile
- **Endpoint:** `GET /api/auth/super-admin/me`
- **Purpose:** Retrieves the currently authenticated Super Admin's profile.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم استرجاع بيانات الملف الشخصي بنجاح.",
    "data": {
      "id": "clysuperadmin001",
      "fullName": "المدير العام (Super Admin)",
      "email": "superadmin@educenter.com",
      "role": "SUPER_ADMIN",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  }
  ```
- **Error Responses:** `401 Unauthorized`, `403 Forbidden` (if accessed by center user).

---

### 1.4 Get Current User Profile
- **Endpoint:** `GET /api/auth/me`
- **Purpose:** Returns the authenticated user's profile and linked entity details (Teacher / Student).
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم استرجاع بيانات الملف الشخصي بنجاح.",
    "data": {
      "id": "clyuser001",
      "fullName": "د. هاني الأحمدي",
      "email": "owner@alrowad.com",
      "phone": "01099887766",
      "role": "OWNER",
      "centerId": "clycenter001",
      "mustChangePassword": false,
      "center": {
        "id": "clycenter001",
        "name": "سنتر الرواد للغات",
        "slug": "alrowad-academy"
      }
    }
  }
  ```

---

### 1.5 Change Password
- **Endpoint:** `PATCH /api/auth/change-password`
- **Purpose:** Changes the authenticated user's password.
- **Auth / Role:** Bearer JWT | Authenticated user.
- **Request Body (`ChangePasswordDto`):**
  ```json
  {
    "oldPassword": "Owner@123456",
    "newPassword": "NewSecurePassword@2026",
    "confirmPassword": "NewSecurePassword@2026"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم تغيير كلمة المرور بنجاح.",
    "data": null
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Old password incorrect or new passwords do not match.

---

### 1.6 Forgot Password (Request OTP)
- **Endpoint:** `POST /api/auth/forgot-password`
- **Purpose:** Generates a 6-digit OTP code and dispatches password recovery instructions.
- **Auth / Role:** Public (Unauthenticated).
- **Rate Limit:** 3 requests per minute.
- **Request Body (`ForgotPasswordDto`):**
  ```json
  {
    "email": "owner@alrowad.com"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم إرسال رمز التحقق إلى بريدك الإلكتروني بنجاح.",
    "data": null
  }
  ```

---

### 1.7 Reset Password (Verify OTP)
- **Endpoint:** `POST /api/auth/reset-password`
- **Purpose:** Verifies OTP code and sets a new account password.
- **Auth / Role:** Public (Unauthenticated).
- **Rate Limit:** 5 requests per minute.
- **Request Body (`ResetPasswordDto`):**
  ```json
  {
    "email": "owner@alrowad.com",
    "otp": "849201",
    "newPassword": "ResetSecurePassword@2026"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.",
    "data": null
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: OTP expired or invalid.

---

## Module 02: Centers Management (`/centers`) — 9 Endpoints

### 2.1 Provision New Center (Atomic Onboarding)
- **Endpoint:** `POST /api/centers`
- **Purpose:** Provisions a center, its primary `OWNER` account, and initial active `CenterSubscription` in a single atomic transaction.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Content-Type:** `multipart/form-data`
- **Form Fields (`CreateCenterDto`):**
  - `name` (string, required): Center educational name.
  - `slug` (string, required): Unique URL-friendly slug.
  - `email` (string, required): Primary contact email.
  - `phone` (string, required): Phone number.
  - `address` (string, optional): Physical center address.
  - `ownerFullName` (string, required): Primary owner full name.
  - `ownerEmail` (string, required): Primary owner login email.
  - `ownerPassword` (string, required): Owner password (min 6 characters).
  - `ownerPhone` (string, optional): Owner phone number.
  - `subscriptionPlanId` (string, required): Target `SubscriptionPlan` CUID.
  - `customPrice` (number, optional): Custom discounted or negotiated price.
  - `logo` (binary file, optional): Image file for center branding.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "تم إنشاء المركز التعليمي وحساب المالك والاشتراك بنجاح.",
    "data": {
      "id": "clycenter001",
      "name": "سنتر الرواد للغات",
      "slug": "alrowad-academy",
      "email": "contact@alrowad.com",
      "phone": "01099887766",
      "isActive": true,
      "owner": {
        "id": "clyuser001",
        "fullName": "د. هاني الأحمدي",
        "email": "owner@alrowad.com",
        "role": "OWNER"
      },
      "activeSubscription": {
        "id": "clysub001",
        "planName": "الأساسية",
        "startDate": "2026-10-01",
        "endDate": "2026-10-31",
        "status": "ACTIVE"
      }
    }
  }
  ```
- **Error Responses:**
  - `409 Conflict`: Slug or Email already registered (`اسم المعرف (slug) مستخدم بالفعل` / `البريد الإلكتروني مستخدم بالفعل`).

---

### 2.2 Get All Centers
- **Endpoint:** `GET /api/centers`
- **Purpose:** Paginated list of all centers across the platform with active subscription summaries.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Query Parameters (`GetCentersDto`):**
  - `page` (number, default 1), `limit` (number, default 10)
  - `search` (string, optional): Search by name, slug, email, or phone.
  - `isActive` (boolean, optional): Filter by activation status.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم استرجاع قائمة المراكز بنجاح.",
    "data": [ ... ],
    "meta": {
      "total": 4,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
  ```

---

### 2.3 Get Center Details By ID
- **Endpoint:** `GET /api/centers/:id`
- **Purpose:** Deep details, owner information, and subscription history for a single center.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Path Parameters:** `id` (string, required): Center CUID.
- **Success Response (`200 OK`):** Center record with full subscription relation list.

---

### 2.4 Update Center Info
- **Endpoint:** `PATCH /api/centers/:id`
- **Purpose:** Updates center metadata (name, contact details, address, logo).
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Content-Type:** `multipart/form-data`

---

### 2.5 Toggle Center Status
- **Endpoint:** `PATCH /api/centers/:id/status`
- **Purpose:** Activates or deactivates a center tenant platform-wide.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Request Body (`UpdateCenterStatusDto`):**
  ```json
  {
    "isActive": false
  }
  ```

---

### 2.6 Assign / Upgrade Center Subscription
- **Endpoint:** `POST /api/centers/:id/subscribe`
- **Purpose:** Assigns a new commercial plan to the center, creating an active `CenterSubscription`.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Request Body (`SubscribeCenterDto`):**
  ```json
  {
    "subscriptionPlanId": "clyplan002",
    "customPrice": 499
  }
  ```

---

### 2.7 Renew Center Subscription
- **Endpoint:** `POST /api/centers/:id/renew`
- **Purpose:** Extends the `endDate` of the center's active subscription by the requested month count.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Request Body (`RenewSubscriptionDto`):**
  ```json
  {
    "monthsCount": 3,
    "customPrice": 299
  }
  ```

---

### 2.8 Get My Center Info
- **Endpoint:** `GET /api/centers/me`
- **Purpose:** Retrieves the current authenticated user's center profile.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.

---

### 2.9 Get My Active Subscription Overview
- **Endpoint:** `GET /api/centers/my-subscription`
- **Purpose:** Returns center subscription health, quota usage (current vs max students/teachers), and expiration countdown.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم استرجاع تفاصيل الاشتراك بنجاح.",
    "data": {
      "planName": "الأساسية",
      "status": "ACTIVE",
      "startDate": "2026-10-01",
      "endDate": "2026-10-31",
      "studentLimit": 200,
      "studentsCount": 45,
      "teacherLimit": 15,
      "teachersCount": 6,
      "canCreateExams": true
    }
  }
  ```

---

## Module 03: Subscription Plans (`/subscription-plans`) — 5 Endpoints

### 3.1 Get Active Plans (Public)
- **Endpoint:** `GET /api/subscription-plans`
- **Purpose:** Returns the commercial subscription plan catalog for public pricing and landing pages.
- **Auth / Role:** Public (Unauthenticated).
- **Query Parameters:** `page`, `limit`, `search`, `type` (`MONTHLY` | `YEARLY`), `isPopular`, `isActive`.
- **Success Response (`200 OK`):** Paginated array of plans.

---

### 3.2 Get Plan By ID (Public)
- **Endpoint:** `GET /api/subscription-plans/:id`
- **Purpose:** Fetches details of a single subscription tier.
- **Auth / Role:** Public (Unauthenticated).

---

### 3.3 Create Subscription Plan
- **Endpoint:** `POST /api/subscription-plans`
- **Purpose:** Provisions a new commercial plan offering.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Request Body (`CreateSubscriptionPlanDto`):**
  ```json
  {
    "name": "الباقة المؤسسية 2026",
    "description": "للأكاديميات الكبرى ذات الفروع المتعددة",
    "price": 899,
    "type": "MONTHLY",
    "studentLimit": 2000,
    "teacherLimit": 100,
    "canCreateExams": true,
    "isPopular": true,
    "isActive": true
  }
  ```

---

### 3.4 Update Subscription Plan
- **Endpoint:** `PATCH /api/subscription-plans/:id`
- **Purpose:** Updates existing plan pricing or quotas.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.

---

### 3.5 Toggle Plan Status
- **Endpoint:** `PATCH /api/subscription-plans/:id/toggle-status`
- **Purpose:** Activates or archives a plan tier.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.

---

## Module 04: Subscription Payments (`/subscription-payments`) — 4 Endpoints

### 4.1 Get Subscription Financial Summary
- **Endpoint:** `GET /api/subscription-payments/summary`
- **Purpose:** Global platform dashboard KPI showing total subscription revenues, active center count, and monthly breakdown.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.

---

### 4.2 Get All Subscription Payments (Global)
- **Endpoint:** `GET /api/subscription-payments`
- **Purpose:** Chronological paginated audit list of all center payments platform-wide.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.

---

### 4.3 Record Center Subscription Payment
- **Endpoint:** `POST /api/centers/:centerId/subscription-payments`
- **Purpose:** Manually records a cash or bank payment received from a center.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.
- **Request Body (`CreateSubscriptionPaymentDto`):**
  ```json
  {
    "paid": 299,
    "periodStart": "2026-10-01",
    "periodEnd": "2026-10-31",
    "paymentMethod": "Bank Transfer",
    "notes": "سداد اشتراك شهر أكتوبر 2026"
  }
  ```

---

### 4.4 Get Center Subscription Payments History
- **Endpoint:** `GET /api/centers/:centerId/subscription-payments`
- **Purpose:** Payment history statement for a single center tenant.
- **Auth / Role:** Bearer JWT | `SUPER_ADMIN`.

---

## Module 05: Users Management (`/users`) — 3 Endpoints

### 5.1 Get Center Users
- **Endpoint:** `GET /api/users`
- **Purpose:** Lists all user accounts associated with the authenticated user's center.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Query Parameters (`GetUsersDto`):** `page`, `limit`, `search`, `role` (`OWNER`, `TEACHER`, `STUDENT`), `isActive`.

---

### 5.2 Get User By ID
- **Endpoint:** `GET /api/users/:id`
- **Purpose:** Retrieves deep details of a specific center user.
- **Auth / Role:** Bearer JWT | `OWNER`.

---

### 5.3 Update User Account
- **Endpoint:** `PATCH /api/users/:id`
- **Purpose:** Updates staff user details and access flags. User `role` is strictly immutable.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Request Body (`UpdateUserDto`):**
  ```json
  {
    "fullName": "أحمد محمود سالم (محدث)",
    "phone": "01012345678",
    "isActive": true,
    "mustChangePassword": false
  }
  ```

---

## Module 06: Academic Structure — Grades (`/grades`) — 10 Endpoints

### 6.1 Create Grade
- **Endpoint:** `POST /api/grades`
- **Purpose:** Creates an educational stage/grade for the center.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Request Body (`CreateGradeDto`):**
  ```json
  {
    "name": "الصف الأول الثانوي",
    "order": 1,
    "description": "المرحلة الثانوية"
  }
  ```
- **Error Responses:** `409 Conflict`: Duplicate grade name in this center.

---

### 6.2 Get Grades List
- **Endpoint:** `GET /api/grades`
- **Purpose:** Paginated list of grades with relational count badges (`_count.subjects`, `_count.groups`, `_count.enrollments`).
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.
- **Query Parameters (`GradeQueryDto`):** `page`, `limit`, `search`, `active`, `sortBy` (`name`, `order`, `createdAt`), `sortOrder` (`asc`, `desc`).

---

### 6.3 Export Grades to Excel
- **Endpoint:** `GET /api/grades/export/excel`
- **Purpose:** Streams formatted `.xlsx` workbook containing grades and ID columns formatted for fast copying (`numFmt: '@'`).
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.
- **Response Headers:** `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### 6.4 Export Grades to PDF
- **Endpoint:** `GET /api/grades/export/pdf`
- **Purpose:** Generates RTL Arabic PDF report using Cairo font.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.
- **Response Headers:** `Content-Type: application/pdf`

---

### 6.5 Download Grades Import Template
- **Endpoint:** `GET /api/grades/export/template`
- **Purpose:** Downloads empty Excel template with instruction sheet and column formatting.
- **Auth / Role:** Bearer JWT | `OWNER`.

---

### 6.6 Import Grades from Excel
- **Endpoint:** `POST /api/grades/import/excel`
- **Purpose:** Batch imports grades from Excel with optional dry-run preview.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Query Parameters:** `dryRun` (boolean, default `false`).
- **Content-Type:** `multipart/form-data` (`file` max 5MB).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم استيراد المراحل الدراسية بنجاح.",
    "data": {
      "totalRows": 2,
      "validRows": 2,
      "failedRows": 0,
      "errors": [],
      "data": [ ... ]
    }
  }
  ```
- **Error Response (`422 Unprocessable Entity`):**
  ```json
  {
    "statusCode": 422,
    "message": "تعذر استيراد الملف لوجود أخطاء في البيانات المرفقة.",
    "error": "Unprocessable Entity",
    "data": {
      "totalRows": 5,
      "validRows": 4,
      "failedRows": 1,
      "remainingErrorsCount": 0,
      "errors": [
        { "row": 3, "field": "name", "value": "الصف الأول الثانوي", "message": "المرحلة الدراسية مسجلة بالفعل في هذا المركز." }
      ]
    }
  }
  ```

---

### 6.7 Get Grade By ID
- **Endpoint:** `GET /api/grades/:id`
- **Purpose:** Returns single grade details.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.

---

### 6.8 Update Grade
- **Endpoint:** `PATCH /api/grades/:id`
- **Purpose:** Updates grade name, order, or description.
- **Auth / Role:** Bearer JWT | `OWNER`.

---

### 6.9 Toggle Grade Status
- **Endpoint:** `PATCH /api/grades/:id/toggle-status`
- **Purpose:** Toggles active/inactive state of the grade.
- **Auth / Role:** Bearer JWT | `OWNER`.

---

### 6.10 Delete Grade (Safe Deletion)
- **Endpoint:** `DELETE /api/grades/:id`
- **Purpose:** Safe deletion blocked if dependent subjects, groups, or students exist.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Success Response (`200 OK`):** `{ "success": true, "message": "تم حذف المرحلة الدراسية بنجاح.", "data": null }`
- **Error Response (`400 Bad Request`):** `"لا يمكن حذف المرحلة الدراسية لوجود مواد أو مجموعات أو طلاب مرتبطين بها."`

---

## Module 07: Academic Structure — Subjects (`/subjects`) — 11 Endpoints

### 7.1 Get Subject Options
- **Endpoint:** `GET /api/subjects/options`
- **Purpose:** Fast dropdown options for forms, filterable by `gradeId`.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.

### 7.2 Create Subject
- **Endpoint:** `POST /api/subjects`
- **Request Body (`CreateSubjectDto`):** `{ "name": "الكيمياء", "gradeId": "<cuid>", "description": "..." }`

### 7.3 Get Subjects List
- **Endpoint:** `GET /api/subjects`
- **Query Parameters:** `page`, `limit`, `search`, `active`, `gradeId`, `sortBy`, `sortOrder`.

### 7.4 Export Subjects to Excel (`GET /api/subjects/export/excel`)
### 7.5 Export Subjects to PDF (`GET /api/subjects/export/pdf`)
### 7.6 Download Subjects Template (`GET /api/subjects/export/template`)
### 7.7 Import Subjects from Excel (`POST /api/subjects/import/excel?dryRun=false`)
- Foreign relation relies strictly on `gradeId`.
### 7.8 Get Subject By ID (`GET /api/subjects/:id`)
### 7.9 Update Subject (`PATCH /api/subjects/:id`)
### 7.10 Toggle Subject Status (`PATCH /api/subjects/:id/toggle-status`)
### 7.11 Delete Subject (`DELETE /api/subjects/:id`)
- Safe deletion blocked if groups or teacher assignments exist (`400 Bad Request`: `"لا يمكن حذف المادة الدراسية لوجود مجموعات دراسية أو معلمين مرتبطين بها."`).

---

## Module 08: Teachers Management (`/teachers`) — 10 Endpoints

### 8.1 Create Teacher
- **Endpoint:** `POST /api/teachers`
- **Purpose:** Enforces plan `teacherLimit`, creates User account and Teacher profile, and links subject capabilities.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Request Body (`CreateTeacherDto`):**
  ```json
  {
    "fullName": "أ. محمود شاكر",
    "email": "teacher@alrowad.com",
    "phone": "01099887711",
    "password": "Teacher@123456",
    "bio": "معلم أول كيمياء",
    "subjectIds": ["clysub001"]
  }
  ```

### 8.2 Get Teachers List (`GET /api/teachers`)
### 8.3 Export Teachers to Excel (`GET /api/teachers/export/excel`)
### 8.4 Export Teachers to PDF (`GET /api/teachers/export/pdf`)
### 8.5 Download Teachers Template (`GET /api/teachers/export/template`)
### 8.6 Import Teachers from Excel (`POST /api/teachers/import/excel?dryRun=false`)
### 8.7 Get Teacher By ID (`GET /api/teachers/:id`)
### 8.8 Update Teacher (`PATCH /api/teachers/:id`)
### 8.9 Toggle Teacher Status (`PATCH /api/teachers/:id/toggle-status`)
### 8.10 Delete Teacher (`DELETE /api/teachers/:id`)
- Safe deletion blocked if teacher has assigned groups (`400 Bad Request`: `"لا يمكن حذف المعلم لوجود مجموعات دراسية مرتبطة به."`). Atomically deletes both Teacher and User records.

---

## Module 09: Students Management (`/students`) — 11 Endpoints

### 9.1 Create Student
- **Endpoint:** `POST /api/students`
- **Purpose:** Enforces plan `studentLimit`, creates user account, student profile, unique center code, and grade enrollment.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Request Body (`CreateStudentDto`):**
  ```json
  {
    "fullName": "يوسف أحمد كمال",
    "email": "youssef@example.com",
    "phone": "01055443322",
    "parentPhone": "01233445566",
    "password": "Student@123456",
    "code": "STU-2601",
    "gradeId": "clygrade001",
    "notes": "طالب متفوق"
  }
  ```

### 9.2 Get Students List (`GET /api/students`)
### 9.3 Export Students to Excel (`GET /api/students/export/excel`)
### 9.4 Export Students to PDF (`GET /api/students/export/pdf`)
### 9.5 Download Students Template (`GET /api/students/export/template`)
### 9.6 Import Students from Excel (`POST /api/students/import/excel?dryRun=false`)
### 9.7 Get Student By Code
- **Endpoint:** `GET /api/students/by-code/:code`
- **Purpose:** Fast lookup by unique student code (with or without `STU-` prefix).
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.

### 9.8 Get Student By ID (`GET /api/students/:id`)
### 9.9 Update Student (`PATCH /api/students/:id`)
### 9.10 Toggle Student Status (`PATCH /api/students/:id/toggle-status`)
### 9.11 Delete Student (`DELETE /api/students/:id`)
- Safe deletion blocked if student has groups or attendance records (`400 Bad Request`: `"لا يمكن حذف الطالب لوجود مجموعات دراسية أو سجلات حضور مرتبطة به."`).

---

## Module 10: Groups & Classes (`/groups`) — 12 Endpoints

### 10.1 Create Group
- **Endpoint:** `POST /api/groups`
- **Request Body (`CreateGroupDto`):**
  ```json
  {
    "name": "مجموعة الأوائل - كيمياء 3ث",
    "gradeId": "clygrade001",
    "subjectId": "clysubject001",
    "teacherId": "clyteacher001",
    "capacity": 30,
    "monthlyFee": 300,
    "startDate": "2026-10-01",
    "monthsCount": 8,
    "schedule": [
      { "day": "SUNDAY", "hour": 16, "minute": 30 },
      { "day": "WEDNESDAY", "hour": 16, "minute": 30 }
    ]
  }
  ```

### 10.2 Get Groups List (`GET /api/groups`)
### 10.3 Export Groups to Excel (`GET /api/groups/export/excel`)
### 10.4 Export Groups to PDF (`GET /api/groups/export/pdf`)
### 10.5 Download Groups Template (`GET /api/groups/export/template`)
### 10.6 Import Groups from Excel (`POST /api/groups/import/excel?dryRun=false`)
### 10.7 Get Group By ID (`GET /api/groups/:id`)
### 10.8 Update Group (`PATCH /api/groups/:id`)
### 10.9 Toggle Group Status (`PATCH /api/groups/:id/toggle-status`)
### 10.10 Enroll Student in Group
- **Endpoint:** `POST /api/groups/:id/students`
- **Request Body:** `{ "studentId": "...", "subscriptionStartDate": "2026-10-01" }`
### 10.11 Remove Student from Group
- **Endpoint:** `DELETE /api/groups/:id/students`
- **Request Body:** `{ "studentId": "..." }`
### 10.12 Delete Group (`DELETE /api/groups/:id`)
- Safe deletion blocked if students are enrolled (`400 Bad Request`: `"لا يمكن حذف المجموعة لوجود طلاب مسجلين بها."`).

---

## Module 11: Attendance Tracking — 6 Endpoints

### 11.1 Start or Open Session
- **Endpoint:** `POST /api/groups/:groupId/attendance/session`
- **Purpose:** Initializes an attendance session for today or retrieves an existing open session.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.

### 11.2 Get Session Details & Roster
- **Endpoint:** `GET /api/groups/:groupId/attendance/session/:sessionId`
- **Purpose:** Returns enrolled students with their recorded attendance states for the session.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.

### 11.3 Save Attendance Records
- **Endpoint:** `POST /api/groups/:groupId/attendance/session/:sessionId/save`
- **Purpose:** Batch saves attendance statuses (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`) and dispatches absence alerts.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.
- **Request Body (`SaveAttendanceDto`):**
  ```json
  {
    "records": [
      {
        "studentId": "clystudent001",
        "status": "ABSENT",
        "absenceReason": "عذر مرضي"
      }
    ]
  }
  ```

### 11.4 Get Group Sessions List
- **Endpoint:** `GET /api/groups/:groupId/attendance/sessions`
- **Purpose:** Chronological history of attendance sessions for the group.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.

### 11.5 Get Group Attendance Report
- **Endpoint:** `GET /api/groups/:groupId/attendance/report`
- **Purpose:** Aggregated attendance percentages and absence counts for all students in the group.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.

### 11.6 Get Student Attendance Report
- **Endpoint:** `GET /api/students/:studentId/attendance/report`
- **Purpose:** Individual student attendance record across all classes.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.

---

## Module 12: Student Tuition & Payments — 5 Endpoints

### 12.1 Get Group Payments Matrix
- **Endpoint:** `GET /api/groups/:groupId/payments`
- **Purpose:** Full matrix of student payment states for each academic month of the group.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.

### 12.2 Export Group Payments to Excel
- **Endpoint:** `GET /api/groups/:groupId/payments/export/excel`
- **Purpose:** Streams formatted spreadsheet showing student fee matrices.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.

### 12.3 Record Student Monthly Payment
- **Endpoint:** `POST /api/group-students/:groupStudentId/payments`
- **Purpose:** Records tuition payment for a student's group enrollment.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.
- **Request Body (`PayMonthDto`):**
  ```json
  {
    "subscriptionDate": "2026-10-01",
    "amount": 300,
    "notes": "سداد نقدي في الخزينة"
  }
  ```

### 12.4 Get Student Payments History
- **Endpoint:** `GET /api/students/:studentId/payments`
- **Purpose:** Statement of account for a student across all groups.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.

### 12.5 Export Student Payments to Excel
- **Endpoint:** `GET /api/students/:studentId/payments/export/excel`
- **Purpose:** Exports individual student financial statement to Excel.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`, `STUDENT`.

---

## Module 13: Home & Dashboard Stats (`/home-stats`) — 1 Endpoint

### 13.1 Get Center Dashboard Statistics
- **Endpoint:** `GET /api/home-stats`
- **Purpose:** Returns real-time KPI counts: active students, teachers, groups, today's attendance sessions, and monthly fee collections.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم استرجاع إحصائيات الصفحة الرئيسية بنجاح.",
    "data": {
      "totalStudents": 150,
      "totalTeachers": 12,
      "totalGroups": 18,
      "todaySessions": 4,
      "monthlyRevenue": 45000
    }
  }
  ```

---

## Module 14: Notifications (`/notifications`) — 1 Endpoint

### 14.1 Get Center Notifications
- **Endpoint:** `GET /api/notifications`
- **Purpose:** Lists dispatched notifications (absence warnings, payment receipts, onboarding credentials).
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Query Parameters:** `page`, `limit`, `search`, `type`, `isSent`, `isRead`.

---

## Module 15: Security Audit Logs (`/audit-logs`) — 1 Endpoint

### 15.1 Get Center Audit Trail
- **Endpoint:** `GET /api/audit-logs`
- **Purpose:** Immutable audit trail tracking administrative actions with IP address and user agent.
- **Auth / Role:** Bearer JWT | `OWNER`.
- **Query Parameters:** `page`, `limit`, `search`, `action` (`CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `PAYMENT_COLLECTION`, `LOGIN`), `entity`.

---

## Module 16: Parent Portal (`/p`) — 2 Endpoints

### 16.1 Generate Parent Magic Token
- **Endpoint:** `POST /api/p/generate/:studentId`
- **Purpose:** Generates a secure, expiring 30-day magic link token for a student.
- **Auth / Role:** Bearer JWT | `OWNER`, `TEACHER`.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "تم توليد الرابط السحري بنجاح.",
    "data": {
      "token": "a1b2c3d4e5f6...",
      "expiresAt": "2026-11-19T12:00:00.000Z",
      "portalUrl": "https://educenter.vercel.app/p/a1b2c3d4e5f6..."
    }
  }
  ```

---

### 16.2 Get Student Progress Report By Token (Public)
- **Endpoint:** `GET /api/p/:token`
- **Purpose:** Public endpoint allowing parents to view real-time student attendance rate, absences, and tuition payment status without account creation or login.
- **Auth / Role:** Public (Unauthenticated).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "تم استرجاع تقرير الطالب بنجاح.",
    "data": {
      "student": {
        "fullName": "يوسف أحمد كمال",
        "code": "STU-2601",
        "gradeName": "الصف الأول الثانوي"
      },
      "attendanceRate": "92%",
      "sessions": [ ... ],
      "payments": [ ... ]
    }
  }
  ```
- **Error Response (`404 Not Found`):** Token expired or invalid.
