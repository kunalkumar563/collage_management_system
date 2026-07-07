const express = require("express");
const router  = express.Router();

const verifyToken     = require("../middleware/authMiddleware");
const authorizeRoles  = require("../middleware/authorizeRoles");

const {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
} = require("../controllers/noticeController");

// ── POST /api/notices ─────────────────────────────────────────────────────────
// Only admin can publish notices
router.post("/",
  verifyToken,
  authorizeRoles("admin"),
  createNotice
);

// ── GET /api/notices ──────────────────────────────────────────────────────────
// Every role (including students) can read the noticeboard
router.get("/",
  verifyToken,
  authorizeRoles("admin", "faculty", "student"),
  getAllNotices
);

// ── GET /api/notices/:id ──────────────────────────────────────────────────────
router.get("/:id",
  verifyToken,
  authorizeRoles("admin", "faculty", "student"),
  getNoticeById
);

// ── PUT /api/notices/:id ──────────────────────────────────────────────────────
router.put("/:id",
  verifyToken,
  authorizeRoles("admin"),
  updateNotice
);

// ── DELETE /api/notices/:id ───────────────────────────────────────────────────
router.delete("/:id",
  verifyToken,
  authorizeRoles("admin"),
  deleteNotice
);

module.exports = router;
