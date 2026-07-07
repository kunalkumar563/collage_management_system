const express = require("express");
const router  = express.Router();

const verifyToken     = require("../middleware/authMiddleware");
const authorizeRoles  = require("../middleware/authorizeRoles");

const {
  createStudent,
  getAllStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
} = require("../controllers/studentController");

// ── POST /api/students ────────────────────────────────────────────────────────
// Only admin can enrol new students
router.post("/",
  verifyToken,
  authorizeRoles("admin"),
  createStudent
);

// ── GET /api/students ─────────────────────────────────────────────────────────
// Admin sees all students; faculty sees all (read-only); student is blocked here
// (a student fetches only their own record via GET /:id)
router.get("/",
  verifyToken,
  authorizeRoles("admin", "faculty"),
  getAllStudents
);

// ── GET /api/students/:id ─────────────────────────────────────────────────────
// Admin and faculty can view any student.
// A student can only view their own record — enforced inside the controller
// by comparing req.params.id with req.user.id (see studentController.getStudentById).
router.get("/:id",
  verifyToken,
  authorizeRoles("admin", "faculty", "student"),
  getStudentById
);

// ── PUT /api/students/:id ─────────────────────────────────────────────────────
// Only admin can update student records
router.put("/:id",
  verifyToken,
  authorizeRoles("admin"),
  updateStudent
);

// ── DELETE /api/students/:id ──────────────────────────────────────────────────
// Only admin can delete
router.delete("/:id",
  verifyToken,
  authorizeRoles("admin"),
  deleteStudent
);

module.exports = router;
