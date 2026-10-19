# EduCenter API — Postman Collection & Integration Guide

> **Collection Name:** `EduCenter SaaS API`  
> **Postman Format:** Collection v2.1.0  
> **Postman Cloud Workspace:** `My Workspace` (`9b79106a-aebc-492a-841f-03cc1dc4a767`)  
> **Cloud Collection UID:** `51246346-afe1d18f-07e8-4d0c-986e-7ac94d6660e4`  
> **Cloud Environment UID:** `51246346-16b73113-f068-49e2-9727-3d74ec862b8a`

---

## Table of Contents

1. [Overview & Features](#1-overview--features)
2. [File Locations & Import Guide](#2-file-locations--import-guide)
3. [Environment Configuration](#3-environment-configuration)
4. [Automated Authentication & Dynamic Token Handling](#4-automated-authentication--dynamic-token-handling)
5. [Sequential Testing Workflows](#5-sequential-testing-workflows)
6. [Pre-configured Assertions & Test Scripts](#6-pre-configured-assertions--test-scripts)
7. [Negative & Edge Case Testing](#7-negative--edge-case-testing)
8. [Automated Execution via Newman CLI](#8-automated-execution-via-newman-cli)

---

## 1. Overview & Features

The **EduCenter SaaS API Postman Collection** is a comprehensive test and exploration suite designed to exercise the entire surface of the backend platform.

### Collection Highlights:
- **103 Requests across 16 Modules:** Covers all 98 backend endpoints plus dual dry-run / execute variants for Excel imports.
- **Automated Token Chaining:** Login endpoints automatically parse the response, extract `data.accessToken`, and inject it into the active environment.
- **Dynamic Resource ID Propagation:** Creating any entity (Plan, Center, Grade, Subject, Teacher, Student, Group, Attendance Session) automatically captures its ID and stores it for subsequent requests.
- **Pre-Configured Assertions:** Every request verifies HTTP status codes, response envelopes (`success: true`), and Arabic operational messages.
- **Zero Manual Copy-Pasting:** Workflows can be run sequentially from start to finish without manually copying tokens or IDs.

---

## 2. File Locations & Import Guide

The collection and environment files are tracked in the repository under the `/postman` directory:

```text
postman/
├── EduCenter-API.postman_collection.json    # Full API collection (16 folders, 103 requests)
└── EduCenter-API.postman_environment.json   # Local development environment variables
```

### Option A: Importing Local JSON Files into Postman
1. Open the Postman Desktop App or Web App.
2. Click the **Import** button in the top-left corner.
3. Drag and drop both:
   - `postman/EduCenter-API.postman_collection.json`
   - `postman/EduCenter-API.postman_environment.json`
4. In the top-right environment selector, select **"EduCenter Local Environment"**.

### Option B: Using Postman Cloud Sync (MCP Connected)
The collection has been synchronized to the Postman workspace. You can access it directly in your Postman desktop client under the workspace **"My Workspace"**.

---

## 3. Environment Configuration

The environment file defines variable placeholders used across requests:

| Variable | Type | Default Local Value | Description |
| :--- | :---: | :--- | :--- |
| `baseUrl` | `default` | `http://localhost:5000/api` | API Base URL with global prefix |
| `superAdminEmail` | `default` | `superadmin@educenter.com` | Super Admin login email |
| `superAdminPassword` | `secret` | `Admin@123456` | Super Admin password |
| `centerIdentifier` | `default` | `owner@alrowad.com` | Center Owner login email or phone |
| `centerPassword` | `secret` | `Owner@123456` | Center Owner password |
| `accessToken` | `secret` | *(Dynamically set on login)* | Active Bearer JWT token |
| `userRole` | `default` | *(Dynamically set on login)* | Current active role (`SUPER_ADMIN`, `OWNER`, etc.) |
| `centerId` | `default` | `cmu5aoybh000088u1hh04r23s` | Current active center tenant CUID |
| `userId` | `default` | `cmu5aoyc0000188u1pkqayher` | Current active user CUID |
| `planId` | `default` | *(Captured on plan create)* | Active SubscriptionPlan ID |
| `gradeId` | `default` | *(Captured on grade create)* | Active Grade ID |
| `subjectId` | `default` | *(Captured on subject create)* | Active Subject ID |
| `teacherId` | `default` | *(Captured on teacher create)* | Active Teacher ID |
| `studentId` | `default` | *(Captured on student create)* | Active Student ID |
| `studentCode` | `default` | `STU-2601` | Unique Student code identifier |
| `groupId` | `default` | *(Captured on group create)* | Active Group ID |
| `groupStudentId` | `default` | *(Captured on student enroll)*| Group student enrollment junction ID |
| `sessionId` | `default` | *(Captured on session start)* | Attendance session ID |
| `magicToken` | `default` | *(Captured on token generate)*| Expiring 30-day parent magic link token |

---

## 4. Automated Authentication & Dynamic Token Handling

Authentication tokens are handled automatically via Postman test sandbox scripts.

### 1. Super Admin Authentication (`POST /api/auth/super-admin/login`)
The request payload uses `identifier` and `password`:
```json
{
  "identifier": "{{superAdminEmail}}",
  "password": "{{superAdminPassword}}"
}
```
**Post-Response Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

try {
    var jsonData = pm.response.json();
    if (jsonData.data && jsonData.data.accessToken) {
        pm.environment.set("accessToken", jsonData.data.accessToken);
        pm.environment.set("userRole", "SUPER_ADMIN");
        console.log("Super Admin Token captured successfully!");
    }
} catch (e) {
    console.error("Token extraction failed", e);
}
```

### 2. Center User Authentication (`POST /api/auth/login`)
The request payload uses `identifier` (`emailOrPhone`) and `password`:
```json
{
  "identifier": "{{centerIdentifier}}",
  "password": "{{centerPassword}}"
}
```
**Post-Response Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

try {
    var jsonData = pm.response.json();
    if (jsonData.data && jsonData.data.accessToken) {
        pm.environment.set("accessToken", jsonData.data.accessToken);
        if (jsonData.data.user) {
            pm.environment.set("userRole", jsonData.data.user.role);
            if (jsonData.data.user.centerId) {
                pm.environment.set("centerId", jsonData.data.user.centerId);
            }
        }
        console.log("Center user access token captured successfully!");
    }
} catch (e) {
    console.error("Token extraction failed", e);
}
```

### 3. Automatic Bearer Header Injection
The collection configures Bearer token authorization at the collection root:
- **Type:** `Bearer Token`
- **Token:** `{{accessToken}}`
- **Public Routes:** Routes that do not require authentication (`/auth/login`, `/auth/super-admin/login`, `/auth/forgot-password`, `/auth/reset-password`, public `/subscription-plans`, and `/p/:token`) explicitly declare `auth: { type: "noauth" }` to override the collection header.

---

## 5. Sequential Testing Workflows

The collection is ordered to enable sequential execution from top to bottom:

### Workflow 1: Platform Setup (Super Admin)
1. Run `01. Authentication -> Super Admin Login` (stores `accessToken`).
2. Run `03. Subscription Plans -> Create Subscription Plan` (stores `planId`).
3. Run `02. Centers Management -> Provision New Center` (stores `centerId`).
4. Run `02. Centers Management -> Renew Center Subscription`.
5. Run `04. Subscription Payments -> Record Center Subscription Payment`.
6. Run `04. Subscription Payments -> Get Global Subscription Financial Summary`.

### Workflow 2: Center Onboarding & Curriculum Setup (Owner)
1. Run `01. Authentication -> Center User Login` (switches token to `OWNER`).
2. Run `02. Centers Management -> Get My Center Info`.
3. Run `02. Centers Management -> Get My Active Subscription Overview`.
4. Run `06. Academic Structure - Grades -> Create Grade` (stores `gradeId`).
5. Run `07. Academic Structure - Subjects -> Create Subject` (stores `subjectId`).
6. Run `08. Teachers Management -> Create Teacher` (stores `teacherId`).
7. Run `09. Students Management -> Create Student` (stores `studentId` and `studentCode`).
8. Run `10. Groups & Classes -> Create Group` (stores `groupId`).
9. Run `10. Groups & Classes -> Enroll Student in Group` (stores `groupStudentId`).

### Workflow 3: Daily Operations (Attendance & Fee Collections)
1. Run `11. Attendance Tracking -> Start or Open Attendance Session` (stores `sessionId`).
2. Run `11. Attendance Tracking -> Get Session Details & Student Roster`.
3. Run `11. Attendance Tracking -> Save Attendance Records (Batch)`.
4. Run `12. Student Tuition & Monthly Payments -> Record Student Monthly Payment`.
5. Run `12. Student Tuition & Monthly Payments -> Get Group Payments Matrix`.
6. Run `13. Home & Dashboard Stats -> Get Center Home Dashboard Statistics`.

### Workflow 4: Parent Portal Magic Link
1. Run `16. Parent Portal -> Generate 30-Day Magic Token` (stores `magicToken`).
2. Run `16. Parent Portal -> Get Student Progress Report By Token (Public)` (runs without token).

---

## 6. Pre-configured Assertions & Test Scripts

Every JSON endpoint contains standardized assertions verifying the response contract:

```javascript
pm.test("Status code is 2xx", function () {
    pm.response.to.be.success;
});

pm.test("Response has JSON format and success flag", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.be.an("object");
    if (jsonData.statusCode) {
        pm.expect(jsonData.statusCode).to.be.below(400);
    }
    if (jsonData.success !== undefined) {
        pm.expect(jsonData.success).to.be.true;
    }
});
```

For file download endpoints (`/export/excel`, `/export/pdf`, `/export/template`), the test verifies binary headers:
```javascript
pm.test("Response returns binary/file content", function () {
    pm.expect(pm.response.headers.get("Content-Type")).to.exist;
});
```

---

## 7. Negative & Edge Case Testing

The collection can be used to verify backend protection policies:

| Test Case | Method & Path | Expected Result | Verified Message |
| :--- | :--- | :---: | :--- |
| **Missing Token** | `GET /api/grades` (without Authorization header) | `401 Unauthorized` | `Unauthorized` |
| **Insufficient Permissions** | `POST /api/subscription-plans` (with `OWNER` token) | `403 Forbidden` | `Forbidden resource` |
| **Safe Deletion Block** | `DELETE /api/grades/:id` (grade with linked subjects) | `400 Bad Request` | `لا يمكن حذف المرحلة الدراسية لوجود مواد أو مجموعات أو طلاب مرتبطين بها.` |
| **Duplicate Entity Name** | `POST /api/grades` (existing name for same center) | `409 Conflict` | `اسم المرحلة الدراسية مسجل بالفعل في هذا المركز.` |
| **Invalid Excel Rows** | `POST /api/grades/import/excel` (invalid file) | `422 Unprocessable` | `تعذر استيراد الملف لوجود أخطاء في البيانات المرفقة.` |
| **Rate Limit Trigger** | Call `POST /api/auth/login` 6 times in 1 minute | `429 Too Many Requests` | `ThrottlerException: Too Many Requests` |

---

## 8. Automated Execution via Newman CLI

To execute the entire Postman collection headlessly in CI/CD pipelines:

### 1. Install Newman
```bash
npm install -g newman newman-reporter-htmlextra
```

### 2. Run Collection against Local Server
```bash
newman run postman/EduCenter-API.postman_collection.json \
  -e postman/EduCenter-API.postman_environment.json \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export ./newman-report.html
```

### 3. Run Specific Folder
```bash
# Run only Authentication tests
newman run postman/EduCenter-API.postman_collection.json \
  -e postman/EduCenter-API.postman_environment.json \
  --folder "01. Authentication"
```
