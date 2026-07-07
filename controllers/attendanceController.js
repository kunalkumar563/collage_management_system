const Attendance = require("../models/attendance");
const Student = require("../models/student");
const Faculty = require("../models/Faculty");
const Course = require("../models/course");

// Get Attendance Data (Role Based)
const getAttendance = async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const student = await Student.findOne({ email: req.user.email });
      if (!student) return res.status(404).json({ success: false, message: "Student not found" });

      // Find all attendance records where this student is present
      const records = await Attendance.find({ "records.studentId": student._id })
        .populate('courseId', 'name courseCode')
        .sort({ date: -1 });

      let presentCount = 0;
      let totalCount = 0;
      let subjectStats = {};

      let formattedRecords = [];
      
      records.forEach(record => {
        // Skip if course was deleted and populate failed
        if (!record.courseId) return;

        const studentRecord = record.records.find(r => r.studentId.toString() === student._id.toString());
        const status = studentRecord ? studentRecord.status : 'Absent';
        
        totalCount++;
        if (status === 'Present') presentCount++;

        const cId = record.courseId._id.toString();
        if (!subjectStats[cId]) {
          subjectStats[cId] = { name: record.courseId.name, code: record.courseId.courseCode, present: 0, total: 0 };
        }
        subjectStats[cId].total++;
        if (status === 'Present') subjectStats[cId].present++;

        formattedRecords.push({
          _id: record._id,
          date: record.date,
          course: record.courseId.name,
          status: status
        });
      });

      const percentage = totalCount === 0 ? 0 : Math.round((presentCount / totalCount) * 100);
      const subjects = Object.values(subjectStats).map(s => ({
        ...s,
        percentage: s.total === 0 ? 0 : Math.round((s.present / s.total) * 100)
      }));

      return res.status(200).json({ 
        success: true, 
        data: { 
          overall: { present: presentCount, total: totalCount, percentage },
          subjects,
          history: formattedRecords
        }
      });
    }

    if (req.user.role === 'admin' || req.user.role === 'faculty') {
      let query = {};
      if (req.user.role === 'faculty') {
        const faculty = await Faculty.findOne({ email: req.user.email });
        if (faculty) query.facultyId = faculty._id;
      }

      const records = await Attendance.find(query)
        .populate('courseId', 'name courseCode department semester')
        .sort({ date: -1 })
        .limit(50); // Get latest 50 for dashboard

      return res.status(200).json({ success: true, data: records });
    }

    res.status(403).json({ success: false, message: "Unauthorized role" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Post Attendance (Faculty only)
const markAttendance = async (req, res) => {
  try {
    const { courseId, date, records } = req.body;
    
    if (!courseId || !records || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: "Invalid request data" });
    }

    let facultyId = null;
    if (req.user.role === 'faculty') {
      const faculty = await Faculty.findOne({ email: req.user.email });
      if (!faculty) return res.status(403).json({ success: false, message: "Unauthorized" });
      facultyId = faculty._id;
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Only faculty or admin can mark attendance" });
    }

    // Check if attendance already marked for this date and course
    // Date comparison ignoring time
    const startOfDay = new Date(date);
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23,59,59,999);

    const existing = await Attendance.findOne({
      courseId,
      facultyId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (existing) {
      // Update existing record
      existing.records = records;
      await existing.save();
      return res.status(200).json({ success: true, message: "Attendance updated successfully", data: existing });
    }

    // Create new record
    const attendance = await Attendance.create({
      date: new Date(date),
      courseId,
      facultyId,
      records
    });

    res.status(201).json({ success: true, message: "Attendance marked successfully", data: attendance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAttendance,
  markAttendance
};
