const express = require("express");
const router  = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const { registerUser, loginUser, getMe, forgotPassword, resetPassword, uploadProfilePic, updateProfile, changePassword, savePushToken } = require("../controllers/authController");

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/register", registerUser);
router.post("/login",    loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// ── Protected ─────────────────────────────────────────────────────────────────
// Called by the frontend on every page reload to validate the stored token
// and get the current user's role without logging in again
router.get("/me", verifyToken, getMe);
router.put("/profile-pic", verifyToken, uploadProfilePic);
router.put("/profile", verifyToken, updateProfile);
router.put("/change-password", verifyToken, changePassword);
router.post("/push-token", verifyToken, savePushToken);

module.exports = router;
