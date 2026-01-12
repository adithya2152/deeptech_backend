import pool from "../config/db.js";

const Invoice = {
  // Create a new invoice
  create: async (data) => {
    const {
      contract_id,
      expert_profile_id,
      buyer_profile_id,
      amount,
      total_hours,
      status = "pending",
      invoice_type,
      week_start_date,
      week_end_date,
      source_type,
      source_id,
    } = data;

    const query = `
      INSERT INTO invoices (
        contract_id,
        expert_profile_id,
        buyer_profile_id,
        amount,
        total_hours,
        status,
        invoice_type,
        week_start_date,
        week_end_date,
        source_type,
        source_id,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *;
    `;

    const values = [
      contract_id,
      expert_profile_id,
      buyer_profile_id,
      amount,
      total_hours || 0,
      status,
      invoice_type,
      week_start_date || null,
      week_end_date || null,
      source_type || null,
      source_id || null,
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  // Get invoice by ID
  getById: async (id) => {
    const query = `SELECT * FROM invoices WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  },

  // Get invoices by contract ID
  getByContractId: async (contract_id) => {
    const query = `
      SELECT * FROM invoices 
      WHERE contract_id = $1 
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [contract_id]);
    return rows;
  },

  // Mark invoice as paid and return updated invoice
  payInvoice: async (invoice_id) => {
    const query = `
      UPDATE invoices 
      SET 
        status = 'paid',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [invoice_id]);
    return rows[0];
  },

  // Check if invoice already exists for a source
  findBySource: async (source_type, source_id) => {
    const query = `
      SELECT * FROM invoices 
      WHERE source_type = $1 AND source_id = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [source_type, source_id]);
    return rows[0];
  },

  // Create invoice from approved daily log
  createFromDailyLog: async (
    dailySummaryId,
    contractId,
    expertProfileId,
    buyerProfileId,
    paymentTerms,
    workDate,
    totalHours
  ) => {
    // Check if invoice already exists for this daily summary
    const existing = await Invoice.findBySource(
      "day_work_summary",
      dailySummaryId
    );
    if (existing) {
      console.log(
        `Invoice already exists for day_work_summary ${dailySummaryId}`
      );
      return existing;
    }

    // Calculate week range using the SQL functions
    const weekQuery = `
      SELECT 
        get_week_start($1::DATE) as week_start,
        get_week_end($1::DATE) as week_end
    `;
    const { rows: weekRows } = await pool.query(weekQuery, [workDate]);
    const { week_start, week_end } = weekRows[0];

    // Get rate from payment terms
    const rate = paymentTerms.daily_rate || paymentTerms.rate || 0;

    return await Invoice.create({
      contract_id: contractId,
      expert_profile_id: expertProfileId,
      buyer_profile_id: buyerProfileId,
      amount: rate,
      total_hours: totalHours || 0,
      status: "pending",
      invoice_type: "periodic",
      week_start_date: week_start,
      week_end_date: week_end,
      source_type: "day_work_summary",
      source_id: dailySummaryId,
    });
  },

  // Create invoice from finished sprint
  createFromSprint: async (
    contractId,
    expertProfileId,
    buyerProfileId,
    paymentTerms,
    sprintNumber
  ) => {
    // Check if invoice already exists for this sprint
    // Use plain contractId (uuid) as source_id
    const sourceId = contractId;
    const sourceType = `sprint_${sprintNumber}`;

    const existing = await Invoice.findBySource(sourceType, sourceId);
    if (existing) {
      console.log(
        `Invoice already exists for sprint ${sprintNumber} of contract ${contractId}`
      );
      return existing;
    }

    const rate = paymentTerms.sprint_rate || 0;

    return await Invoice.create({
      contract_id: contractId,
      expert_profile_id: expertProfileId,
      buyer_profile_id: buyerProfileId,
      amount: rate,
      total_hours: 0,
      status: "pending",
      invoice_type: "sprint",
      week_start_date: null,
      week_end_date: null,
      source_type: sourceType,
      source_id: sourceId,
    });
  },

  // Create invoice from milestone approval
  createFromMilestone: async (
    contractId,
    expertProfileId,
    buyerProfileId,
    milestoneAmount,
    milestoneId
  ) => {
    // Check if invoice already exists for this milestone
    const existing = await Invoice.findBySource("milestone", milestoneId);
    if (existing) {
      console.log(`Invoice already exists for milestone ${milestoneId}`);
      return existing;
    }

    return await Invoice.create({
      contract_id: contractId,
      expert_profile_id: expertProfileId,
      buyer_profile_id: buyerProfileId,
      amount: milestoneAmount,
      total_hours: 0,
      status: "pending",
      invoice_type: "milestone",
      week_start_date: null,
      week_end_date: null,
      source_type: "milestone",
      source_id: milestoneId,
    });
  },

  // Create final fixed invoice when contract completes
  createFinalFixed: async (contractData) => {
    const { contractId, expertProfileId, buyerProfileId, paymentTerms } = contractData;

    const sourceId = contractId;
    const existing = await Invoice.findBySource("final_fixed", sourceId);
    if (existing) {
      console.log(`Final fixed invoice already exists for contract ${contractId}`);
      return existing;
    }

    const contractResult = await pool.query('SELECT total_amount FROM contracts WHERE id = $1', [contractId]);
    const totalContractAmount = contractResult.rows[0]?.total_amount || paymentTerms.total_amount || 0;

    const previousInvoices = await Invoice.getByContractId(contractId);
    const totalBilledBefore = previousInvoices
      .filter(inv => inv.status !== 'void' && inv.source_type !== 'final_fixed')
      .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

    const finalAmount = Math.max(totalContractAmount - totalBilledBefore, 0);

    return await Invoice.create({
      contract_id: contractId,
      expert_profile_id: expertProfileId,
      buyer_profile_id: buyerProfileId,
      amount: finalAmount,
      total_hours: 0,
      status: "pending",
      invoice_type: "final_fixed",
      week_start_date: null,
      week_end_date: null,
      source_type: "final_fixed",
      source_id: sourceId,
    });
  },

};

export default Invoice;