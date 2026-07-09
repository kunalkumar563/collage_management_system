const mongoose = require("mongoose");

const timetableSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: true,
      trim: true,
    },
    batch: {
      type: String,
      trim: true,
    },
    semester: {
      type: String,
      required: true,
      trim: true,
    },
    day: {
      type: String, // e.g., "Monday", "Tuesday"
      required: true,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    },
    startTime: {
      type: String, // e.g., "09:00 AM"
      required: true,
    },
    endTime: {
      type: String, // e.g., "10:00 AM"
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      required: true,
    },
    room: {
      type: String,
      required: true,
      trim: true,
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Timetable", timetableSchema);
