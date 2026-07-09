require('dotenv').config();
const mongoose = require('mongoose');
const Attendance = require('./models/attendance');
const Student = require('./models/student');
const Course = require('./models/course');

async function fixAttendance() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to DB");

  const attendances = await Attendance.find({}).populate('courseId');
  let removedCount = 0;

  for (let att of attendances) {
    if (!att.courseId) continue;
    
    let validRecords = [];
    for (let record of att.records) {
      const student = await Student.findById(record.studentId);
      if (student) {
        // Only keep if department and semester match. If course has section, it must match.
        const matchesDept = student.department === att.courseId.department;
        const matchesSem = student.semester === att.courseId.semester;
        const matchesSec = !att.courseId.section || (student.section && student.section.toLowerCase() === att.courseId.section.toLowerCase());
        
        if (matchesDept && matchesSem && matchesSec) {
          validRecords.push(record);
        } else {
          console.log(`Removing ${student.name} from Course ${att.courseId.name} (Course Sec: ${att.courseId.section}, Student Sec: ${student.section})`);
          removedCount++;
        }
      }
    }
    
    if (validRecords.length < att.records.length) {
      att.records = validRecords;
      await att.save();
    }
  }
  
  console.log(`Removed ${removedCount} invalid attendance records.`);
  process.exit();
}

fixAttendance();
