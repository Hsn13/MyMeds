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
  const formData = {
    username: String(req.body.username || "").trim(),
    name: String(req.body.name || "").trim(),
    email: String(req.body.email || "").trim().toLowerCase(),
    role: req.body.role === "clinician" ? "clinician" : "patient",
    assignedClinicianId: String(req.body.assignedClinicianId || ""),
  };

  const renderSignupError = async (
    res,
    { title, message, field, status = 400, requestId },
  ) => {
    const clinicians = await User.find({
      role: "clinician",
      isActive: true,
    }).sort({ name: 1 });

    return res.status(status).render("auth/sign-up.ejs", {
      errorTitle: title,
      error: message,
      errorField: field || null,
      formData,
      clinicians,
      requestId,
    });
  };

  try {
    const { username, name, email, role } = formData;
    const { password, confirmPassword } = req.body;

    let assignedClinicianId = null;

    // --- Validation ---
    if (
      !username ||
      !name ||
      !email ||
      typeof password !== "string" ||
      password.length === 0
    ) {
      return renderSignupError(res, {
        title: "Complete the required fields",
        message: "Enter a username, full name, email address, and password to create your account.",
      });
    }

    if (!["patient", "clinician"].includes(role)) {
      return renderSignupError(res, {
        title: "Choose a valid account type",
        message: "Select Patient or Clinician and submit the form again.",
        field: "role",
      });
    }

    if (password.length < 12) {
      return renderSignupError(res, {
        title: "Choose a longer password",
        message: "For account security, passwords must be at least 12 characters. Your other entries have been kept.",
        field: "password",
      });
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      return renderSignupError(res, {
        title: "Password is too long",
        message: "Use a password no longer than 72 UTF-8 bytes, then submit again. Your other entries have been kept.",
        field: "password",
      });
    }

    if (password !== confirmPassword) {
      return renderSignupError(res, {
        title: "Passwords do not match",
        message: "Re-enter the same password in both password fields. Your other entries have been kept.",
        field: "confirmPassword",
      });
    }

    if (role === "patient" && formData.assignedClinicianId) {
      if (!mongoose.Types.ObjectId.isValid(formData.assignedClinicianId)) {
        return renderSignupError(res, {
          title: "Choose a listed clinician",
          message: "The selected clinician is no longer available. Choose another clinician, or select None.",
          field: "assignedClinicianId",
        });
      }
      const clinician = await User.findOne({
        _id: formData.assignedClinicianId,
        role: "clinician",
        isActive: true,
      });
      if (!clinician) {
        return renderSignupError(res, {
          title: "Choose a listed clinician",
          message: "The selected clinician is no longer available. Choose another clinician, or select None.",
          field: "assignedClinicianId",
        });
      }
      assignedClinicianId = clinician._id;
    }

    // Check uniqueness
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return renderSignupError(res, {
        title: "That username is already in use",
        message: "Choose a different username. Your name, email, and account type have been kept.",
        field: "username",
        status: 409,
      });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return renderSignupError(res, {
        title: "That email already has an account",
        message: "Sign in with that email's account, or use a different email address.",
        field: "email",
        status: 409,
      });
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
    const duplicateFields = err?.keyPattern || {};
    if (err?.code === 11000) {
      const duplicateField = duplicateFields.username
        ? "username"
        : duplicateFields.email
          ? "email"
          : null;
      const duplicateError =
        duplicateField === "username"
          ? {
              title: "That username is already in use",
              message: "Choose a different username. Your other entries have been kept.",
              field: "username",
              status: 409,
            }
          : duplicateField === "email"
            ? {
                title: "That email already has an account",
                message: "Sign in with that email's account, or use a different email address.",
                field: "email",
                status: 409,
              }
            : null;

      if (duplicateError) {
        return renderSignupError(res, duplicateError);
      }
    }

    logError("Account registration failed", err, res.locals.requestId);
    return renderSignupError(res, {
      title: "We couldn't create your account",
      message: "Your information was not saved. Check your connection and try again. Your name, username, email, and account type have been kept.",
      status: 500,
      requestId: res.locals.requestId,
    });
  }
});

// ─── SIGN IN ─────────────────────────────────────────────────────────────────

router.get("/sign-in", (req, res) => {
  res.render("auth/sign-in.ejs");
});

router.post("/sign-in", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const renderSigninError = (
    title,
    message,
    { status = 400, accountInactive = false } = {},
  ) =>
    res.status(status).render("auth/sign-in.ejs", {
      errorTitle: title,
      error: message,
      username,
      accountInactive,
    });

  try {
    const { password } = req.body;

    if (!username || !password) {
      return renderSigninError(
        "Enter your sign-in details",
        "Enter both your username and password. If you do not have an account yet, use Create an account below.",
      );
    }

    // Find by username
    const userInDatabase = await User.findOne({ username });
    if (!userInDatabase) {
      return renderSigninError(
        "We couldn't sign you in",
        "Check the username and password and try again. If you have not registered, create an account. Password reset is not available yet.",
        { status: 401 },
      );
    }

    // Check if account is deactivated
    if (!userInDatabase.isActive) {
      return renderSigninError(
        "This account is deactivated",
        "This account cannot sign in. Contact the administrator to request access be restored.",
        { status: 403, accountInactive: true },
      );
    }

    // Compare passwords
    const validPassword = await bcrypt.compare(password, userInDatabase.password);
    if (!validPassword) {
      return renderSigninError(
        "We couldn't sign you in",
        "Check the username and password and try again. If you have not registered, create an account. Password reset is not available yet.",
        { status: 401 },
      );
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
    logError("Sign-in failed", err, res.locals.requestId);
    res.status(500).render("auth/sign-in.ejs", {
      errorTitle: "Sign-in is temporarily unavailable",
      error: "Your account has not been changed. Wait a moment and try again. If the problem continues, share the reference below with support.",
      username,
      requestId: res.locals.requestId,
    });
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
