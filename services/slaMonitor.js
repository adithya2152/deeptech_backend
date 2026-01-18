import pool from '../config/db.js';
import { sendEmail } from './mailer.js';

const ensureAlertTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sla_alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type text NOT NULL CHECK (entity_type IN ('dispute', 'report')),
      entity_id uuid NOT NULL,
      alerted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(entity_type, entity_id)
    )
  `);
};

const getAdminEmails = async () => {
  const { rows } = await pool.query(
    `SELECT email FROM user_accounts WHERE role = 'admin' AND is_banned = false AND email IS NOT NULL`
  );
  return rows.map((r) => r.email).filter(Boolean);
};

const fetchOverdueDisputes = async (hours) => {
  const { rows } = await pool.query(
    `
    SELECT d.id, d.contract_id, d.created_at
    FROM disputes d
    LEFT JOIN admin_sla_alerts a ON a.entity_type = 'dispute' AND a.entity_id = d.id
    WHERE d.status IN ('open', 'in_review')
      AND d.created_at < now() - ($1::text || ' hours')::interval
      AND a.id IS NULL
    ORDER BY d.created_at ASC
    LIMIT 50
    `,
    [String(hours)]
  );
  return rows;
};

const fetchOverdueReports = async (hours) => {
  const { rows } = await pool.query(
    `
    SELECT r.id, r.type, r.created_at
    FROM reports r
    LEFT JOIN admin_sla_alerts a ON a.entity_type = 'report' AND a.entity_id = r.id
    WHERE r.status = 'pending'
      AND r.created_at < now() - ($1::text || ' hours')::interval
      AND a.id IS NULL
    ORDER BY r.created_at ASC
    LIMIT 50
    `,
    [String(hours)]
  );
  return rows;
};

const markAlerted = async (entityType, entityIds) => {
  if (!entityIds.length) return;

  const values = entityIds
    .map((_, i) => `($1, $${i + 2})`)
    .join(',');

  await pool.query(
    `INSERT INTO admin_sla_alerts (entity_type, entity_id)
     VALUES ${values}
     ON CONFLICT (entity_type, entity_id) DO NOTHING`,
    [entityType, ...entityIds]
  );
};

const buildEmail = ({ disputes, reports, hours }) => {
  const subject = `Admin SLA alert: pending items > ${hours}h`;

  const lines = [
    `There are pending items requiring admin review older than ${hours} hours.`,
    '',
    `Disputes: ${disputes.length}`,
    ...disputes.map((d) => `- Dispute ${d.id} (contract ${d.contract_id}) created ${new Date(d.created_at).toISOString()}`),
    '',
    `Reports: ${reports.length}`,
    ...reports.map((r) => `- Report ${r.id} (type ${r.type}) created ${new Date(r.created_at).toISOString()}`),
    '',
    'Please review them in the admin panel.',
  ];

  return { subject, text: lines.join('\n') };
};

export const startSlaMonitor = ({ intervalMs = 15 * 60 * 1000, thresholdHours = 8 } = {}) => {
  let started = false;

  const runOnce = async () => {
    try {
      await ensureAlertTable();

      const [disputes, reports] = await Promise.all([
        fetchOverdueDisputes(thresholdHours),
        fetchOverdueReports(thresholdHours),
      ]);

      if (disputes.length === 0 && reports.length === 0) return;

      const adminEmails = await getAdminEmails();
      if (adminEmails.length === 0) {
        console.warn('[slaMonitor] No admin emails found; cannot notify.');
        return;
      }

      const { subject, text } = buildEmail({ disputes, reports, hours: thresholdHours });

      // Mark as alerted first to prevent repeated sends if SMTP is misconfigured.
      await markAlerted('dispute', disputes.map((d) => d.id));
      await markAlerted('report', reports.map((r) => r.id));

      // Send as a single email to admins.
      await sendEmail({
        to: adminEmails.join(','),
        subject,
        text,
      });

      console.log(`[slaMonitor] Sent SLA alert: disputes=${disputes.length}, reports=${reports.length}`);
    } catch (err) {
      console.error('[slaMonitor] Error:', err);
    }
  };

  const start = async () => {
    if (started) return;
    started = true;

    // initial run shortly after startup
    setTimeout(() => runOnce(), 10_000);
    setInterval(() => runOnce(), intervalMs);

    console.log(`[slaMonitor] Started: thresholdHours=${thresholdHours}, intervalMs=${intervalMs}`);
  };

  start();
};
