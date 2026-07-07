const Faculty = require("../models/Faculty");
const { sendWelcomeEmail } = require("../utils/emailService");

// Create Faculty
const createFaculty = async (req, res) => {
  try {
    const faculty = await Faculty.create(req.body);

    if (req.body.email) {
      const User = require('../models/user');
      const bcrypt = require('bcryptjs');
      const existingUser = await User.findOne({ email: req.body.email });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash('Password@123', 10);
        await User.create({
          name: req.body.name,
          email: req.body.email,
          password: hashedPassword,
          role: 'faculty'
        });

        // Send Welcome Email asynchronously
        sendWelcomeEmail(req.body.email, req.body.name, 'faculty', 'Password@123');
      }
    }

    res.status(201).json({
      success: true,
      message: "Faculty created successfully",
      data: faculty,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get All Faculty
const getAllFaculty = async (req, res) => {
  try {
    const faculty = await Faculty.find();

    res.status(200).json({
      success: true,
      count: faculty.length,
      data: faculty,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Faculty By ID
const getFacultyById = async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    res.status(200).json({
      success: true,
      data: faculty,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update Faculty
const updateFaculty = async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Faculty updated successfully",
      data: faculty,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete Faculty
const deleteFaculty = async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndDelete(req.params.id);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Faculty deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Export All Controllers
module.exports = {
  createFaculty,
  getAllFaculty,
  getFacultyById,
  updateFaculty,
  deleteFaculty,
};