# EduCenter SaaS API — Multi-Tenant Educational Management Platform

[![NestJS](https://img.shields.io/badge/NestJS-11.0.1-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7.8.0-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-Private-yellow.svg)](#)

EduCenter API is an enterprise-grade, multi-tenant B2B SaaS backend engineered for tutoring centers, educational academies, and private lesson hubs. Built with **NestJS 11**, **Prisma ORM 7.8**, and **PostgreSQL**, it delivers strict tenant isolation, multi-tier subscription quotas, role-based access control, automated Excel/PDF reporting, attendance tracking, and parent portal access.

---

## Table of Contents

- [Core Features](#core-features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Configuration](#environment-configuration)
- [Database Setup & Seeding](#database-setup--seeding)
- [Running the Application](#running-the-application)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [API Architecture & Endpoints](#api-architecture--endpoints)
- [Authentication & Access Control](#authentication--access-control)
- [Subscription Lifecycle & Multi-Tenancy](#subscription-lifecycle--multi-tenancy)
- [Postman Collection & Verification](#postman-collection--verification)
- [Documentation Directory](#documentation-directory)
- [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Core Features

- **Multi-Tenant SaaS Architecture:** Complete data isolation per educational center using `AsyncLocalStorage` context propagation and custom Prisma tenant extensions (`where: { centerId }`).
- **Dual Authentication Tracks:** Separate authentication flows for Platform Administrators (`SUPER_ADMIN`) and Center Tenant Users (`OWNER`, `TEACHER`, `STUDENT`).
- **Real-Time Account Verification:** Real-time database check on every authenticated request ensuring deactivated accounts are immediately rejected with `401 Unauthorized`.
- **Subscription Guard & Quota Enforcement:** Hard quota limits on students and teachers per commercial plan, with an automated 3-day grace period (`X-Subscription-Warning`) and subsequent read-only enforcement.
- **Academic Hierarchy:** Stages/Grades, Curriculum Subjects, and Group Classes with weekly recurring schedules and seat capacities.
- **Attendance Tracking:** Date-normalized attendance sessions (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`) with absence notification logs.
- **Financial Tuition Matrix:** Student fee management, group monthly tuition matrices, and payment tracking.
- **High-Performance Reporting (DRY Architecture):** Formatted spreadsheets (`ExcelJS`) and RTL Arabic PDFs (`PdfMake` Cairo font) generated from unified dataset extractors.
- **Batch Excel Import Engine:** Two-phase Excel import pipeline with dry-run verification, reference ID validation, and atomic `422 Unprocessable Entity` error envelopes.
- **Public Parent Portal:** 30-day expiring magic link tokens (`/api/p/:token`) allowing parents to view real-time student attendance and fee status without login.

---

## Technology Stack

| Category | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | NestJS | `^11.0.1` | Modular Node.js enterprise backend framework |
| **Language** | TypeScript | `^5.7.3` | Strongly-typed JavaScript runtime |
| **ORM & Database** | Prisma Client & CLI | `^7.8.0` | Next-gen ORM with `@prisma/adapter-pg` driver adapter |
| **Database Engine** | PostgreSQL | `14+` | Primary relational transactional database |
| **Authentication** | Passport & JWT | `^11.0.2` | Stateless Bearer token authentication |
| **Security & Headers** | Helmet & Throttler | `^8.2.0` / `^6.5.0` | HTTP security headers and rate limiting (5 req/min on login) |
| **Data Validation** | Class-Validator / Transformer | `^0.15.1` / `^0.5.1` | Request DTO validation, whitelisting, and type coercion |
| **File Generation** | ExcelJS & PDFMake RTL | `^4.4.0` / `^2.1.2` | Excel workbooks and Arabic RTL PDF reports |
| **Cloud Storage** | Cloudinary & Multer | `^2.10.0` / `^2.2.0` | Multi-part form-data handling and cloud asset storage |
| **Documentation** | Swagger / OpenAPI 3.0 | `^11.4.7` | Dynamic API spec with dual schema and example mapping |

---

## Prerequisites

Ensure your development environment meets the following requirements:

1. **Node.js:** `v20.0.0` or higher (verified on Node `v24.18.0`)
2. **Package Manager:** `npm` (v10+)
3. **Database:** PostgreSQL `14+` running locally or accessible via network
4. **Git:** For version control

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd educenter-api-2
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Generate Prisma Client:**
   ```bash
   npx prisma generate
   ```

---

## Environment Configuration

Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

### Environment Variables Breakdown

```env
# Application Runtime
NODE_ENV=development
PORT=5000

# PostgreSQL Connection String (using public schema)
DATABASE_URL="postgresql://postgres:password@localhost:5432/educenter2?schema=public"

# Authentication Secrets & Expiration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=100d
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

# Cloudinary Storage (Optional for remote image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Frontend Client Origins (CORS whitelist)
FRONTEND_URL="http://localhost:3000,http://localhost:5173"

# Local Uploads Directory (fallback when cloud storage is disabled)
UPLOAD_DIR=uploads

# HTTP Request/Response Logging
HTTP_LOGGING_ENABLED=true
HTTP_LOGGING_LEVEL=verbose
HTTP_LOGGING_FORMAT=pretty
HTTP_LOGGING_MAX_BODY_LENGTH=1000
HTTP_LOGGING_REDACT_FIELDS=password,token,accessToken,refreshToken,authorization,cookie
```

---

## Database Setup & Seeding

1. **Push Prisma Schema to Database:**
   ```bash
   npx prisma db push
   ```

2. **Run Database Seed Script:**
   The seed script creates the default commercial subscription plans (`مجاني`, `الأساسية`, `الاحترافية`) and configures the platform Super Administrator account:
   ```bash
   npm run seed
   ```

### Default Development Credentials

| Role | Login Identifier | Default Password | Scope |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@educenter.com` | `Admin@123456` | Platform management (`centerId: null`) |
| **Center Owner** | `owner@alrowad.com` (or center email) | `Owner@123456` | Center management (`centerId: <cuid>`) |

---

## Running the Application

### Development Mode (with Watcher)
```bash
npm run start:dev
```

### Production Build & Execution
```bash
# 1. Compile TypeScript & generate Prisma artifacts
npm run build

# 2. Run compiled production bundle
npm run start:prod
```

### Direct Execution
```bash
npm run start
```

Once running, the API is available at:
- **Base URL:** `http://localhost:5000/api`
- **Interactive Swagger UI:** `http://localhost:5000/api/docs`

---

## Testing & Quality Assurance

```bash
# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate test coverage report
npm run test:cov

# Run end-to-end (e2e) tests
npm run test:e2e

# Run load and stress testing scripts
npm run test:load
npm run test:load:sustained
npm run test:load:stress

# Run ESLint validation
npm run lint
```

---

## API Architecture & Endpoints

The API consists of **98 production endpoints** divided into **16 functional modules**:

```
/api
├── /auth                      # 7 endpoints (Dual login, profiles, password recovery)
├── /centers                   # 9 endpoints (Center provisioning, plans, renewals, status)
├── /subscription-plans        # 5 endpoints (Plan catalog, quotas, toggles)
├── /subscription-payments     # 4 endpoints (Global payments, center cash receipts)
├── /users                     # 3 endpoints (Center staff and user management)
├── /grades                    # 10 endpoints (Grades, Excel/PDF exports, batch imports)
├── /subjects                  # 11 endpoints (Subjects, dropdown options, exports, imports)
├── /teachers                  # 10 endpoints (Teacher profiles, subject links, exports)
├── /students                  # 11 endpoints (Student registry, codes, exports, imports)
├── /groups                    # 12 endpoints (Classes, schedules, rosters, fees)
├── /attendance                # 6 endpoints (Session opening, roster saving, reports)
├── /payments                  # 5 endpoints (Group matrices, student fees, receipts)
├── /home-stats                # 1 endpoint (Real-time center dashboard metrics)
├── /notifications             # 1 endpoint (Dispatched alerts and WhatsApp history)
├── /audit-logs                # 1 endpoint (Immutable administrative audit trail)
└── /p                         # 2 endpoints (Expiring magic links, parent portal report)
```

For complete endpoint contracts, field definitions, and schema details, refer to [docs/API.md](docs/API.md).

---

## Authentication & Access Control

Authentication uses stateless **JSON Web Tokens (JWT)** passed via the `Authorization: Bearer <token>` HTTP header.

### 1. Dual Authentication Routes
- **Super Administrator:** `POST /api/auth/super-admin/login`  
  Payload: `{ "identifier": "superadmin@educenter.com", "password": "..." }`  
  Returns: JWT token with payload `{ sub, role: "SUPER_ADMIN", centerId: null }`
- **Center Users (Owner, Teacher, Student):** `POST /api/auth/login`  
  Payload: `{ "identifier": "<email-or-phone>", "password": "..." }`  
  Returns: JWT token with payload `{ sub, role: "OWNER" | "TEACHER" | "STUDENT", centerId: "<cuid>" }`

### 2. Active Account Verification
Every authenticated request is verified in real-time by `JwtStrategy.validate()` against the database (`isActive === true`). Deactivated users cannot execute requests even with a valid token.

### 3. Role-Based Permissions
- `SUPER_ADMIN`: Global platform management (plans, provisioning, platform revenue).
- `OWNER`: Full administrative authority within their center tenant (`centerId`).
- `TEACHER`: Scoped to assigned groups, attendance sessions, and student fee logs.
- `STUDENT`: Read-only access scoped strictly to their enrolled groups, attendance, and fees.

---

## Subscription Lifecycle & Multi-Tenancy

Every request directed to operational tenant controllers is protected by `SubscriptionGuard`:

1. **Active Subscription:** Full read/write access.
2. **Grace Period (3 Days after Expiry):** Read/write access remains active. The response includes an HTTP warning header:
   ```http
   X-Subscription-Warning: Grace period active. X days remaining.
   ```
3. **Read-Only Mode (After Grace Period):** Safe requests (`GET`, `HEAD`, `OPTIONS`) remain open for browsing and exporting data. Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) are blocked with `403 Forbidden`:
   ```json
   {
     "statusCode": 403,
     "message": "اشتراك السنتر منتهي، برجاء التجديد لاستكمال الإضافة والتعديل.",
     "error": "Forbidden"
   }
   ```
4. **Inactive / Deactivated Center:** Blocked immediately with machine-readable error code:
   ```json
   {
     "statusCode": 403,
     "message": "المركز لا يمتلك اشتراكاً نشطاً حالياً. يرجى الاشتراك في إحدى الباقات.",
     "error": "Forbidden",
     "code": "CENTER_SUBSCRIPTION_INACTIVE"
   }
   ```

---

## Postman Collection & Verification

A production Postman collection and environment are provided in the `/postman` directory:

- **Collection:** [`postman/EduCenter-API.postman_collection.json`](postman/EduCenter-API.postman_collection.json) (103 requests across 16 folders)
- **Environment:** [`postman/EduCenter-API.postman_environment.json`](postman/EduCenter-API.postman_environment.json)
- **Postman Cloud Workspace:** Synced to user workspace under collection ID `afe1d18f-07e8-4d0c-986e-7ac94d6660e4`.

### Key Postman Features
- **Automated Token Management:** Login requests automatically save the JWT token to `{{accessToken}}` and update `{{userRole}}` and `{{centerId}}`.
- **Chained CRUD Testing:** Resource creation requests automatically save created IDs (`gradeId`, `subjectId`, `teacherId`, `studentId`, `groupId`, `sessionId`, `magicToken`).
- **Contract Assertions:** Every request verifies status codes, JSON structure, and Arabic response messages.

For import and execution instructions, refer to [docs/POSTMAN.md](docs/POSTMAN.md).

---

## Documentation Directory

| Document | Purpose |
| :--- | :--- |
| [**docs/API.md**](docs/API.md) | Exhaustive API reference documenting all 98 endpoints with request/response schemas and Arabic examples. |
| [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md) | In-depth technical architecture, request lifecycle, tenant isolation, and export pipelines. |
| [**docs/POSTMAN.md**](docs/POSTMAN.md) | Postman setup guide, environment variables, automated workflows, and Newman CI/CD instructions. |
| [**docs/openapi.json**](docs/openapi.json) | Complete OpenAPI 3.0 specification defining all routes, parameters, and dual schemas. |
| [**docs/SUPER-ADMIN-API-FLOW.md**](docs/SUPER-ADMIN-API-FLOW.md) | Specialized business flow guide for Frontend Super Admin Dashboards. |

---

## Troubleshooting & FAQ

### 1. `400 Bad Request` on Login
- **Cause:** Using `email` instead of `identifier` in the request body.
- **Solution:** The login DTO uses `identifier` (`emailOrPhone`). Use:
  ```json
  { "identifier": "user@example.com", "password": "..." }
  ```

### 2. `403 Forbidden` with `CENTER_SUBSCRIPTION_INACTIVE`
- **Cause:** The center's subscription has expired and exceeded the 3-day grace period, or the center is deactivated.
- **Solution:** Renew the subscription via `POST /api/centers/:id/renew` or contact the Super Administrator.

### 3. `422 Unprocessable Entity` on Excel Import
- **Cause:** One or more rows in the uploaded Excel file contain invalid reference IDs (`gradeId`, `subjectId`, `teacherId`) or duplicate values.
- **Solution:** Inspect the `errors` array in the 422 response body to locate the exact row number and invalid field. Download the official template via `GET /api/[entity]/export/template` to copy verified IDs.

---

## License

This software is proprietary and confidential. Unauthorized copying, distribution, or modification is strictly prohibited.
