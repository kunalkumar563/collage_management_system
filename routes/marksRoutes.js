const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const { getAllMarks, bulkUpsertMarks, getStudentsByCourse } = require("../controllers/marksController");

// Get all marks (filtered by role inside controller)
router.get("/", verifyToken, getAllMarks);

// Get students belonging to a course (for Faculty to enter marks)
router.get("/course/:courseId/students", verifyToken, authorizeRoles("admin", "faculty"), getStudentsByCourse);

// Bulk upload/upsert marks for a course
router.post("/bulk", verifyToken, authorizeRoles("admin", "faculty"), bulkUpsertMarks);

module.exports = router;
