// imports
const express = require("express");
const app = express();
require("dotenv").config(); // Standard initialization
const mongoose = require("mongoose");
const morgan = require("morgan");
const methodOverride = require("method-override");
const session = require("express-session");

// Controllers
const authController = require("./controllers/auth.js");
const indexController = require("./controllers/index.routes.js");

// Middleware
const isSignedIn = require("./middleware/is-signed-in.js");
const passUserToView = require("./middleware/pass-user-to-view.js");

// 1. Static Files & Parsers
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));
app.use(methodOverride("_method"));

// 2. Session Configuration (Ensure SESSION_SECRET is one line in .env)
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  }),
);

// 3. Custom Middleware (Always after session)
app.use(passUserToView);

// 4. Public Routes
app.use("/auth", authController);
app.use("/", indexController);

// 5. Protected Routes (User must be signed in)
app.use(isSignedIn);

// Add your protected routes here, for example:
// app.use("/medications", medsController);

// 6. Database Connection and Server Start
async function startServer() {
  try {
    // This prevents the 'buffering timed out' error
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB successfully");

    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  } catch (error) {
    console.log("Failed to connect to the database:", error);
  }
}

startServer();
