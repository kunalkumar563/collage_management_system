const Student = require('../models/student');
const Attendance = require('../models/attendance');
const Marks = require('../models/marks');
const Notice = require('../models/Notice');
const Subject = require('../models/subject');
const User = require('../models/user');
const bcrypt = require('bcryptjs');

// Helper to get student profile from req.user
const getStudentProfile = async (email) => {
  let student = await Student.findOne({ email }).lean();
  if (!student) {
    // If registered via auth but Admin hasn't created their Student record yet, return a fallback
    const user = await User.findOne({ email }).lean();
    if (user) {
      student = {
        _id: user._id, // use user id as mock student id
        name: user.name,
        email: user.email,
        rollNo: 'N/A',
        department: 'N/A',
        semester: '1',
        section: 'A',
        profilePic: user.profilePic || ''
      };
    }
  }
  return student;
};

// GET /api/student/profile
const getProfile = async (req, res) => {
  try {
    const student = await getStudentProfile(req.user.email);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });
    res.status(200).json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/student/complete-profile
const completeProfile = async (req, res) => {
  try {
    const { department, semester, section, rollNo } = req.body;
    
    // Check if Roll No already exists in the same department
    const existingStudent = await Student.findOne({ department, rollNo });
    if (existingStudent && existingStudent.email !== req.user.email) {
      return res.status(400).json({ success: false, message: `Student ID ${rollNo} is already registered in ${department}.` });
    }

    const user = await User.findById(req.user.id);
    let student = await getStudentProfile(req.user.email);

    if (student) {
      if (student.rollNo !== 'N/A' && student.department !== 'N/A') {
        return res.status(400).json({ success: false, message: 'You are already registered. Details cannot be changed.' });
      }
      student.department = department;
      student.semester = semester;
      student.section = section;
      student.rollNo = rollNo;
      await student.save();
    } else {
      student = await Student.create({
        name: user.name,
        email: user.email,
        profilePic: user.profilePic,
        department,
        semester,
        section,
        rollNo,
        status: 'Active'
      });
    }

    res.status(200).json({ success: true, message: 'Profile completed successfully!', data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/student/profile
const updateProfile = async (req, res) => {
  try {
    const student = await getStudentProfile(req.user.email);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });

    // Allow updating only safe fields
    const { phone, address, profilePic } = req.body;
    
    // Prepare update object, only include profilePic if it's provided to avoid accidental overwrites
    const updateData = { phone, address };
    if (profilePic !== undefined) {
      updateData.profilePic = profilePic;
    }

    const updated = await Student.findByIdAndUpdate(student._id, { $set: updateData }, { new: true, runValidators: true }).lean();

    res.status(200).json({ success: true, message: 'Profile updated', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/student/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Incorrect current password.' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/student/attendance
const getAttendance = async (req, res) => {
  try {
    const student = await getStudentProfile(req.user.email);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });

    const records = await Attendance.find({ 'marks.student': student._id }).lean();
    
    // Process records for student dashboard view
    const subjectStats = {};
    let presentCount = 0;
    let totalCount = 0;

    const calendar = [];

    records.forEach(record => {
      const mark = record.marks.find(m => m.student.toString() === student._id.toString());
      if (mark) {
        const sub = record.sessionId || 'Unknown';
        if (!subjectStats[sub]) subjectStats[sub] = { total: 0, present: 0 };
        subjectStats[sub].total++;
        totalCount++;

        if (mark.status === 'P' || mark.status === 'L') {
          subjectStats[sub].present++;
          presentCount++;
        }
        
        calendar.push({
          date: record.date,
          subject: sub,
          status: mark.status,
          remark: mark.remark
        });
      }
    });

    const overallPercentage = totalCount ? Math.round((presentCount / totalCount) * 100) : 0;
    
    const subjectWise = Object.keys(subjectStats).map(key => ({
      subject: key,
      total: subjectStats[key].total,
      present: subjectStats[key].present,
      percentage: Math.round((subjectStats[key].present / subjectStats[key].total) * 100)
    }));

    res.status(200).json({
      success: true,
      data: {
        overallPercentage,
        totalClasses: totalCount,
        classesAttended: presentCount,
        subjectWise,
        calendar: calendar.sort((a,b) => new Date(b.date) - new Date(a.date))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/student/marks
const getMarks = async (req, res) => {
  try {
    const student = await getStudentProfile(req.user.email);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const marks = await Marks.find({ student: student._id }).populate('subject').lean();

    let totalScore = 0;
    let maxScore = 0;

    const formattedMarks = marks.map(m => {
      const tm = m.internalMarks + m.externalMarks;
      totalScore += tm;
      maxScore += 100; // Assuming 100 per subject
      return {
        id: m._id,
        subject: m.subject ? m.subject.subject : 'Unknown Subject',
        internal: m.internalMarks,
        external: m.externalMarks,
        total: tm,
        grade: m.grade || 'NA',
        semester: m.semester
      };
    });

    const overallPercentage = maxScore ? ((totalScore / maxScore) * 100).toFixed(2) : 0;
    // Mock CGPA calculation based on percentage
    const cgpa = overallPercentage ? (overallPercentage / 9.5).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        overallPercentage,
        cgpa,
        marks: formattedMarks
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/student/timetable
const getTimetable = async (req, res) => {
  try {
    const student = await getStudentProfile(req.user.email);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    // Fetch subjects matching student department/semester
    const subjects = await Subject.find({ department: student.department }).lean();

    // In a real system, subjects have days/times. We mock the weekly structure here based on available subjects.
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timetable = {};
    
    days.forEach((day, index) => {
      // Rotate subjects slightly per day to mock a timetable
      timetable[day] = subjects.map((sub, i) => ({
        id: `${day}-${sub._id}`,
        subject: sub.subject,
        time: sub.time || `${9 + (i % 4)}:00 AM`,
        room: sub.room || `Room ${101 + i}`,
        faculty: 'Assigned Faculty',
        status: 'Upcoming' // Mock status
      }));
    });

    res.status(200).json({ success: true, data: timetable });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/student/notices
const getNotices = async (req, res) => {
  try {
    const notices = await Notice.find().sort({ date: -1, createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: notices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/student/assignments (MOCK)
const getAssignments = async (req, res) => {
  try {
    const student = await getStudentProfile(req.user.email);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    // Mock Assignments since we don't have an Assignment model
    const mockAssignments = [
      { id: '1', subject: 'Data Structures', title: 'Implement AVL Tree', faculty: 'Dr. Smith', dueDate: '2026-07-10', status: 'Pending' },
      { id: '2', subject: 'Operating Systems', title: 'Process Scheduling Algorithms', faculty: 'Prof. Johnson', dueDate: '2026-07-05', status: 'Submitted' },
      { id: '3', subject: 'Computer Networks', title: 'Socket Programming in C', faculty: 'Dr. Brown', dueDate: '2026-07-15', status: 'Pending' },
    ];

    res.status(200).json({ success: true, data: mockAssignments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/student/exams (MOCK)
const getExams = async (req, res) => {
  try {
    const student = await getStudentProfile(req.user.email);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    // Mock Exams since we don't have an Exam model
    const mockExams = [
      { id: '1', subject: 'Data Structures', date: '2026-08-01', time: '10:00 AM - 01:00 PM', room: 'Hall A' },
      { id: '2', subject: 'Operating Systems', date: '2026-08-03', time: '10:00 AM - 01:00 PM', room: 'Hall B' },
      { id: '3', subject: 'Computer Networks', date: '2026-08-05', time: '02:00 PM - 05:00 PM', room: 'Hall C' },
    ];

    res.status(200).json({ success: true, data: mockExams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/student/dashboard
const getDashboardOverview = async (req, res) => {
  try {
    const student = await getStudentProfile(req.user.email);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    // Notices Count
    const noticesCount = await Notice.countDocuments();
    
    // Marks/CGPA
    const marks = await Marks.find({ student: student._id }).lean();
    let totalScore = 0;
    let maxScore = 0;
    marks.forEach(m => {
      totalScore += (m.internalMarks + m.externalMarks);
      maxScore += 100;
    });
    const marksPercentage = maxScore ? ((totalScore / maxScore) * 100).toFixed(1) : 0;
    const cgpa = marksPercentage ? (marksPercentage / 9.5).toFixed(2) : 0;

    // Attendance
    const attRecords = await Attendance.find({ 'marks.student': student._id }).lean();
    let attTotal = 0;
    let attPresent = 0;
    attRecords.forEach(record => {
      const m = record.marks.find(x => x.student.toString() === student._id.toString());
      if (m) {
        attTotal++;
        if (m.status === 'P' || m.status === 'L') attPresent++;
      }
    });
    const attendancePercentage = attTotal ? Math.round((attPresent / attTotal) * 100) : 0;

    // Today's Classes (Mock based on subjects)
    const subjects = await Subject.find({ department: student.department }).limit(3).lean();
    const todaysClasses = subjects.map((sub, i) => ({
      id: sub._id,
      subject: sub.subject,
      time: sub.time || `${9 + i}:00 AM`,
      room: sub.room || `Room ${101 + i}`,
      faculty: 'Assigned Faculty',
      status: i === 0 ? 'Completed' : (i === 1 ? 'Ongoing' : 'Upcoming')
    }));

    res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          rollNo: student.rollNo,
          department: student.department,
          batch: student.batch,
          course: student.course,
          semester: student.semester,
          section: student.section,
          address: student.address,
          status: student.status,
          avatar: student.profilePic || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=E53935&color=fff`
        },
        stats: {
          cgpa,
          marksPercentage,
          attendancePercentage,
          noticesCount
        },
        todaysClasses
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getAttendance,
  getMarks,
  getTimetable,
  getNotices,
  getAssignments,
  getExams,
  getDashboardOverview,
  completeProfile
};
