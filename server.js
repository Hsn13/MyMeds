const crypto = require("node:crypto");
const express = require("express");
const path = require("node:path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const morgan = require("morgan");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const methodOverride = require("method-override");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

dotenv.config();

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = "mymeds.sid";

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(18).toString("base64");
  const nonce = res.locals.cspNonce;
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  next();
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  morgan((tokens, req, res) =>
    [
      tokens.method(req, res),
      req.path,
      tokens.status(req, res),
      `${tokens["response-time"](req, res)} ms`,
    ].join(" "),
  ),
);
app.use(express.static("public"));
app.get("/vendor/chart.umd.js", (req, res) => {
  const chartBundle = path.join(
    path.dirname(require.resolve("chart.js")),
    "chart.umd.js",
  );
  res.sendFile(chartBundle);
});
app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use(methodOverride("_method"));

app.get("/healthz", (req, res) => {
  const isReady = mongoose.connection.readyState === 1;
  res.status(isReady ? 200 : 503).json({ status: isReady ? "ok" : "unavailable" });
});

function addApplicationMiddleware() {
  const csrfProtection = require("./middleware/csrf-protection.js");
  const passUserToView = require("./middleware/pass-user-to-view.js");
  const isSignedIn = require("./middleware/is-signed-in.js");
  const authController = require("./controllers/auth.js");
  const indexController = require("./controllers/index.routes.js");
  const medicationsController = require("./controllers/medications.js");
  const intakeLogsController = require("./controllers/intakeLogs.js");
  const sideEffectsController = require("./controllers/sideEffects.js");
  const dashboardController = require("./controllers/dashboard.js");
  const clinicianController = require("./controllers/clinician.js");

  app.use(
    session({
      name: sessionCookieName,
      secret: process.env.SESSION_SECRET,
      store: MongoStore.create({
        clientPromise: Promise.resolve(mongoose.connection.getClient()),
        collectionName: "sessions",
        ttl: 7 * 24 * 60 * 60,
      }),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(csrfProtection);
  app.use(passUserToView);

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many attempts. Please try again later.",
  });

  app.use("/auth/sign-in", (req, res, next) =>
    req.method === "POST" ? authRateLimit(req, res, next) : next(),
  );
  app.use("/auth/sign-up", (req, res, next) =>
    req.method === "POST" ? authRateLimit(req, res, next) : next(),
  );

  app.use("/auth", authController);
  app.use("/", indexController);

  app.use("/medications", isSignedIn, medicationsController);
  app.use("/intake", isSignedIn, intakeLogsController);
  app.use("/side-effects", isSignedIn, sideEffectsController);
  app.use("/dashboard", isSignedIn, dashboardController);
  app.use("/clinician", isSignedIn, clinicianController);

  app.use((req, res) => {
    res.status(404).send("Page not found.");
  });

  app.use((err, req, res, next) => {
    console.error("Unhandled request error:", err.name || "Error");
    if (res.headersSent) return next(err);
    res.status(500).send("An unexpected error occurred.");
  });
}

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI must be configured.");
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  addApplicationMiddleware();

  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`MyMeds server listening on port ${port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received; shutting down.`);
    server.close(async (error) => {
      if (error) {
        console.error("HTTP server shutdown failed:", error.name || "Error");
        process.exitCode = 1;
      }
      await mongoose.disconnect();
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((error) => {
  console.error("Application startup failed:", error.name || "Error");
  process.exitCode = 1;
});
