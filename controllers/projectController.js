import projectModel from '../models/projectModel.js';

export const getMyProjects = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const status = req.query.status; 
    
    const projects = await projectModel.getProjectsByClient(userId, role, status);
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
    const projectData = {
      title: req.body.title,
      description: req.body.description,
      buyer_id: req.user.id, 
      domain: req.body.domain,
      trl_level: req.body.trl_level, 
      risk_categories: req.body.risk_categories,
      expected_outcome: req.body.expected_outcome,
      budget_min: req.body.budget_min,
      budget_max: req.body.budge_max,
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
    const userId = req.user.id;
    const updates = req.body;

    const existingProject = await projectModel.getById(id);
    if (!existingProject) return res.status(404).json({ error: 'Project not found' });
    
    const ownerId = existingProject.buyer?.id || existingProject.buyer_id;
    if (ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

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
    const userId = req.user.id;

    const existingProject = await projectModel.getById(id);
    if (!existingProject) return res.status(404).json({ error: 'Project not found' });
    
    const ownerId = existingProject.buyer?.id || existingProject.buyer_id;
    if (ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

    await projectModel.delete(id);
    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error("DELETE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMarketplaceProjects = async (req, res) => {
  try {
    const projects = await projectModel.getMarketplaceProjects();
    res.status(200).json({ data: projects });
  } catch (error) {
    console.error("MARKETPLACE ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getProjectProposals = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.id;

    const project = await projectModel.getById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    const ownerId = project.buyer?.id || project.buyer_id;
    if (ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

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
    const expertId = req.user.id;
    const { amount, duration, cover_letter } = req.body;

    if (!amount || !duration || !cover_letter) {
      return res.status(400).json({ error: 'Amount, duration, and cover letter are required' });
    }

    if (req.user.role !== 'expert') {
        return res.status(403).json({ error: 'Only experts can submit proposals' });
    }

    const proposal = await projectModel.createProposal(projectId, expertId, {
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

export const finishSprint = async (req, res) => {
  try {
    const { contractId } = req.params;

    const contract = await Contract.getById(contractId);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found' });
    }

    if (contract.engagement_model !== 'sprint') {
      return res.status(400).json({ success: false, message: 'Not a sprint contract' });
    }

    const currentSprint = contract.payment_terms.current_sprint_number || 1;

    const updated = await Contract.updatePaymentTerms(contractId, {
      ...contract.payment_terms,
      current_sprint_number: currentSprint + 1,
      sprint_start_date: new Date().toISOString(),
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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