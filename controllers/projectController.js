import projectModel from '../models/projectModel.js';

const parseBudgetNumber = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const validateBudgetRange = (minVal, maxVal) => {
  const min = parseBudgetNumber(minVal);
  const max = parseBudgetNumber(maxVal);
  if (min < 0 || max < 0) return { ok: false, message: 'Budget must be a positive number.' };
  if (min && max && max < min) return { ok: false, message: 'Max budget cannot be less than min budget.' };
  return { ok: true, min, max };
};

export const getMyProjects = async (req, res) => {
  try {
    const profileId = req.user.profileId;
    const role = req.user.role;
    const status = req.query.status;

    const projects = await projectModel.getProjectsByClient(profileId, role, status);
    res.status(200).json({ data: projects });
  } catch (error) {
    console.error("GET PROJECTS ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerExpertProfileId = req.user?.role === 'expert' ? req.user.profileId : null;
    const project = await projectModel.getById(id, viewerExpertProfileId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.status(200).json({ data: project });
  } catch (error) {
    console.error("GET PROJECT ID ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const createProject = async (req, res) => {
  try {
    const buyerProfileId = req.user.profileId;

    const budgetCheck = validateBudgetRange(req.body.budget_min, req.body.budget_max);
    if (!budgetCheck.ok) {
      return res.status(400).json({ error: budgetCheck.message });
    }

    const projectData = {
      title: req.body.title,
      description: req.body.description,
      buyer_profile_id: buyerProfileId,
      domain: req.body.domain,
      trl_level: req.body.trl_level,
      risk_categories: req.body.risk_categories,
      expected_outcome: req.body.expected_outcome,
      budget_min: budgetCheck.min,
      budget_max: budgetCheck.max,
      deadline: req.body.deadline
    };
    const newProject = await projectModel.create(projectData);
    res.status(201).json({ message: 'Project created successfully', data: newProject });
  } catch (error) {
    console.error("CREATE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const profileId = req.user.profileId;
    const updates = req.body;

    const existingProject = await projectModel.getById(id);
    if (!existingProject) return res.status(404).json({ error: 'Project not found' });

    // Check ownership using buyer_profile_id
    const ownerProfileId = existingProject.buyer?.id || existingProject.buyer_profile_id;
    if (ownerProfileId !== profileId) return res.status(403).json({ error: 'Unauthorized' });

    // If status change is requested, validate the transition
    if (updates.status && updates.status !== existingProject.status) {
      const validation = await validateStatusTransition(
        id,
        existingProject.status,
        updates.status
      );

      if (!validation.allowed) {
        return res.status(400).json({
          error: validation.reason,
          currentStatus: existingProject.status,
          requestedStatus: updates.status
        });
      }
    }

    // For non-draft projects, only allow status changes (no other field edits)
    if (existingProject.status !== 'draft') {
      const keys = Object.keys(updates);
      const isOnlyStatusUpdate = keys.length === 1 && keys[0] === 'status';

      if (!isOnlyStatusUpdate) {
        return res.status(400).json({
          error: 'Live projects cannot be edited. Change status to Draft first to edit details.'
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'budget_min') || Object.prototype.hasOwnProperty.call(updates, 'budget_max')) {
      const budgetCheck = validateBudgetRange(updates.budget_min, updates.budget_max);
      if (!budgetCheck.ok) {
        return res.status(400).json({ error: budgetCheck.message });
      }
      updates.budget_min = budgetCheck.min;
      updates.budget_max = budgetCheck.max;
    }

    const updatedProject = await projectModel.update(id, updates);
    res.status(200).json({ message: 'Project updated successfully', data: updatedProject });
  } catch (error) {
    console.error("UPDATE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Validate project status transitions based on business rules
 * 
 * Status Flow:
 * - draft → open (publish to marketplace)
 * - open → draft (only if NO proposals)
 * - open → closed (close to new proposals)
 * - open → active (auto: when contract is created)
 * - closed → open (reopen for proposals)
 * - closed → archived (archive the project)
 * - active → completed (only when all contracts are complete)
 * - active → paused (pause work)
 * - paused → active (resume)
 * - completed → (final state)
 * - archived → (final state)
 */
async function validateStatusTransition(projectId, currentStatus, newStatus) {
  // Import pool for querying
  const pool = (await import('../config/db.js')).default;

  // Define allowed transitions for each status
  const allowedTransitions = {
    draft: ['open', 'archived'],
    open: ['draft', 'closed', 'active', 'archived'],
    closed: ['open', 'archived'],
    active: ['completed', 'paused'],
    paused: ['active', 'closed'],
    completed: [], // Final state
    archived: [], // Final state
  };

  // Check if transition is in allowed list
  const allowed = allowedTransitions[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    return {
      allowed: false,
      reason: `Cannot change status from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowed.length ? allowed.join(', ') : 'none (final state)'}`
    };
  }

  // Special rules based on business logic

  // 1. open → draft: Only allowed if NO proposals exist
  if (currentStatus === 'open' && newStatus === 'draft') {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as count FROM proposals WHERE project_id = $1',
      [projectId]
    );
    const proposalCount = parseInt(rows[0].count, 10);

    if (proposalCount > 0) {
      return {
        allowed: false,
        reason: `Cannot revert to draft: ${proposalCount} proposal(s) have been submitted. Close the project instead.`
      };
    }
  }

  // 2. open → archived: Only allowed if NO proposals AND NO contracts
  if (currentStatus === 'open' && newStatus === 'archived') {
    const { rows: proposalRows } = await pool.query(
      'SELECT COUNT(*) as count FROM proposals WHERE project_id = $1',
      [projectId]
    );
    const proposalCount = parseInt(proposalRows[0].count, 10);

    if (proposalCount > 0) {
      return {
        allowed: false,
        reason: `Cannot archive: ${proposalCount} proposal(s) exist. Close the project first.`
      };
    }
  }

  // 3. * → active: Should only happen automatically when contract is created
  //    (This is a soft check - we allow it but it's typically system-triggered)
  if (newStatus === 'active' && currentStatus !== 'paused') {
    // Check if there's at least one active/pending contract
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM contracts 
       WHERE project_id = $1 AND status IN ('pending', 'active')`,
      [projectId]
    );
    const contractCount = parseInt(rows[0].count, 10);

    if (contractCount === 0) {
      return {
        allowed: false,
        reason: 'Cannot set to active: No pending or active contracts exist for this project.'
      };
    }
  }

  // 4. active → completed: Only if all contracts are completed
  if (currentStatus === 'active' && newStatus === 'completed') {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as pending FROM contracts 
       WHERE project_id = $1 AND status IN ('pending', 'active', 'paused')`,
      [projectId]
    );
    const pendingContracts = parseInt(rows[0].pending, 10);

    if (pendingContracts > 0) {
      return {
        allowed: false,
        reason: `Cannot complete: ${pendingContracts} contract(s) are still active or pending.`
      };
    }
  }

  return { allowed: true };
}

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const profileId = req.user.profileId;

    const existingProject = await projectModel.getById(id);
    if (!existingProject) return res.status(404).json({ error: 'Project not found' });

    // Check ownership using buyer_profile_id
    const ownerProfileId = existingProject.buyer?.id || existingProject.buyer_profile_id;
    if (ownerProfileId !== profileId) return res.status(403).json({ error: 'Unauthorized' });

    await projectModel.delete(id);
    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error("DELETE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMarketplaceProjects = async (req, res) => {
  try {
    const buyerProfileId = req.query.buyer_profile_id || req.query.buyerProfileId;
    const viewerExpertProfileId = req.user?.role === 'expert' ? req.user.profileId : null;
    const projects = await projectModel.getMarketplaceProjects(buyerProfileId, viewerExpertProfileId);
    res.status(200).json({ data: projects });
  } catch (error) {
    console.error("MARKETPLACE ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getProjectProposals = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const profileId = req.user.profileId;

    const project = await projectModel.getById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check ownership using buyer_profile_id
    const ownerProfileId = project.buyer?.id || project.buyer_profile_id;
    if (ownerProfileId !== profileId) return res.status(403).json({ error: 'Unauthorized' });

    const proposals = await projectModel.getProjectProposals(projectId);
    res.status(200).json({ data: proposals });
  } catch (error) {
    console.error("GET PROPOSALS ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const submitProposal = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const expertProfileId = req.user.profileId;

    // Accept both old field names (amount, duration, cover_letter) 
    // and new field names (rate, quote_amount, message, duration_days)
    const {
      amount, duration, cover_letter,  // old names
      rate, quote_amount, message, duration_days, // new names
      engagement_model, sprint_count, estimated_hours // engagement model fields
    } = req.body;

    // Use new names with fallback to old names
    const finalRate = rate || amount;
    const finalDuration = duration_days || duration;
    const finalMessage = message || cover_letter;
    const finalQuoteAmount = quote_amount || amount;

    if (!finalRate || !finalDuration || !finalMessage) {
      return res.status(400).json({ error: 'Rate/amount, duration, and message/cover letter are required' });
    }

    if (req.user.role !== 'expert') {
      return res.status(403).json({ error: 'Only experts can submit proposals' });
    }

    const project = await projectModel.getById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check if expert is trying to submit to their own project
    const projectBuyerProfileId = project.buyer?.id || project.buyer_profile_id;
    if (projectBuyerProfileId === expertProfileId) {
      return res.status(400).json({
        error: 'You cannot submit a proposal on your own project'
      });
    }

    const proposal = await projectModel.createProposal(projectId, expertProfileId, {
      amount: finalQuoteAmount,
      duration: finalDuration,
      cover_letter: finalMessage,
      engagement_model: engagement_model || 'fixed',
      rate: finalRate,
      sprint_count,
      estimated_hours
    });

    res.status(201).json({
      message: 'Proposal submitted successfully',
      data: proposal
    });

  } catch (error) {
    console.error('SUBMIT PROPOSAL ERROR:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export default {
  getMyProjects,
  getMarketplaceProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectProposals,
  submitProposal
};