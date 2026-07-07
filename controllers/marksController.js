const Marks = require("../models/marks");
const Student = require("../models/student");
const Faculty = require("../models/Faculty");
const Course = require("../models/course");

// Get All Marks
const getAllMarks = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "student") {
      const student = await Student.findOne({ email: req.user.email }).select("_id");
      if (!student) {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
      query.studentId = student._id;
    } else if (req.user.role === "faculty") {
      const faculty = await Faculty.findOne({ email: req.user.email }).select("_id");
      if (!faculty) {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
      query.facultyId = faculty._id;
    }

    const marks = await Marks.find(query)
      .populate("studentId", "name rollNo department semester")
      .populate("courseId", "name courseCode credits")
      .populate("facultyId", "name");

    res.status(200).json({
      success: true,
      count: marks.length,
      data: marks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Bulk Upsert Marks (For Faculty)
const bulkUpsertMarks = async (req, res) => {
  try {
    const { courseId, marksData } = req.body;
    // marksData should be an array: [{ studentId, internalMarks, externalMarks }]

    if (!courseId || !marksData || !Array.isArray(marksData)) {
      return res.status(400).json({ success: false, message: "Invalid request data" });
    }

    let facultyId = null;
    if (req.user.role === "faculty") {
      const faculty = await Faculty.findOne({ email: req.user.email });
      if (!faculty) return res.status(403).json({ success: false, message: "Unauthorized" });
      facultyId = faculty._id;
    } else if (req.user.role === "admin") {
      // If admin uploads, they need to provide facultyId or we set it to some admin ID (null for now)
      // Actually we require facultyId in schema, so let's bypass or find the course's faculty
      const course = await Course.findById(courseId);
      facultyId = course?.facultyId;
      if(!facultyId) {
         return res.status(400).json({ success: false, message: "Course has no faculty assigned." });
      }
    }

    const results = [];
    for (const data of marksData) {
      // Upsert: update if exists, insert if not
      let markEntry = await Marks.findOne({ studentId: data.studentId, courseId });
      
      if (markEntry) {
        markEntry.internalMarks = data.internalMarks;
        markEntry.externalMarks = data.externalMarks;
        markEntry.facultyId = facultyId;
        await markEntry.save(); // triggers the pre-save hook for total/grade
      } else {
        markEntry = await Marks.create({
          studentId: data.studentId,
          courseId,
          facultyId,
          internalMarks: data.internalMarks,
          externalMarks: data.externalMarks
        });
      }
      results.push(markEntry);
    }

    res.status(200).json({
      success: true,
      message: `Marks uploaded successfully for ${results.length} students.`,
      data: results
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Students by Course (Helper for Faculty Upload Screen)
const getStudentsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    // Find all students in that department and semester
    const students = await Student.find({
      department: course.department,
      semester: course.semester
    }).select("_id name rollNo");

    res.status(200).json({ success: true, count: students.length, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getAllMarks,
  bulkUpsertMarks,
  getStudentsByCourse
};