require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const facultyRoutes = require("./routes/facultyRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const marksRoutes = require("./routes/marksRoutes");
const noticeRoutes = require("./routes/noticeRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const subjectRoutes = require("./routes/subjectRoutes");
const courseRoutes = require("./routes/courseRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const studentRoleRoutes = require("./routes/studentRoleRoutes");

// Connect Database
connectDB();

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve frontend static files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, "frontend")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/marks", marksRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/subjects", subjectRoutes); // Legacy if needed
app.use("/api/courses", courseRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/student", studentRoleRoutes);

// Root redirects to login page
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// Server Start
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/login.html in your browser`);
});