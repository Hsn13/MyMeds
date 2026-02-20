const express = require("express");
const router = express.Router();
const User = require("../models/User.js");
const bcrypt = require("bcrypt");

// ─── SIGN UP ─────────────────────────────────────────────────────────────────

router.get("/sign-up", (req, res) => {
  res.render("auth/sign-up.ejs");
});

router.post("/sign-up", async (req, res) => {
  try {
    const { username, name, email, password, confirmPassword, role } = req.body;

    // --- Validation ---
    if (!username || !name || !email || !password) {
      return res.render("auth/sign-up.ejs", {
        error: "All fields are required.",
      });
    }

    if (password !== confirmPassword) {
      return res.render("auth/sign-up.ejs", {
        error: "Password and Confirm Password must match.",
      });
    }

    // Check uniqueness
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.render("auth/sign-up.ejs", {
        error: "Username is already taken.",
      });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.render("auth/sign-up.ejs", {
        error: "Email is already registered.",
      });
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Create user — role defaults to "patient" if not provided
    const user = await User.create({
      username,
      name,
      email,
      password: hashedPassword,
      role: role || "patient",
    });

    res.redirect("/auth/sign-in");
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong during sign up.");
  }
});

// ─── SIGN IN ─────────────────────────────────────────────────────────────────

router.get("/sign-in", (req, res) => {
  res.render("auth/sign-in.ejs");
});

router.post("/sign-in", async (req, res) => {
  try {
    const { username, password } = req.body;

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
    const validPassword = bcrypt.compareSync(password, userInDatabase.password);
    if (!validPassword) {
      return res.render("auth/sign-in.ejs", {
        error: "Login failed. Please check your credentials.",
      });
    }

    // Build session — never store password here
    req.session.user = {
      _id: userInDatabase._id.toString(),
      username: userInDatabase.username,
      name: userInDatabase.name,
      email: userInDatabase.email,
      role: userInDatabase.role,
    };

    // Redirect based on role
    if (userInDatabase.role === "clinician") {
      return res.redirect("/clinician/patients");
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong during sign in.");
  }
});

// ─── SIGN OUT ────────────────────────────────────────────────────────────────

router.get("/sign-out", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ─── PROFILE (Edit) ──────────────────────────────────────────────────────────

router.get("/profile", async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    res.render("auth/profile.ejs", { profileUser: user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading profile.");
  }
});

router.post("/profile", async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.session.user._id);

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
    console.error(err);
    res.status(500).send("Error updating profile.");
  }
});

// ─── DEACTIVATE ACCOUNT ──────────────────────────────────────────────────────

router.post("/deactivate", async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.session.user._id, { isActive: false });
    req.session.destroy();
    res.redirect("/auth/sign-in");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deactivating account.");
  }
});

module.exports = router;
