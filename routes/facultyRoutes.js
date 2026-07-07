const express = require("express");
const router  = express.Router();

const verifyToken     = require("../middleware/authMiddleware");
const authorizeRoles  = require("../middleware/authorizeRoles");

const {
  createFaculty,
  getAllFaculty,
  getFacultyById,
  updateFaculty,
  deleteFaculty,
} = require("../controllers/facultyController");

// ── POST /api/faculty ─────────────────────────────────────────────────────────
router.post("/",
  verifyToken,
  authorizeRoles("admin"),
  createFaculty
);

// ── GET /api/faculty ──────────────────────────────────────────────────────────
router.get("/",
  verifyToken,
  authorizeRoles("admin", "faculty", "student"),
  getAllFaculty
);

// ── GET /api/faculty/:id ──────────────────────────────────────────────────────
router.get("/:id",
  verifyToken,
  authorizeRoles("admin", "faculty", "student"),
  getFacultyById
);

// ── PUT /api/faculty/:id ──────────────────────────────────────────────────────
router.put("/:id",
  verifyToken,
  authorizeRoles("admin"),
  updateFaculty
);

// ── DELETE /api/faculty/:id ───────────────────────────────────────────────────
router.delete("/:id",
  verifyToken,
  authorizeRoles("admin"),
  deleteFaculty
);

module.exports = router;
