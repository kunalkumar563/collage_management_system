const mongoose = require("mongoose");

const marksSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    internalMarks: {
      type: Number,
      default: 0,
      min: 0,
      max: 40
    },
    externalMarks: {
      type: Number,
      default: 0,
      min: 0,
      max: 60
    },
    totalMarks: {
      type: Number,
      default: 0
    },
    grade: {
      type: String,
      default: 'F'
    }
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to calculate total and grade
marksSchema.pre('save', function() {
  this.totalMarks = (this.internalMarks || 0) + (this.externalMarks || 0);
  
  if (this.totalMarks >= 90) this.grade = 'A+';
  else if (this.totalMarks >= 80) this.grade = 'A';
  else if (this.totalMarks >= 70) this.grade = 'B+';
  else if (this.totalMarks >= 60) this.grade = 'B';
  else if (this.totalMarks >= 50) this.grade = 'C';
  else if (this.totalMarks >= 40) this.grade = 'D';
  else this.grade = 'F';
});

module.exports = mongoose.model("Marks", marksSchema);