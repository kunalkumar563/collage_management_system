const Course = require("../models/course");
const Student = require("../models/student");
const fs = require("fs");
const csv = require("csv-parser");

// GET /api/courses
const getCourses = async (req, res) => {
  try {
    let query = {};
    
    // Role based filtering
    if (req.user.role === 'faculty') {
      // Faculty only see courses assigned to them
      const Faculty = require("../models/Faculty");
      const facultyRecord = await Faculty.findOne({ email: req.user.email });
      if (facultyRecord) {
        query.facultyId = facultyRecord._id;
      } else {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
    } else if (req.user.role === 'student') {
      // Student only sees courses for their department and semester
      const studentRecord = await Student.findOne({ email: req.user.email });
      if (studentRecord) {
        query.department = studentRecord.department;
        query.semester = studentRecord.semester;
      } else {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
    }

    // Apply filters from query params
    if (req.query.department && req.query.department !== 'all') {
      query.department = req.query.department;
    }
    if (req.query.semester && req.query.semester !== 'all') {
      query.semester = req.query.semester;
    }
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { courseCode: { $regex: req.query.search, $options: 'i' } },
        { department: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const totalCourses = await Course.countDocuments(query);
    const courses = await Course.find(query)
      .populate('facultyId', 'name email')
      .skip(skip)
      .limit(limit);

    res.status(200).json({ 
      success: true, 
      count: courses.length, 
      total: totalCourses,
      page,
      pages: Math.ceil(totalCourses / limit),
      data: courses 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/courses
const createCourse = async (req, res) => {
  try {
    const { courseCode, name, department, semester, section, credits, facultyId, status } = req.body;
    if (!courseCode || !name || !department || !semester) {
      return res.status(400).json({ success: false, message: "Please provide courseCode, name, department, and semester" });
    }

    const course = await Course.create({
      courseCode,
      name,
      department,
      semester,
      section: section || '',
      credits: credits || 3,
      facultyId: facultyId || null,
      status: status || "Active"
    });

    res.status(201).json({ success: true, data: course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/courses/:id
const updateCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.status(200).json({ success: true, data: course });
  } catch (error) {
    console.error("UPDATE COURSE ERROR:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/courses/:id
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.status(200).json({ success: true, message: 'Course deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/courses/bulk-upload
const bulkUploadCourses = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please upload a CSV file" });
    }

    const results = [];
    let headersFound = [];
    fs.createReadStream(req.file.path)
      .pipe(csv({
        mapHeaders: ({ header }) => {
          // Normalize header: remove BOM, trim, lower case, remove spaces and underscores
          const clean = header.trim().replace(/^[\uFEFF\u200B]/, '').toLowerCase().replace(/[\s_]+/g, '');
          headersFound.push(clean);
          return clean;
        }
      }))
      .on('data', (data) => {
        // Map common variations to expected fields
        const courseCode = data.coursecode || data.code || data.subjectcode || data.subject || data.id || `CRS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const name = data.name || data.coursename || data.subjectname || data.title || data.coursetitle;
        const department = data.department || data.dept || data.branch || data.program || data.courseorganization || 'Common';
        const semester = data.semester || data.sem || data.term;
        const section = data.section || data.sec || data.batch || '';
        const credits = data.credits || data.credit || data.cr;

        if (courseCode && name) {
          results.push({
            courseCode: courseCode.trim(),
            name: name.trim(),
            department: department ? department.trim() : 'Common',
            semester: semester ? semester.trim() : '1',
            section: section.trim(),
            credits: credits ? Number(credits) : 3,
            status: "Active"
          });
        } else {
          console.log("CSV row missing required fields:", data);
        }
      })
      .on('end', () => {
        if (results.length === 0) {
          fs.unlinkSync(req.file.path);
          const msg = "No valid courses found. Please ensure headers include Course Code and Name.";
          return res.status(400).json({ success: false, message: msg, foundHeaders: headersFound });
        }

        // Return immediately to prevent frontend and server hangs
        res.status(200).json({ 
          success: true, 
          message: `File uploaded! We are processing ${results.length} courses in the background. It may take a few minutes to appear.` 
        });

        // Run the database insertion in the background
        setImmediate(async () => {
          try {
            const chunkSize = 1000;
            for (let i = 0; i < results.length; i += chunkSize) {
              const chunk = results.slice(i, i + chunkSize);
              // Use ordered: false so if one fails, others continue
              await Course.insertMany(chunk, { ordered: false }).catch(err => {
                console.warn(`Chunk ${i} partial failure:`, err.message);
              });
            }
            fs.unlinkSync(req.file.path);
            console.log(`Successfully imported ${results.length} courses in background.`);
          } catch (insertError) {
            console.error("Insert error during background bulk upload:", insertError);
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          }
        });
      });
  } catch (error) {
    console.error("General error during bulk upload:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/courses/filters
// Returns distinct departments and semesters for the frontend dropdowns
const getCourseFilters = async (req, res) => {
  try {
    const departments = await Course.distinct('department');
    const semesters = await Course.distinct('semester');
    res.status(200).json({ success: true, data: { departments, semesters } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  bulkUploadCourses,
  getCourseFilters
};
