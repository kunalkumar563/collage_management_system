const express = require("express");
const router = express.Router();
const multer = require("multer");

// Configure multer for CSV upload (temp storage)
const upload = multer({ dest: 'uploads/' });

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const { getCourses, createCourse, updateCourse, deleteCourse, bulkUploadCourses, getCourseFilters } = require("../controllers/courseController");

// Get filters (must be before /:id routes)
router.get("/filters", verifyToken, getCourseFilters);

// Everyone can view courses (controller filters them based on role)
router.get("/", verifyToken, getCourses);

// Only Admin can manage courses
router.post("/", verifyToken, authorizeRoles("admin"), createCourse);
router.post("/bulk-upload", verifyToken, authorizeRoles("admin"), upload.single('file'), bulkUploadCourses);
router.put("/:id", verifyToken, authorizeRoles("admin"), updateCourse);
router.delete("/:id", verifyToken, authorizeRoles("admin"), deleteCourse);

module.exports = router;
