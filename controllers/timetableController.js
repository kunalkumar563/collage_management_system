const Timetable = require("../models/timetable");
const Student = require("../models/student");
const Faculty = require("../models/Faculty");

// GET /api/timetable
const getTimetable = async (req, res) => {
  try {
    let query = {};
    
    // Role based filtering
    if (req.user.role === 'faculty') {
      const facultyRecord = await Faculty.findOne({ email: req.user.email });
      if (facultyRecord) {
        query.facultyId = facultyRecord._id;
      } else {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
    } else if (req.user.role === 'student') {
      const studentRecord = await Student.findOne({ email: req.user.email });
      if (studentRecord) {
        query.department = studentRecord.department;
        query.semester = studentRecord.semester;
      } else {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
    }

    const schedule = await Timetable.find(query)
      .populate('courseId', 'courseCode name')
      .populate('facultyId', 'name email');
      
    res.status(200).json({ success: true, count: schedule.length, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/timetable
const createTimetableEntry = async (req, res) => {
  try {
    const { department, semester, day, startTime, endTime, courseId, facultyId, room } = req.body;
    if (!department || !semester || !day || !startTime || !endTime || !courseId || !facultyId || !room) {
      return res.status(400).json({ success: false, message: "Please provide all required fields" });
    }

    const entry = await Timetable.create(req.body);

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/timetable/:id
const deleteTimetableEntry = async (req, res) => {
  try {
    const entry = await Timetable.findByIdAndDelete(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Schedule entry not found' });
    }
    res.status(200).json({ success: true, message: 'Schedule entry deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getTimetable,
  createTimetableEntry,
  deleteTimetableEntry
};
