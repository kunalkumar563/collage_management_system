const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    rollNo: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    admissionNo: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    department: {
      type: String,
      trim: true,
    },

    course: {
      type: String,
      trim: true,
    },

    batch: {
      type: String,
      trim: true,
    },

    semester: {
      type: String,
      trim: true,
    },

    section: {
      type: String,
      trim: true,
    },

    gender: {
      type: String,
      trim: true,
    },

    dob: {
      type: Date,
    },

    address: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
      default: 'Pending',
    },

    profilePic: {
      type: String,
      default: ''
    },

    feesPaid: {
      type: Boolean,
      default: false,
    },

    class: {
      type: String,
      trim: true,
    },

    section: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema);