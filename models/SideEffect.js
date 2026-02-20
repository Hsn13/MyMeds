const mongoose = require("mongoose");

const sideEffectSchema = new mongoose.Schema(
  {
    medicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medication",
      required: true,
    },
    effect: {
      type: String,
      required: true,
      trim: true, // e.g. "Nausea", "Headache", "Dizziness"
    },
    severity: {
      type: Number,
      required: true,
      min: 1,
      max: 5, // 1 = mild, 5 = severe
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null, // null = still ongoing
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

const SideEffect = mongoose.model("SideEffect", sideEffectSchema);
module.exports = SideEffect;
