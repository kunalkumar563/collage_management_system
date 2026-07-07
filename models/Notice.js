const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    isUrgent: {
      type: Boolean,
      default: false,
    },

    targetAudience: {
      type: String,
      enum: ['All', 'Faculty', 'Student'],
      default: 'All',
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notice", noticeSchema);