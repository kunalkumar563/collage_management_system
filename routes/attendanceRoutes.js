const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const { getAttendance, markAttendance } = require("../controllers/attendanceController");

router.get("/", verifyToken, getAttendance);
router.post("/", verifyToken, authorizeRoles("faculty"), markAttendance);

module.exports = router;
