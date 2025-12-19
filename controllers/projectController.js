import projectModel from '../models/projectModel.js';

export const getMyProjects = async (req, res) => {
  try {
    const userId = req.user.id; 
    const projects = await projectModel.getProjectsByClient(userId);
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

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
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
      client_id: req.user.id,
      domain: req.body.domain,
      trl_level: req.body.trlLevel, 
      risk_categories: req.body.riskCategories,
      expected_outcome: req.body.expectedOutcome,
      budget_min: req.body.budgetMin,
      budget_max: req.body.budgetMax,
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
    const updatedProject = await projectModel.update(id, req.body);
    
    if (!updatedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(200).json({ message: 'Project updated successfully', data: updatedProject });
  } catch (error) {
    console.error("UPDATE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await projectModel.delete(id);
    
    if (!result) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error("DELETE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add this at the bottom to fix the "default export" error
export default {
  getMyProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject
};