const projectModel = require('../models/projectModel');

// GET: My Projects
exports.getMyProjects = async (req, res) => {
  try {
    const userId = req.user.id; // From Mock Auth
    const projects = await projectModel.getProjectsByUser(userId);
    res.status(200).json({ projects });
  } catch (error) {
    console.error("GET PROJECTS ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET: Single Project
exports.getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await projectModel.getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(200).json(project);
  } catch (error) {
    console.error("GET PROJECT ID ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST: Create Project
exports.createProject = async (req, res) => {
  try {
    const projectData = {
      ...req.body,
      client_id: req.user.id // From Mock Auth
    };
    const newProject = await projectModel.createProject(projectData);
    res.status(201).json(newProject);
  } catch (error) {
    console.error("CREATE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT: Update Project
exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProject = await projectModel.updateProject(id, req.body);
    
    if (!updatedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(200).json(updatedProject);
  } catch (error) {
    console.error("UPDATE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE: Delete Project
exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProject = await projectModel.deleteProject(id);
    
    if (!deletedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error("DELETE PROJECT ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
};