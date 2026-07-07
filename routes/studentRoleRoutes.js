const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

const {
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
} = require("../controllers/studentRoleController");

// Apply middleware to all routes in this file
router.use(verifyToken);
router.use(authorizeRoles("student"));

// POST routes
router.post("/complete-profile", completeProfile);

// GET routes
router.get("/profile", getProfile);
router.get("/dashboard", getDashboardOverview);
router.get("/attendance", getAttendance);
router.get("/marks", getMarks);
router.get("/timetable", getTimetable);
router.get("/notices", getNotices);
router.get("/assignments", getAssignments);
router.get("/exams", getExams);

// PUT routes
router.put("/profile", updateProfile);
router.put("/change-password", changePassword);

module.exports = router;
