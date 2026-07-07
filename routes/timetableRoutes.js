const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const { getTimetable, createTimetableEntry, deleteTimetableEntry } = require("../controllers/timetableController");

// Everyone can view timetable (controller filters them based on role)
router.get("/", verifyToken, getTimetable);

// Only Admin can manage timetable
router.post("/", verifyToken, authorizeRoles("admin"), createTimetableEntry);
router.delete("/:id", verifyToken, authorizeRoles("admin"), deleteTimetableEntry);

module.exports = router;
