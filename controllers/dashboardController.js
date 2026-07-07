const Student = require("../models/student");
const Faculty = require("../models/Faculty");
const Notice = require("../models/Notice");
const User = require("../models/user");
const Course = require("../models/course");

// ─── Get Dashboard Statistics ────────────────────────────────────────────────
// GET /api/dashboard/stats
const getDashboardStats = async (req, res) => {
  try {
    // Basic counts
    const totalStudents = await Student.countDocuments();
    const totalFaculty = await Faculty.countDocuments();
    const totalNotices = await Notice.countDocuments();
    const totalCourses = await Course.countDocuments();
    
    // Total fees collected (mock calculation - replace with actual finance model if exists)
    const studentsWithFeesPaid = await Student.countDocuments({ feesPaid: true });
    // Assuming average fee is 50,000 for demonstration purposes
    const totalFeesCollected = studentsWithFeesPaid * 50000;

    // Enrollment Chart Data (Students enrolled per month for current year)
    // For demonstration, we'll aggregate based on createdAt month
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    const enrollmentData = await Student.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear, $lte: endOfYear }
        }
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Format enrollment data for 12 months [0, 0, 0, ...]
    const monthlyEnrollment = new Array(12).fill(0);
    enrollmentData.forEach(item => {
      // _id is month 1-12, array is 0-11
      monthlyEnrollment[item._id - 1] = item.count;
    });

    // Department Distribution Data
    const departmentData = await Student.aggregate([
      {
        $match: { department: { $exists: true, $ne: "" } }
      },
      {
        $group: {
          _id: "$department",
          count: { $sum: 1 }
        }
      }
    ]);

    const departmentLabels = departmentData.map(d => d._id);
    const departmentCounts = departmentData.map(d => d.count);

    // Section Distribution Data
    const sectionData = await Student.aggregate([
      {
        $match: { department: { $exists: true, $ne: "" }, semester: { $exists: true, $ne: "" }, section: { $exists: true, $ne: "" } }
      },
      {
        $group: {
          _id: { department: "$department", semester: "$semester", section: "$section" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.department": 1, "_id.semester": 1, "_id.section": 1 }
      }
    ]);

    const formattedSectionData = sectionData.map(item => ({
      department: item._id.department,
      semester: item._id.semester,
      section: item._id.section,
      count: item.count
    }));

    // Recent Admissions Data
    const recentAdmissions = await Student.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name rollNo department createdAt status');

    res.status(200).json({
      success: true,
      stats: {
        totalStudents,
        totalFaculty,
        totalNotices,
        totalCourses,
        totalFeesCollected,
        sectionDistribution: formattedSectionData
      },
      charts: {
        enrollment: monthlyEnrollment,
        departments: {
          labels: departmentLabels,
          data: departmentCounts
        }
      },
      recentAdmissions
    });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getDashboardStats };
