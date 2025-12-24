# Backend Requirements: DeepTech Contract & NDA Systems



## 2. API Endpoint Requirements

### POST `/proposals`

Experts need to send the model and rates.

**Payload:**
```json
{
  "project_id": "...",
  "engagement_model": "...",
  "rate": ...,
  "duration_days": ...,
  "sprint_count": ...,
  "message": "..."
}
```

---

### POST `/contracts` (Hire Expert)

Buyers initiate the offer.

**Payload:**
```json
{
  "expert_id": "...",
  "project_id": "...",
  "engagement_model": "...",
  "payment_terms": { ... },
  "start_date": "..."
}
```
- Initial State: `status` must be `pending`.
- `nda_signed_at` must be `null`.

---

### POST `/contracts/:id/accept-and-sign-nda`

Endpoint for Experts to activate the contract.

**Payload:**
```json
{
  "signature_name": "..."
}
```

**Logic:**
- Verify current user is the `expert_id` on the contract.
- Set `nda_signed_at = now()`.
- Set `nda_signature_name = payload.signature_name`.
- Update contract status to `active`.
- Trigger notification to Buyer.

---

## 3. Business Logic & Access Control

### NDA Gating (Critical)

- **GET `/projects/:id`**:  
  If the user is an Expert and has an associated contract in `pending` status, the response must omit or mask high-IP fields (e.g., technical specs, repo links, attachment URLs).

### Work Logs

- Experts cannot POST to `/work-logs` unless the contract status is `active`.

#### Work Log Validations

- **Daily Model**: Limit submissions to one per 24-hour period per contract.
- **Sprint Model**: Require `checklist` and `sprint_number` in the payload.
- **Fixed Model**: Require `milestone_id` and evidence of completion.

#### Automatic Calculations

- **Contract Value**:
  - **Daily**: `rate * duration_days`
  - **Sprint**: `rate * sprint_count`
  - **Fixed**: `total_amount`

---

## 4. Status Workflow

- **Pending**: Offer sent by Buyer. Expert can see general terms but no private project data.
- **Active**: Expert signs NDA. Full project access granted. Invoicing starts based on logs.
- **Completed**: Final milestone paid or sprint count reached.