const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clinicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["message", "feedback", "review_flag"],
      default: "message",
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

messageSchema.index({ patientId: 1, clinicianId: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
