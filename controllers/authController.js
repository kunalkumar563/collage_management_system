const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ─── Register ────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body: { name, email, password, role? }
// role defaults to "student" if not provided (see User model)
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check duplicate email
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "student", // Force role to student for open registration
    });

    const Student = require("../models/student");
    await Student.create({
      name,
      email,
      department: "Unassigned",
    });

    // Never send the password back
    user.password = undefined;

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, password }
// Returns: { token, user: { _id, name, email, role } }
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid password" });
    }

    // Sign JWT — embed id, role AND email so other controllers can read without a DB call
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Clean response — never expose the hashed password
    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id:   user._id,
        name:  user.name,
        email: user.email,
        role:  user.role,   // ← frontend uses this to build the dashboard
        profilePic: user.profilePic,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get Me ───────────────────────────────────────────────────────────────────
// GET /api/auth/me   (requires verifyToken)
// Used by the frontend on page reload to re-validate the stored token
// and get fresh user data (in case role changed in DB)
const getMe = async (req, res) => {
  try {
    // req.user.id was set by verifyToken
    const userId = req.user.id || req.user._id;
    if (!userId) {
      return res.status(400).json({ success: false, message: "Invalid token payload: missing user ID" });
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// Body: { email }
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User with this email does not exist" });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOTP = await bcrypt.hash(otp, 10);

    user.resetPasswordOTP = hashedOTP;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Nodemailer setup
    let transporter;
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
        family: 4 // Force IPv4 to prevent IPv6 drops on cloud servers
      });
    } else {
      // Mock ethereal transport for development if no real credentials
      let testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const mailOptions = {
      from: '"NIMS University" <noreply@nimsuniversity.org>',
      to: user.email,
      subject: "Password Reset OTP",
      text: `Your password reset OTP is ${otp}. It will expire in 10 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #D90429;">Password Reset Request</h2>
          <p>You requested a password reset for your NIMS University account.</p>
          <p>Your One-Time Password (OTP) is:</p>
          <h1 style="background: #F3F4F6; padding: 10px; text-align: center; letter-spacing: 5px; border-radius: 6px;">${otp}</h1>
          <p>This OTP will expire in 10 minutes. If you did not request this, please ignore this email.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Forgot Password email sent. OTP:", otp);
    if (info.messageId && nodemailer.getTestMessageUrl(info)) {
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    }

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// Body: { email, otp, newPassword }
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "Please provide email, OTP, and new password" });
    }

    const user = await User.findOne({ 
      email,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user || !user.resetPasswordOTP) {
      return res.status(400).json({ success: false, message: "OTP is invalid or has expired" });
    }

    const isMatch = await bcrypt.compare(otp, user.resetPasswordOTP);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ success: true, message: "Password reset successfully. You can now login." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Upload Profile Picture ──────────────────────────────────────────────────
// PUT /api/auth/profile-pic
// Body: { profilePic: "base64 string" }
// Requires: JWT auth (req.user)
const uploadProfilePic = async (req, res) => {
  try {
    const { profilePic } = req.body;
    if (profilePic === undefined) {
      return res.status(400).json({ success: false, message: "Profile picture data is required" });
    }

    const userId = req.user.id || req.user._id;
    if (!userId) {
      return res.status(400).json({ success: false, message: "Invalid token payload: missing user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.profilePic = profilePic;
    await user.save();

    // Sync with Student profile if role is student
    if (user.role === 'student') {
      const Student = require('../models/student');
      await Student.findOneAndUpdate(
        { email: user.email },
        { profilePic: profilePic }
      );
    }

    res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      profilePic: user.profilePic
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────
// PUT /api/auth/change-password
// Requires JWT auth (req.user)
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Please provide both old and new passwords" });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ success: false, message: "New password cannot be the same as the old password" });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Incorrect old password" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Update Profile (Admin/Faculty) ───────────────────────────────────────────────────────────
// PUT /api/auth/profile
// Updates User model and upserts Student model if role is student
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, phone, department, semester, section } = req.body;
    
    // Update User
    const user = await User.findByIdAndUpdate(userId, { name, phone }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Update or create Student if role is student
    if (user.role === 'student') {
      const Student = require('../models/student');
      let student = await Student.findOne({ email: user.email });
      
      if (student) {
        student.name = name || student.name;
        student.phone = phone || student.phone;
        student.department = department || student.department;
        student.semester = semester || student.semester;
        student.section = section || student.section;
        await student.save();
      } else {
        // Create new student record linked by email
        student = await Student.create({
          name: user.name,
          email: user.email,
          phone: user.phone,
          department,
          semester,
          section
        });
      }
      
      // Merge student fields into response
      const userObj = user.toObject();
      userObj.department = student.department;
      userObj.semester = student.semester;
      userObj.section = student.section;
      userObj.rollNo = student.rollNo;
      return res.status(200).json({ success: true, user: userObj, message: "Profile updated successfully" });
    }

    res.status(200).json({ success: true, user, message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Push Notification Token ──────────────────────────────────────────────────
const savePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Token required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.pushToken = token;
    await user.save();

    res.status(200).json({ success: true, message: "Push token saved successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  uploadProfilePic,
  changePassword,
  updateProfile,
  savePushToken,
};
