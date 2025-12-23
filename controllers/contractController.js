import Contract from '../models/contractModel.js';
import pool from '../config/db.js';

const updateProposalStatus = async (project_id, expert_id, status) => {
  await pool.query(
    'UPDATE proposals SET status = $1 WHERE project_id = $2 AND expert_id = $3',
    [status, project_id, expert_id]
  );
};

const updateProjectStatus = async (project_id, status) => {
  await pool.query(
    'UPDATE projects SET status = $1 WHERE id = $2',
    [status, project_id]
  );
};

export const createContract = async (req, res) => {
  try {
    const {
      project_id,
      expert_id,
      engagement_type = 'hourly',
      hourly_rate,
      weekly_hour_cap,
      start_date,
      end_date,
      ip_ownership
    } = req.body;

    const mapped_data = {
      project_id,
      expert_id,
      engagement_type,
      hourly_rate,
      weekly_hour_cap,
      start_date,
      end_date,
      ip_ownership,
      buyer_id: req.user.id
    };

    const contract = await Contract.createContract(mapped_data);

    if (project_id && expert_id) {
      await updateProposalStatus(project_id, expert_id, 'accepted');
    }

    if (project_id) {
      await updateProjectStatus(project_id, 'active');
    }

    res.status(201).json({ success: true, message: "Contract created successfully", data: contract });
  } catch (error) {
    console.error("CREATE CONTRACT ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getContractDetails = async (req, res) => {
  try {
    const contract = await Contract.getContractById(req.params.id);
    if (!contract) return res.status(404).json({ success: false, error: "Contract not found" });

    const response_data = {
      ...contract,
      expert: {
        id: contract.expert_id,
        first_name: contract.expert_first_name,
        last_name: contract.expert_last_name,
        email: contract.expert_email
      },
      project: {
        id: contract.project_id,
        title: contract.project_title,
        description: contract.project_description,
        domain: contract.project_domain
      }
    };

    res.status(200).json({ success: true, data: response_data });
  } catch (error) {
    console.error("GET CONTRACT ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getMyContracts = async (req, res) => {
  try {
    const role = req.user.role;
    const contracts = await Contract.getContractsByUser(req.user.id, role);

    const mapped_contracts = contracts.map(c => ({
      ...c,
      project: { title: c.project_title },
      expert: {
        first_name: c.expert_first_name,
        last_name: c.expert_last_name
      }
    }));

    res.status(200).json({ success: true, data: mapped_contracts });
  } catch (error) {
    console.error("GET MY CONTRACTS ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const acceptContract = async (req, res) => {
  try {
    const updated_contract = await Contract.updateContractStatus(req.params.id, 'active');
    res.status(200).json({ success: true, message: "Contract accepted", data: updated_contract });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const declineContract = async (req, res) => {
  try {
    const updated = await Contract.updateContractStatus(req.params.id, 'declined', req.body.reason);
    res.status(200).json({ success: true, message: "Contract declined", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const terminateContract = async (req, res) => {
  try {
    const updated = await Contract.updateContractStatus(req.params.id, 'terminated', req.body.reason);
    res.status(200).json({ success: true, message: "Contract terminated", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getInvoices = async (req, res) => {
  try {
    const invoices = await Contract.getInvoices(req.params.id);
    res.status(200).json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  createContract,
  getContractDetails,
  getMyContracts,
  acceptContract,
  declineContract,
  terminateContract,
  getInvoices
};