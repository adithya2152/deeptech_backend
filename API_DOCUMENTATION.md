# DeepTech Backend API - Complete Implementation Guide

## 🎯 Overview

This implementation provides a complete contract and NDA management system with:

- **Engagement Models**: Daily, Sprint, and Fixed pricing
- **NDA Workflow**: Pending → Active contract status after expert signs NDA
- **Work Logs**: Type-based submissions (daily_log, sprint_submission, milestone_request)
- **File Upload**: Supabase Storage integration for attachments and evidence
- **Validation**: Type-based validation for each engagement model

---

## 📊 Database Schema (Supabase)

### Proposals Table

```sql
- id: UUID (primary key)
- project_id: UUID (foreign key)
- expert_id: UUID (foreign key)
- engagement_model: ENUM ('daily', 'sprint', 'fixed')
- rate: NUMERIC
- duration_days: INTEGER
- sprint_count: INTEGER (optional)
- quote_amount: NUMERIC
- message: TEXT
- status: TEXT (default: 'pending')
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### Contracts Table

```sql
- id: UUID (primary key)
- project_id: UUID (foreign key)
- buyer_id: UUID (foreign key)
- expert_id: UUID (foreign key)
- engagement_model: ENUM ('daily', 'sprint', 'fixed')
- payment_terms: JSONB
- status: ENUM (default: 'pending')
- nda_signed_at: TIMESTAMP (null until signed)
- nda_signature_name: TEXT
- nda_ip_address: TEXT
- start_date: DATE
- created_at: TIMESTAMP
```

### Work Logs Table

```sql
- id: UUID (primary key)
- contract_id: UUID (foreign key)
- type: ENUM ('daily_log', 'sprint_submission', 'milestone_request')
- checklist: JSONB
- problems_faced: TEXT
- sprint_number: INTEGER
- evidence: JSONB
- created_at: TIMESTAMP
```

---

## 🔐 Authentication

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### User Roles

- **buyer**: Can create contracts, view proposals
- **expert**: Can create proposals, sign NDAs, submit work logs
- **admin**: Full access to all resources

---

## 📋 API Endpoints

### **1. Proposals API**

#### `POST /api/proposals`

Create a new proposal (Expert only)

**Headers:**

```
Authorization: Bearer <expert-token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "project_id": "uuid",
  "engagement_model": "daily|sprint|fixed",
  "rate": 800,
  "duration_days": 30,
  "sprint_count": 4,
  "quote_amount": 24000,
  "message": "I can deliver this project..."
}
```

**Validation Rules:**

- `sprint_count` required if `engagement_model` is "sprint"
- All rates must be positive numbers
- `duration_days` must be at least 1

**Response:**

```json
{
  "success": true,
  "message": "Proposal created successfully",
  "data": {
    "id": "uuid",
    "project_id": "uuid",
    "expert_id": "uuid",
    "engagement_model": "sprint",
    "rate": 2500,
    "duration_days": 56,
    "sprint_count": 4,
    "quote_amount": 10000,
    "status": "pending",
    "created_at": "2025-12-24T10:00:00Z"
  }
}
```

#### `GET /api/proposals/project/:projectId`

Get all proposals for a project

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "expert_first_name": "John",
      "expert_last_name": "Doe",
      "engagement_model": "sprint",
      "rate": 2500,
      "status": "pending"
    }
  ]
}
```

#### `GET /api/proposals/expert/my-proposals`

Get current expert's proposals

#### `GET /api/proposals/:proposalId`

Get single proposal details

#### `PATCH /api/proposals/:proposalId`

Update proposal (Expert only, pending status only)

#### `DELETE /api/proposals/:proposalId`

Withdraw proposal (Expert only, pending status only)

---

### **2. Contracts API**

#### `POST /api/contracts`

Create a contract / Hire Expert (Buyer only)

**Headers:**

```
Authorization: Bearer <buyer-token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "expert_id": "uuid",
  "project_id": "uuid",
  "engagement_model": "daily|sprint|fixed",
  "payment_terms": {
    // For daily model:
    "daily_rate": 800,
    "currency": "USD"

    // OR for sprint model:
    "sprint_rate": 2500,
    "sprint_duration_days": 14,
    "total_sprints": 4

    // OR for fixed model:
    "total_amount": 10000,
    "milestones": [...]
  },
  "start_date": "2025-01-15"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Contract created successfully. Expert needs to sign NDA to activate.",
  "data": {
    "id": "uuid",
    "status": "pending",
    "nda_signed_at": null,
    "engagement_model": "sprint",
    "payment_terms": {...},
    "created_at": "2025-12-24T10:00:00Z"
  }
}
```

#### `POST /api/contracts/:contractId/accept-and-sign-nda`

Expert signs NDA and activates contract

**Headers:**

```
Authorization: Bearer <expert-token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "signature_name": "John Doe"
}
```

**Business Logic:**

- Records `nda_signed_at` as current timestamp
- Records `nda_signature_name` from request
- Records `nda_ip_address` from request IP
- Changes contract `status` from "pending" to "active"
- Updates project status to "active"

**Response:**

```json
{
  "success": true,
  "message": "NDA signed successfully. Contract is now active.",
  "data": {
    "id": "uuid",
    "status": "active",
    "nda_signed_at": "2025-12-24T10:30:00Z",
    "nda_signature_name": "John Doe",
    "nda_ip_address": "192.168.1.1"
  }
}
```

#### `GET /api/contracts`

Get all contracts for current user

#### `GET /api/contracts/project/:projectId`

Get all contracts for a project

#### `GET /api/contracts/:contractId`

Get contract details

#### `POST /api/contracts/:contractId/decline`

Expert declines contract (pending status only)

---

### **3. Work Logs API**

#### `POST /api/work-logs`

Submit work log (Expert only, active contract required)

**Headers:**

```
Authorization: Bearer <expert-token>
Content-Type: multipart/form-data
```

**Form Data:**

```
contract_id: uuid (required)
type: "daily_log|sprint_submission|milestone_request" (required)
checklist: JSON string (required for sprint)
problems_faced: text (optional)
sprint_number: integer (required for sprint)
evidence_summary: text (optional)
attachments: file[] (up to 10 files, 50MB each)
```

**Validation Rules by Engagement Model:**

**Daily Model:**

- Type must be "daily_log"
- Max 1 submission per 24 hours
- Evidence optional but recommended

**Sprint Model:**

- Type must be "sprint_submission"
- `sprint_number` required (starting from 1)
- `checklist` required (array of tasks with status)
- Evidence attachments recommended

**Fixed Model:**

- Type must be "milestone_request"
- Evidence required showing milestone completion

**Example for Sprint Submission:**

```javascript
const formData = new FormData();
formData.append("contract_id", "contract-uuid");
formData.append("type", "sprint_submission");
formData.append("sprint_number", "1");
formData.append(
  "checklist",
  JSON.stringify([
    { task: "API Design", status: "completed" },
    { task: "Database Setup", status: "completed" },
    { task: "Authentication", status: "in_progress" },
  ])
);
formData.append(
  "problems_faced",
  "Database migration took longer than expected"
);
formData.append("evidence_summary", "Sprint 1 deliverables");
formData.append("attachments", file1);
formData.append("attachments", file2);
```

**Response:**

```json
{
  "success": true,
  "message": "Work log submitted successfully",
  "data": {
    "id": "uuid",
    "contract_id": "uuid",
    "type": "sprint_submission",
    "sprint_number": 1,
    "checklist": [...],
    "evidence": {
      "summary": "Sprint 1 deliverables",
      "attachments": [
        {
          "name": "sprint1-deliverable.pdf",
          "url": "https://signed-url",
          "path": "contract-uuid/worklog-123/file.pdf"
        }
      ]
    },
    "created_at": "2025-12-24T11:00:00Z"
  }
}
```

#### `GET /api/work-logs/contract/:contractId`

Get all work logs for a contract (Buyer/Expert/Admin)

#### `GET /api/work-logs/expert/my-logs`

Get current expert's work logs

#### `GET /api/work-logs/:workLogId`

Get work log details

---

## 🗄️ Supabase Storage Integration

### Buckets Created Automatically

- `work-logs`: Work log attachments and evidence
- `proposals`: Proposal-related documents
- `contracts`: Contract documents
- `projects`: Project files

### Bucket Configuration

```javascript
{
  public: false,  // Private, uses signed URLs
  fileSizeLimit: 52428800,  // 50MB
  allowedMimeTypes: [
    'image/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.*',
    'text/plain',
    'application/zip'
  ]
}
```

### File Upload Process

1. Files uploaded via multipart/form-data
2. Stored in Supabase Storage with organized folder structure
3. Signed URLs generated (1-year expiry)
4. URLs and paths stored in JSONB evidence field

---

## 🔒 Business Logic & Access Control

### NDA Gating (Critical Feature)

When expert has a **pending** contract for a project:

- Project details should be masked/hidden
- Full access granted only after NDA is signed (status = "active")

**Implementation Example:**

```javascript
// In projectController.js
const contract = await Contract.getPendingContractForExpertAndProject(
  expertId,
  projectId
);

if (contract && contract.status === "pending") {
  // Mask sensitive fields
  project.technical_specs = undefined;
  project.repo_links = undefined;
  project.attachments = undefined;
}
```

### Work Log Submission Rules

1. **Contract must be active** (NDA signed)
2. **Type must match engagement model**:
   - Daily → daily_log
   - Sprint → sprint_submission
   - Fixed → milestone_request
3. **24-hour limit** for daily logs
4. **Sprint submissions** require checklist and sprint_number
5. **Milestone requests** require evidence

### Contract Value Calculation

```javascript
// Automatic calculations:
- Daily: daily_rate × duration_days
- Sprint: sprint_rate × total_sprints
- Fixed: total_amount
```

---

## 🚀 Deployment Checklist

### Environment Variables Required

```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key
JWT_SECRET=your-jwt-secret
NODE_ENV=production
PORT=3000
```

### Server Startup

```bash
npm install
npm start
```

### Bucket Initialization

Buckets are automatically created on server startup. Check logs for:

```
Initializing Supabase Storage buckets...
✓ Bucket created: work-logs
✓ Bucket created: proposals
✓ Bucket created: contracts
✓ Bucket created: projects
Storage initialization complete.
```

---

## 📝 Example Workflows

### Complete Contract Flow

**1. Expert Creates Proposal**

```bash
POST /api/proposals
{
  "project_id": "proj-123",
  "engagement_model": "sprint",
  "rate": 2500,
  "duration_days": 56,
  "sprint_count": 4,
  "quote_amount": 10000
}
```

**2. Buyer Creates Contract**

```bash
POST /api/contracts
{
  "expert_id": "expert-123",
  "project_id": "proj-123",
  "engagement_model": "sprint",
  "payment_terms": {
    "sprint_rate": 2500,
    "sprint_duration_days": 14,
    "total_sprints": 4
  },
  "start_date": "2025-01-15"
}
# → Contract status: "pending"
```

**3. Expert Signs NDA**

```bash
POST /api/contracts/{id}/accept-and-sign-nda
{
  "signature_name": "John Doe"
}
# → Contract status: "active"
# → Project status: "active"
```

**4. Expert Submits Sprint Work Log**

```bash
POST /api/work-logs
FormData:
  - contract_id
  - type: "sprint_submission"
  - sprint_number: 1
  - checklist: [{task, status}]
  - attachments: files
```

---

## ✅ Implementation Status

| Feature               | Status               | Notes                            |
| --------------------- | -------------------- | -------------------------------- |
| Proposals CRUD        | ✅ Complete          | All engagement models supported  |
| Contracts with NDA    | ✅ Complete          | IP tracking, signature recording |
| Work Logs             | ✅ Complete          | Type-based validation            |
| File Uploads          | ✅ Complete          | Supabase Storage integration     |
| 24-Hour Rate Limiting | ✅ Complete          | For daily logs                   |
| NDA Gating            | ⚠️ Needs Integration | Add to project controller        |
| Access Control        | ✅ Complete          | Role-based permissions           |
| Validation            | ✅ Complete          | Model-specific rules             |

---

## 🎉 Ready to Use!

All API endpoints are now live and ready for testing. The system supports:

- ✅ Three engagement models (daily, sprint, fixed)
- ✅ Complete NDA workflow with audit trail
- ✅ File uploads with Supabase Storage
- ✅ Type-based work log validation
- ✅ Automatic bucket creation
- ✅ Role-based access control
- ✅ Comprehensive error handling

Start the server and begin testing with your frontend integration!
