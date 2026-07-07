const Notice = require("../models/Notice");
const User = require("../models/user");
const { Expo } = require("expo-server-sdk");

// Initialize Expo SDK client
let expo = new Expo();

// Create Notice
const createNotice = async (req, res) => {
  try {
    const notice = await Notice.create(req.body);

    // Prepare Push Notification
    let targetQuery = { pushToken: { $ne: "" }, pushToken: { $exists: true } };
    if (notice.targetAudience === "Faculty") {
      targetQuery.role = "faculty";
    } else if (notice.targetAudience === "Student") {
      targetQuery.role = "student";
    }

    const users = await User.find(targetQuery);
    
    let messages = [];
    for (let user of users) {
      if (!Expo.isExpoPushToken(user.pushToken)) continue;

      messages.push({
        to: user.pushToken,
        sound: 'default',
        title: notice.isUrgent ? `🚨 URGENT: ${notice.title}` : `🔔 New Notice: ${notice.title}`,
        body: notice.description,
        data: { noticeId: notice._id },
      });
    }

    // Dispatch messages in chunks
    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];
    
    // We send push notifications asynchronously without blocking the response
    (async () => {
      for (let chunk of chunks) {
        try {
          let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error(error);
        }
      }
    })();

    res.status(201).json({
      success: true,
      message: "Notice created successfully and notifications dispatched.",
      data: notice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get All Notices
const getAllNotices = async (req, res) => {
  try {
    const notices = await Notice.find();

    res.status(200).json({
      success: true,
      count: notices.length,
      data: notices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Notice By ID
const getNoticeById = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    res.status(200).json({
      success: true,
      data: notice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update Notice
const updateNotice = async (req, res) => {
  try {
    const notice = await Notice.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notice updated successfully",
      data: notice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete Notice
const deleteNotice = async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notice deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createNotice,
  getAllNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
};