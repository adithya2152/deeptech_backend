# Epic 7 – Backend Requirements (Contracts, Invoices, Escrow)

Goal: Extend the existing contracts, work‑logs, and invoices backend so that invoices are generated automatically and escrow balances are tracked and surfaced to the contract workspace UI.

The frontend for Epic 7 is already wired and expects the behavior described below.

---

## 1. Automatic Invoice Generation

### 1.1 General behavior

**Concept**

- Invoices belong to a **contract** and represent **billable work**:
  - Approved daily logs (daily model)
  - Completed sprints (sprint model)
  - Approved milestones (fixed model, later)

**Requirements**

- Every created invoice MUST:
  - Insert a row into `invoices` with:
    - `id` (uuid, default)
    - `contract_id`
    - `expert_id`
    - `buyer_id`
    - `amount` (money for this invoice)
    - `total_hours`
    - `status`
    - `invoice_type`
    - `week_start_date`
    - `week_end_date`
    - `created_at`
  - Start with `status = 'pending'`.
  - Use `invoice_type` ∈ `('periodic', 'sprint', 'milestone')`.

The existing `invoices` table already contains these columns with appropriate checks; only the logic needs to be added.

---

### 1.2 Daily Model – Invoices on Log Approval

**Trigger**

- When the **buyer approves a daily work log**.

**Conditions**

- `contract.engagement_model = 'daily'`
- The approved work log has `type = 'daily_log'`.
- Work log status transitions to `approved`.

**Behavior**

1. After marking the work log as `approved`, create an invoice:
   - `contract_id` = the log’s `contract_id`
   - `expert_id` = contract’s `expert_id`
   - `buyer_id` = contract’s `buyer_id`
   - `amount`:
     - Prefer `contract.payment_terms.daily_rate`
     - Fallback to `contract.payment_terms.rate` if needed
   - `total_hours`:
     - Use `work_log.hours_worked` if available
     - Otherwise `0` for now
   - `status = 'pending'`
   - `invoice_type = 'periodic'`
   - `week_start_date` / `week_end_date`:
     - Derive from `log_date`:
       - `week_start_date` = Monday of that week
       - `week_end_date` = Sunday of that week

2. Do **not** change `contracts.total_amount` or `escrow_balance` here; those are updated when the invoice is paid (see section 2.3).

---

### 1.3 Sprint Model – Invoices on Finish Sprint

**Trigger**

- When the buyer finishes a sprint via the existing `finish sprint` endpoint (currently called from `POST /work-logs/:contractId/finish-sprint`).

**Conditions**

- `contract.engagement_model = 'sprint'`
- Contract status is `active`.
- `payment_terms.current_sprint_number` is set.

**Behavior**

1. After:
   - Marking the current sprint as finished, and
   - Advancing `payment_terms.current_sprint_number` to the next sprint,
2. Insert an invoice:
   - `amount = contract.payment_terms.sprint_rate`
   - `total_hours = 0` (for now)
   - `status = 'pending'`
   - `invoice_type = 'sprint'`
   - `week_start_date` / `week_end_date`:
     - Optional; can be left NULL or filled using the sprint’s date range if available.

---

### 1.4 Fixed Model – Milestone Invoices (Later, Optional Now)

**Trigger**

- When a **milestone** is approved by the buyer (for now, this can be tied to a `milestone_request` work log).

**Behavior**

1. Identify the milestone in `contract.payment_terms.milestones[]` using `milestone_id` or similar.
2. Insert an invoice:
   - `amount = milestone.amount`
   - `invoice_type = 'milestone'`
   - `status = 'pending'`
3. Update the milestone state:
   - `milestone.status = 'completed'` on invoice creation.
   - Optionally move to `paid` once the invoice is actually paid.

This can be implemented after daily & sprint invoices are done.



---

### 1.5 Complete contract 

**Route**

- `POST /contracts/:id/complete`

**Controller**

- New handler in contracts controller: `completeContract(req, res)`.

**Behavior**

- Auth: buyer or admin only.
- Validate contract exists.
- Validate status allows completion (e.g. `active`).
- Set `contracts.status = 'completed'`.
- If `engagement_model === 'fixed'`:
  - Call `Invoice.createFinalFixed({ contractId: id })` as specified in section 2.3.
- Return updated contract.

**Notes**

- This endpoint replaces any ad‑hoc “mark contract complete” logic on the frontend; the FE will later call it via a `useCompleteContract` hook.

## 2. Escrow Wallet Logic

The frontend already reads `contracts.total_amount` and `contracts.escrow_balance` to populate the **Escrow & Payments** card.

### 2.1 Contract Fields

Use or add these fields on `contracts`:

- `total_amount` – interpreted as **total amount paid to expert so far** (or introduce a new `total_paid` field and adjust the UI later).
- `escrow_balance` – amount currently funded in escrow and not yet released.

Optional additional fields (if desired):

- `escrow_funded_total` – cumulative funded escrow over time.
- `released_total` – cumulative released amount.

---

### 2.2 Funding Escrow

Add an endpoint to simulate funding (no real payment integration yet):

**Endpoint**

- `POST /contracts/:contractId/fund`

**Request**

{
"amount": 1000
}


**Auth / Permissions**

- Only the **buyer** on that contract or an **admin** may fund escrow.

**Behavior**

1. Validate `amount > 0`.
2. Load contract; verify:
   - Contract exists.
   - `contract.buyer_id === req.user.id` (unless admin).
3. Update contract:
   - `escrow_balance = escrow_balance + amount`
   - If `escrow_funded_total` exists:
     - `escrow_funded_total = escrow_funded_total + amount`
4. Return the updated contract row (same shape as other contract queries).

---

### 2.3 Releasing Escrow on Invoice Payment

Add a way to mark invoices as paid and adjust escrow + totals.

**Endpoint**

- `PATCH /invoices/:invoiceId/pay`

**Auth**

- Buyer on the associated contract or admin.

**Behavior**

1. Load invoice and its contract.
2. Validate:
   - If `invoice.status !== 'pending'` → respond 400 `"Invoice is not in pending status"`.
3. Update invoice:
   - `status = 'paid'`
   - `updated_at = NOW()`
4. Update contract to reflect payment:
   - If treating `total_amount` as “total paid so far”:
     - `total_amount = total_amount + invoice.amount`
   - Adjust escrow:
     - `escrow_balance = GREATEST(escrow_balance - invoice.amount, 0)`
   - If `released_total` exists:
     - `released_total = released_total + invoice.amount`
5. Return updated invoice and/or updated contract (your choice; frontend currently only needs updated contract via the existing `GET /contracts/:id` call).

**Notes**

- Do not silently ignore failures; if invoice update succeeds but contract update fails, log and return 500 so we don’t hide inconsistent state.
- Frontend will re‑fetch `contract` and `invoices` after this action, so no new fields are needed in the UI.

---

## 3. Access Control & Existing Endpoints

- All new behavior must respect current access rules:
  - Contracts:
    - Buyer, expert on the contract, or admin.
  - Invoices:
    - Buyer, expert on the contract, or admin.
- Existing endpoints used by frontend (already implemented and working):
  - `GET /contracts/:contractId` – uses `getContractWithDetails`.
  - `GET /contracts/:contractId/invoices` – returns invoices for that contract.
  - `POST /contracts/:contractId/accept-and-sign-nda` – activates contract and sets project `status = 'active'`.
  - Work logs:
    - Create, approve, reject, finish sprint.

The new logic should be wired into the existing approval / finish‑sprint flows, not through separate manual triggers, so invoices and escrow stay consistent with work execution.

---

---

## 4. Implementation Notes (Optional but Recommended)

- **Idempotent invoice creation**  
  When creating an invoice from a work log / sprint / milestone, ensure the operation is idempotent (e.g., check if an invoice already exists for that source record and skip creating a duplicate).

- **Timezone for week ranges**  
  When deriving `week_start_date` and `week_end_date` from `log_date`, use UTC dates with the week starting on Monday.

- **Escrow underfunding behavior**  
  For now, allow paying an invoice even if `escrow_balance < invoice.amount`, and clamp with  
  `escrow_balance = GREATEST(escrow_balance - invoice.amount, 0)`.  
  (If we later want strict behavior, we can change this to reject with 400.)


## 5. Summary

Implement the following:

1. **Automatic invoices**
   - On daily log approval (daily model → periodic invoice).
   - On sprint finish (sprint model → sprint invoice).
   - Optionally, on milestone approval (fixed model → milestone invoice).

2. **Escrow operations**
   - `POST /contracts/:id/fund` to increase `escrow_balance`.
   - `PATCH /invoices/:id/pay` to:
     - Mark invoice `paid`.
     - Decrease `escrow_balance`.
     - Increase `total_amount` (or a dedicated `total_paid`).

3. Ensure the updated contract and invoice data is visible via:
   - `GET /contracts/:id`
   - `GET /contracts/:id/invoices`

Frontend is already prepared to consume `total_amount`, `escrow_balance`, and invoice rows; once this logic is in place, the Epic 7 contract workspace will show real invoices and escrow numbers without further UI changes.

