const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    },

    role: {
        type: String,
        enum: ["admin", "faculty", "student"],
        default: "student"
    },

    profilePic: {
        type: String,
        default: ""
    },

    resetPasswordOTP: {
        type: String
    },

    pushToken: {
        type: String,
        default: ""
    },

    resetPasswordExpires: {
        type: Date
    }
});

module.exports = mongoose.model("User", userSchema);