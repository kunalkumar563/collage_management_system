const Subject = require('../models/subject');

const getSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({});
    res.status(200).json({ success: true, data: subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createSubject = async (req, res) => {
  try {
    const { subject, time, room, type, department, color } = req.body;
    
    if (!subject || !time || !room || !type || !department) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const newSubject = await Subject.create({ subject, time, room, type, department, color: color || '#6366F1' });
    res.status(201).json({ success: true, data: newSubject, message: 'Subject created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSubjects,
  createSubject
};
