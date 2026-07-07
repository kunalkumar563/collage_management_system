const Student = require("../models/student");
const { sendWelcomeEmail } = require("../utils/emailService");

const DEPT_CODES = {
  'Computer Science': 'CS',
  'Business Admin':   'BA',
  'Engineering':      'EN',
  'Medical Sciences':'ME',
  'Arts & Humanities':'AH',
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function generateUniqueRollNo(department) {
  const prefix = `241${DEPT_CODES[department] || 'GN'}`;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${prefix}${String(Math.floor(1000 + Math.random() * 9000))}`;
    const existing  = await Student.findOne({ rollNo: candidate }).select('_id').lean();
    if (!existing) return candidate;
  }

  throw new Error('Unable to generate a unique roll number; please try again.');
}

async function generateUniqueAdmissionNo() {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `ADM-${year}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const existing  = await Student.findOne({ admissionNo: candidate }).select('_id').lean();
    if (!existing) return candidate;
  }

  throw new Error('Unable to generate a unique admission number; please try again.');
}

function getDuplicateField(error) {
  if (error.keyPattern) return Object.keys(error.keyPattern)[0];
  if (error.keyValue) return Object.keys(error.keyValue)[0];
  return 'field';
}

// Create Student
exports.createStudent = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (payload.rollNo !== undefined) {
      payload.rollNo = normalizeText(payload.rollNo);
      if (!payload.rollNo) delete payload.rollNo;
    }

    if (payload.email) {
      payload.email = normalizeText(payload.email).toLowerCase();
    }

    if (payload.admissionNo !== undefined) {
      payload.admissionNo = normalizeText(payload.admissionNo);
      if (!payload.admissionNo) delete payload.admissionNo;
    }

    if (!payload.admissionNo) {
      payload.admissionNo = await generateUniqueAdmissionNo();
    }

    if (!payload.rollNo) {
      payload.rollNo = await generateUniqueRollNo(payload.department || '');
    }

    const student = await Student.create(payload);

    if (payload.email) {
      const User = require('../models/user');
      const bcrypt = require('bcryptjs');
      const existingUser = await User.findOne({ email: payload.email });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash('Password@123', 10);
        await User.create({
          name: payload.name,
          email: payload.email,
          password: hashedPassword,
          role: 'student'
        });

        // Send Welcome Email asynchronously
        sendWelcomeEmail(payload.email, payload.name, 'student', 'Password@123');
      }
    }

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: student,
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = getDuplicateField(error);
      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get All Students — supports optional ?search= query param for server-side filtering
exports.getAllStudents = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search && search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      query = {
        $or: [
          { name:        rx },
          { rollNo:      rx },
          { admissionNo: rx },
          { email:       rx },
          { department:  rx },
          { semester:    rx },
          { section:     rx },
        ],
      };
    }

    const students = await Student.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Student By ID
// A student can only fetch their OWN record.
// Admin and faculty can fetch any record.
exports.getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Enforce profile-level authorization: students can only see their own record
    if (req.user.role === 'student' && req.user.email !== student.email) {
      return res.status(403).json({
        success: false,
        message: 'Students can only view their own profile',
      });
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update Student
exports.updateStudent = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (payload.rollNo !== undefined) {
      payload.rollNo = normalizeText(payload.rollNo);
      if (!payload.rollNo) delete payload.rollNo;
    }

    if (payload.email) {
      payload.email = normalizeText(payload.email).toLowerCase();
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      payload,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];

      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete Student
exports.deleteStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};