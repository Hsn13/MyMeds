const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User.js");
const bcrypt = require("bcrypt");
const logError = require("../utils/log-error.js");

const requireSignedIn = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect("/auth/sign-in");
  }
  next();
};

// ─── SIGN UP ─────────────────────────────────────────────────────────────────

router.get("/sign-up", async (req, res) => {
  try {
    const clinicians = await User.find({
      role: "clinician",
      isActive: true,
    }).sort({ name: 1 });
    res.render("auth/sign-up.ejs", { clinicians });
  } catch (err) {
    logError("Sign-up form loading failed", err);
    res.status(500).send("Error loading sign-up page.");
  }
});

router.post("/sign-up", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const { password, confirmPassword } = req.body;
    const role = req.body.role || "patient";

    // Helper to re-render with error + clinicians list
    const renderError = async (error) => {
      const clinicians = await User.find({
        role: "clinician",
        isActive: true,
      }).sort({ name: 1 });
      return res.render("auth/sign-up.ejs", { error, clinicians });
    };

    // --- Validation ---
    if (!username || !name || !email || !password) {
      return renderError("All fields are required.");
    }

    if (!["patient", "clinician"].includes(role)) {
      return renderError("Select a valid account type.");
    }

    if (password.length < 12) {
      return renderError("Password must be at least 12 characters long.");
    }

    if (password !== confirmPassword) {
      return renderError("Password and Confirm Password must match.");
    }

    let assignedClinicianId = null;
    if (role === "patient" && req.body.assignedClinicianId) {
      if (!mongoose.Types.ObjectId.isValid(req.body.assignedClinicianId)) {
        return renderError("Select an active clinician from the list.");
      }
      const clinician = await User.findOne({
        _id: req.body.assignedClinicianId,
        role: "clinician",
        isActive: true,
      });
      if (!clinician) {
        return renderError("Select an active clinician from the list.");
      }
      assignedClinicianId = clinician._id;
    }

    // Check uniqueness
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return renderError("Username is already taken.");
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return renderError("Email is already registered.");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    await User.create({
      username,
      name,
      email,
      password: hashedPassword,
      role,
      assignedClinicianId: role === "patient" ? assignedClinicianId : null,
    });

    res.redirect("/auth/sign-in");
  } catch (err) {
    logError("Account registration failed", err);
    res.status(500).send("Something went wrong during sign up.");
  }
});

// ─── SIGN IN ─────────────────────────────────────────────────────────────────

router.get("/sign-in", (req, res) => {
  res.render("auth/sign-in.ejs");
});

router.post("/sign-in", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const { password } = req.body;

    if (!username || !password) {
      return res.render("auth/sign-in.ejs", {
        error: "Login failed. Please check your credentials.",
      });
    }

    // Find by username
    const userInDatabase = await User.findOne({ username });
    if (!userInDatabase) {
      return res.render("auth/sign-in.ejs", {
        error: "Login failed. Please check your credentials.",
      });
    }

    // Check if account is deactivated
    if (!userInDatabase.isActive) {
      return res.render("auth/sign-in.ejs", {
        error: "This account has been deactivated.",
      });
    }

    // Compare passwords
    const validPassword = await bcrypt.compare(password, userInDatabase.password);
    if (!validPassword) {
      return res.render("auth/sign-in.ejs", {
        error: "Login failed. Please check your credentials.",
      });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });

    req.session.user = {
      _id: userInDatabase._id.toString(),
      username: userInDatabase.username,
      name: userInDatabase.name,
      email: userInDatabase.email,
      role: userInDatabase.role,
    };

    await new Promise((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });

    if (userInDatabase.role === "clinician") {
      return res.redirect("/clinician/patients");
    }
    res.redirect("/");
  } catch (err) {
    logError("Sign-in failed", err);
    res.status(500).send("Something went wrong during sign in.");
  }
});

// ─── SIGN OUT ────────────────────────────────────────────────────────────────

router.post("/sign-out", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      logError("Sign-out failed", error);
      return res.status(500).send("Unable to sign out.");
    }
    res.clearCookie("mymeds.sid", { path: "/" });
    res.redirect("/");
  });
});

// ─── PROFILE (Edit) ──────────────────────────────────────────────────────────

router.get("/profile", requireSignedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    res.render("auth/profile.ejs", { profileUser: user });
  } catch (err) {
    logError("Profile loading failed", err);
    res.status(500).send("Error loading profile.");
  }
});

router.post("/profile", requireSignedIn, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await User.findById(req.session.user._id);
    if (!user) {
      return res.status(404).send("Account not found.");
    }
    if (!name || !email) {
      return res.render("auth/profile.ejs", {
        profileUser: user,
        error: "Name and email are required.",
      });
    }

    // Check email uniqueness if changed
    if (email !== user.email) {
      const emailTaken = await User.findOne({ email, _id: { $ne: user._id } });
      if (emailTaken) {
        return res.render("auth/profile.ejs", {
          profileUser: user,
          error: "That email is already in use.",
        });
      }
    }

    user.name = name;
    user.email = email;
    await user.save();

    // Update session
    req.session.user.name = name;
    req.session.user.email = email;

    res.redirect("/auth/profile");
  } catch (err) {
    logError("Profile update failed", err);
    res.status(500).send("Error updating profile.");
  }
});

// ─── DEACTIVATE ACCOUNT ──────────────────────────────────────────────────────

router.post("/deactivate", requireSignedIn, async (req, res) => {
  try {
    const userId = req.session.user._id;
    await User.findByIdAndUpdate(userId, { isActive: false });
    req.session.destroy((error) => {
      if (error) {
        logError("Account deactivation session cleanup failed", error);
        return res.status(500).send("Account deactivated, but sign-out failed.");
      }
      res.clearCookie("mymeds.sid", { path: "/" });
      res.redirect("/auth/sign-in");
    });
  } catch (err) {
    logError("Account deactivation failed", err);
    res.status(500).send("Error deactivating account.");
  }
});

module.exports = router;
