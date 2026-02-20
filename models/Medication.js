const mongoose = require("mongoose");

const medicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    dosage: {
      type: String,
      required: true,
      trim: true, // e.g. "500mg", "10ml"
    },
    frequency: {
      type: String,
      required: true,
      trim: true, // e.g. "Once daily", "Twice daily", "Every 8 hours"
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null, // null means ongoing
    },
    instructions: {
      type: String,
      trim: true,
      default: "", // e.g. "Take with food", "Avoid alcohol"
    },
    // Soft delete flag — setting false hides it from the default list
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const Medication = mongoose.model("Medication", medicationSchema);
module.exports = Medication;
