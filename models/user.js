const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["patient", "clinician"],
    default: "patient",
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
