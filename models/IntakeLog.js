const mongoose = require("mongoose");

const intakeLogSchema = new mongoose.Schema(
  {
    medicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medication",
      required: true,
    },
    // The calendar date this log belongs to (strip time for clean date queries)
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["taken", "missed", "late"],
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

// Compound index: one log per medication per day
intakeLogSchema.index({ medicationId: 1, date: 1 }, { unique: true });

const IntakeLog = mongoose.model("IntakeLog", intakeLogSchema);
module.exports = IntakeLog;
