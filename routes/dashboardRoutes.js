const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const { getDashboardStats } = require("../controllers/dashboardController");

// Protect this route so only authenticated users can access the stats.
// Optionally, you could restrict it to admins only using authorizeRoles('admin')
// For now, let's allow all authenticated users, and the frontend will decide what to show
router.get("/stats", verifyToken, getDashboardStats);

module.exports = router;
