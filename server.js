// ═══════════════════════════════════════════════════════════════════════════
// MyMeds — Main Server Entry Point
// ═══════════════════════════════════════════════════════════════════════════

const express = require("express");
const app = express();
const dotenv = require("dotenv").config();
const mongoose = require("mongoose");
const morgan = require("morgan");
const session = require("express-session");
const methodOverride = require("method-override");

// ── Middleware imports ────────────────────────────────────────────────────
const passUserToView = require("./middleware/pass-user-to-view.js");
const isSignedIn = require("./middleware/is-signed-in.js");

// ── Controller imports ────────────────────────────────────────────────────
const authController = require("./controllers/auth.js");
const indexController = require("./controllers/index.routes.js");
const medicationsController = require("./controllers/medications.js");
const intakeLogsController = require("./controllers/intakeLogs.js");
const sideEffectsController = require("./controllers/sideEffects.js");
const dashboardController = require("./controllers/dashboard.js");
const clinicianController = require("./controllers/clinician.js");

// ── App-level middleware ──────────────────────────────────────────────────
app.use(express.static("public")); // serve CSS, images, etc.
app.use(express.urlencoded({ extended: false })); // parse form bodies
app.use(morgan("dev")); // HTTP request logger
app.use(methodOverride("_method")); // enables PUT/DELETE via forms

// ── Session setup ─────────────────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  }),
);

// ── Inject user into every EJS template ──────────────────────────────────
// This MUST come after session middleware and BEFORE route handlers
app.use(passUserToView);

// ── MongoDB connection ────────────────────────────────────────────────────
async function connectToDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected to MongoDB");
  } catch (error) {
    console.error("✗ MongoDB connection failed:", error);
    process.exit(1); // exit if DB is unreachable — app can't function without it
  }
}
connectToDB();

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ── Public routes (no auth required) ─────────────────────────────────────
app.use("/auth", authController); // sign-up, sign-in, sign-out
app.use("/", indexController); // homepage

// ── Protected routes (must be signed in) ──────────────────────────────────
// isSignedIn middleware is applied here — everything below requires a session
app.use(isSignedIn);

// Patient routes — any signed-in user can access these
// (clinicians get redirected away from / on the homepage, but the routes
//  themselves scope data to req.session.user._id so a clinician couldn't
//  see a patient's data even if they hit these URLs directly)
app.use("/medications", medicationsController);
app.use("/intake", intakeLogsController);
app.use("/side-effects", sideEffectsController);
app.use("/dashboard", dashboardController);

// Auth sub-routes that need session (profile, deactivate)
// These are already mounted on /auth above, but the profile/deactivate
// POST handlers inside auth.js need the user to be signed in.
// Since /auth is mounted before isSignedIn, we handle the guard inside
// the controller itself (GET /auth/profile checks req.session.user).

// Clinician routes — isClinician middleware is applied inside the router
// so only users with role === "clinician" can access these
app.use("/clinician", clinicianController);

// ── Start server ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ MyMeds server running on port ${PORT}`);
});
