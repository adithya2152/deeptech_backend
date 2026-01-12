import projectModel from '../models/projectModel.js';

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
    const project = await projectModel.getById(id);
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

    const projectData = {
      title: req.body.title,
      description: req.body.description,
      buyer_profile_id: buyerProfileId,
      domain: req.body.domain,
      trl_level: req.body.trl_level,
      risk_categories: req.body.risk_categories,
      expected_outcome: req.body.expected_outcome,
      budget_min: req.body.budget_min,
      budget_max: req.body.budget_max,
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

    if (existingProject.status !== 'draft') {
      const keys = Object.keys(updates);
      const isOnlyStatusUpdate = keys.length === 1 && keys[0] === 'status';

      if (!isOnlyStatusUpdate) {
        return res.status(400).json({
          error: 'Live projects cannot be edited. Change status to Draft first to edit details.'
        });
      }
    }

    const updatedProject = await projectModel.update(id, updates);
    res.status(200).json({ message: 'Project updated successfully', data: updatedProject });
  } catch (error) {
    console.error("UPDATE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

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
    const projects = await projectModel.getMarketplaceProjects(buyerProfileId);
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
    const { amount, duration, cover_letter } = req.body;

    if (!amount || !duration || !cover_letter) {
      return res.status(400).json({ error: 'Amount, duration, and cover letter are required' });
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
      amount,
      duration,
      cover_letter
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