const projectModel = require('../models/projectModel');

exports.createProject = async (req, res) => {
  try {
    const { title, clientId, description } = req.body;

    if (!title || !clientId) {
      return res.status(400).json({ error: "Title and Client ID are required" });
    }

    const newProject = await projectModel.createProject(req.body);

    res.status(201).json({ 
      message: "Project created successfully", 
      data: newProject 
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error" });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProject = await projectModel.updateProject(id, req.body);

    if (!updatedProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.status(200).json({ 
      message: "Project updated successfully", 
      data: updatedProject 
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error" });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProject = await projectModel.deleteProject(id);

    if (!deletedProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.status(200).json({ 
      message: "Project deleted successfully",
      data: deletedProject
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Server error" });
  }
};