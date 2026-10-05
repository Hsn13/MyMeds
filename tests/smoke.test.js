const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ejs = require("ejs");
const express = require("express");
const session = require("express-session");
const User = require("../models/User.js");
const Medication = require("../models/Medication.js");
const IntakeLog = require("../models/IntakeLog.js");
const SideEffect = require("../models/SideEffect.js");
const Message = require("../models/Message.js");
const authController = require("../controllers/auth.js");
const dashboardController = require("../controllers/dashboard.js");
const messagesController = require("../controllers/messages.js");
const intakeLogsController = require("../controllers/intakeLogs.js");
const isSignedIn = require("../middleware/is-signed-in.js");
const csrfProtection = require("../middleware/csrf-protection.js");
const { buildAdherenceTrend } = require("../utils/dashboard-metrics.js");
const {
  getMedicationStatus,
  isMedicationActiveOn,
} = require("../utils/medication-status.js");
const { parseDateOnly } = require("../utils/date-only.js");

const root = path.resolve(__dirname, "..");

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
}

test("all EJS views compile and include existing partials", () => {
  const templates = listFiles(path.join(root, "views")).filter((file) =>
    file.endsWith(".ejs"),
  );

  assert.ok(templates.length > 0, "expected at least one EJS template");

  for (const file of templates) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotThrow(
      () => ejs.compile(source, { filename: file }),
      `template failed to compile: ${path.relative(root, file)}`,
    );

    for (const [, includePath] of source.matchAll(
      /include\(\s*['"]([^'"]+)['"]\s*\)/g,
    )) {
      const resolved = path.resolve(
        path.dirname(file),
        includePath.endsWith(".ejs") ? includePath : `${includePath}.ejs`,
      );
      assert.ok(
        fs.existsSync(resolved),
        `missing include ${includePath} in ${path.relative(root, file)}`,
      );
    }
  }
});

test("all full-page views reference the supplied PNG favicon", () => {
  const templates = listFiles(path.join(root, "views")).filter((file) =>
    file.endsWith(".ejs"),
  );
  const pageTemplates = templates.filter((file) =>
    fs.readFileSync(file, "utf8").includes("<head>"),
  );

  assert.ok(pageTemplates.length > 0);
  assert.equal(fs.readFileSync(path.join(root, "public", "image.png")).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  for (const file of pageTemplates) {
    assert.match(
      fs.readFileSync(file, "utf8"),
      /<link rel="icon" type="image\/png" href="\/image\.png"/,
      `favicon missing from ${path.relative(root, file)}`,
    );
  }
});

test("shared navigation includes the accessible in-app transition loader", async () => {
  const navbar = await ejs.renderFile(path.join(root, "views", "navbar.ejs"), {
    user: null,
    csrfToken: "test-token",
  });

  assert.match(navbar, /data-navigation-loader hidden aria-hidden="true"/);
  assert.match(navbar, /role="status" aria-live="polite"/);
  assert.match(navbar, /src="\/image\.png"/);
  assert.match(navbar, /Preparing your care space/);

  const script = fs.readFileSync(path.join(root, "public", "js", "app.js"), "utf8");
  assert.match(script, /destination\.origin !== window\.location\.origin/);
  assert.match(script, /window\.addEventListener\("pageshow"/);
});

test("controller render targets exist", () => {
  const controllers = listFiles(path.join(root, "controllers")).filter((file) =>
    file.endsWith(".js"),
  );

  for (const file of controllers) {
    const source = fs.readFileSync(file, "utf8");
    for (const [, template] of source.matchAll(
      /res\.render\(\s*["']([^"']+\.ejs)["']/g,
    )) {
      assert.ok(
        fs.existsSync(path.join(root, "views", template)),
        `missing render target ${template} in ${path.relative(root, file)}`,
      );
    }
  }
});

test("application pages render with empty and example data", async () => {
  const date = new Date("2026-01-15T00:00:00.000Z");
  const medication = {
    _id: "medication-id",
    name: "Example medication",
    dosage: "10 mg",
    frequency: "Once daily",
    startDate: date,
    endDate: null,
    instructions: "",
    isActive: true,
  };
  const sideEffect = {
    _id: "side-effect-id",
    medicationId: { _id: medication._id, name: medication.name },
    effect: "Nausea",
    severity: 1,
    startDate: date,
    endDate: null,
    notes: "",
  };
  const pages = {
    "homepage.ejs": {
      user: null,
      todaySummary: null,
      recentSideEffects: [],
    },
    "auth/sign-in.ejs": { user: null },
    "auth/sign-up.ejs": { user: null, clinicians: [] },
    "auth/profile.ejs": {
      user: null,
      profileUser: { username: "example", role: "patient", name: "Example", email: "example@example.test" },
    },
    "medications/index.ejs": {
      user: null,
      medications: [],
      medicationStatuses: new Map(),
      showInactive: false,
    },
    "medications/new.ejs": { user: null },
    "medications/edit.ejs": { user: null, medication },
    "medications/show.ejs": { user: null, medication, medicationStatus: "Active" },
    "intake/index.ejs": { user: null, medications: [], logs: [], logMap: {}, selectedDate: date },
    "intake/new.ejs": { user: null, medications: [], selectedMedicationId: null, selectedDate: "2026-01-15" },
    "intake/edit.ejs": {
      user: null,
      medications: [],
      log: { _id: "log-id", date, medicationId: { name: medication.name }, status: "taken", notes: "" },
    },
    "sideEffects/index.ejs": { user: null, medications: [], sideEffects: [], selectedMedicationId: null },
    "sideEffects/new.ejs": { user: null, medications: [], selectedMedicationId: null },
    "sideEffects/edit.ejs": { user: null, sideEffect, medications: [] },
    "sideEffects/show.ejs": { user: null, sideEffect },
    "dashboard.ejs": {
      user: null,
      adherenceScore: 0,
      activeMedCount: 0,
      missedDoseStreak: 0,
      mostMissedMedication: null,
      severityData: [0, 0, 0, 0, 0],
      weeklyTrend: [],
      pieData: { taken: 0, missed: 0, late: 0 },
      totalLogs: 0,
      medications: [],
      selectedMedicationId: "",
      range: "7",
      fromDate: "2026-01-09",
      toDate: "2026-01-15",
      filterError: null,
    },
    "clinician/patients.ejs": { user: null, patients: [] },
    "clinician/patient-detail.ejs": {
      user: null,
      patient: { name: "Example", username: "example", email: "example@example.test" },
      adherenceScore: 0,
      medications: [],
      intakeLogs: [],
      sideEffects: [],
      medicationStatuses: new Map(),
    },
    "messages/inbox.ejs": {
      user: null,
      role: "patient",
      threads: [],
      clinician: null,
      unreadCount: 0,
    },
    "messages/thread.ejs": {
      user: null,
      patient: null,
      clinician: null,
      messages: [],
      currentUserId: "user-id",
      error: null,
      validationError: false,
      canCompose: false,
    },
  };

  for (const [template, locals] of Object.entries(pages)) {
    const html = await ejs.renderFile(
      path.join(root, "views", template),
      { csrfToken: "a".repeat(64), cspNonce: "test-nonce", ...locals },
    );
    assert.match(html, /<!doctype html>/i, `page failed to render: ${template}`);
    if (/method="POST"/i.test(html)) {
      assert.match(
        html,
        /name="_csrf"/,
        `state-changing form has no CSRF token: ${template}`,
      );
    }
  }
});

test("medication status follows UTC calendar dates and manual visibility", () => {
  const medication = {
    isActive: true,
    startDate: new Date("2026-01-10T00:00:00.000Z"),
    endDate: new Date("2026-01-12T00:00:00.000Z"),
  };

  assert.equal(getMedicationStatus(medication, new Date("2026-01-09T23:59:00Z")), "Scheduled");
  assert.equal(getMedicationStatus(medication, new Date("2026-01-10T23:59:00Z")), "Active");
  assert.equal(getMedicationStatus(medication, new Date("2026-01-12T23:59:00Z")), "Active");
  assert.equal(getMedicationStatus(medication, new Date("2026-01-13T00:00:00Z")), "Ended");
  assert.equal(isMedicationActiveOn(medication, new Date("2026-01-12T12:00:00Z")), true);
  assert.equal(isMedicationActiveOn(medication, new Date("2026-01-13T00:00:00Z")), false);
  assert.equal(
    getMedicationStatus({ ...medication, isActive: false }, new Date("2026-01-11T00:00:00Z")),
    "Inactive",
  );
});

test("date-only parsing rejects impossible calendar dates", () => {
  assert.equal(
    parseDateOnly("2024-02-29")?.toISOString(),
    "2024-02-29T00:00:00.000Z",
  );
  assert.equal(parseDateOnly("2025-02-29"), null);
  assert.equal(parseDateOnly("2026-13-01"), null);
  assert.equal(parseDateOnly(["2026-01-01"]), null);
});

test("analytics trend leaves unrecorded days empty and calculates daily percentages", () => {
  const logs = [
    { date: new Date("2026-01-14T00:00:00Z"), status: "taken" },
    { date: new Date("2026-01-14T00:00:00Z"), status: "missed" },
    { date: new Date("2026-01-15T00:00:00Z"), status: "missed" },
  ];
  const trend = buildAdherenceTrend(
    logs,
    new Date("2026-01-13T00:00:00Z"),
    new Date("2026-01-15T00:00:00Z"),
  );

  assert.deepEqual(trend.map(({ date, adherence }) => [date, adherence]), [
    ["2026-01-13", null],
    ["2026-01-14", 50],
    ["2026-01-15", 0],
  ]);
});

test("dashboard filters remain scoped to the signed-in user's medication records", async (t) => {
  const originals = {
    medicationFind: Medication.find,
    intakeFind: IntakeLog.find,
    sideEffectFind: SideEffect.find,
  };
  const ownerId = "owner-id";
  const meds = [
    {
      _id: "med-a",
      userId: ownerId,
      name: "Medication A",
      startDate: new Date("2020-01-01T00:00:00Z"),
      endDate: null,
      isActive: true,
    },
    {
      _id: "med-b",
      userId: ownerId,
      name: "Medication B",
      startDate: new Date("2020-01-01T00:00:00Z"),
      endDate: null,
      isActive: true,
    },
  ];
  let medicationFilter;
  let logFilter;
  Medication.find = (filter) => {
    medicationFilter = filter;
    return { sort: async () => meds };
  };
  IntakeLog.find = (filter) => {
    logFilter = filter;
    return {
      lean: async () => [
        { medicationId: "med-a", date: new Date(), status: "taken" },
        { medicationId: "med-a", date: new Date(), status: "missed" },
      ],
    };
  };
  SideEffect.find = (filter) => {
    assert.deepEqual(filter.medicationId.$in, ["med-a"]);
    return { lean: async () => [] };
  };

  const app = express();
  app.set("views", path.join(root, "views"));
  app.set("view engine", "ejs");
  app.use((req, res, next) => {
    req.session = { user: { _id: ownerId, role: "patient" } };
    res.locals.user = req.session.user;
    res.locals.csrfToken = "test-token";
    res.locals.cspNonce = "test-nonce";
    next();
  });
  app.use("/dashboard", dashboardController);
  const server = app.listen(0);
  t.after(() => {
    server.close();
    Medication.find = originals.medicationFind;
    IntakeLog.find = originals.intakeFind;
    SideEffect.find = originals.sideEffectFind;
  });

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/dashboard?range=30&medicationId=med-a`,
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(medicationFilter, { userId: ownerId });
  assert.deepEqual(logFilter.medicationId.$in, ["med-a"]);
  assert.equal(
    (logFilter.date.$lt.getTime() - logFilter.date.$gte.getTime()) / 86_400_000,
    30,
  );
  assert.match(html, /Medication A/);
  assert.match(html, /Medication B/); // Both owned medications remain available in the filter.
});

test("intake entries cannot be recorded outside a medication date range", async (t) => {
  const originalFindOne = Medication.findOne;
  const originalLogFindOne = IntakeLog.findOne;
  const originalCreate = IntakeLog.create;
  let createCalled = false;
  Medication.findOne = async () => ({
    isActive: true,
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: new Date("2026-01-10T00:00:00Z"),
  });
  IntakeLog.findOne = async () => null;
  IntakeLog.create = async () => {
    createCalled = true;
  };

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { user: { _id: "owner-id" } };
    next();
  });
  app.use("/intake", intakeLogsController);
  const server = app.listen(0);
  t.after(() => {
    server.close();
    Medication.findOne = originalFindOne;
    IntakeLog.findOne = originalLogFindOne;
    IntakeLog.create = originalCreate;
  });

  const origin = `http://127.0.0.1:${server.address().port}/intake`;
  const invalidDate = await fetch(origin, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      medicationId: "med-a",
      date: "2026-02-30",
      status: "taken",
    }),
  });
  assert.equal(invalidDate.status, 400);

  const endedCourse = await fetch(origin, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      medicationId: "med-a",
      date: "2026-01-11",
      status: "taken",
    }),
  });
  assert.equal(endedCourse.status, 400);
  assert.match(await endedCourse.text(), /active date range/);
  assert.equal(createCalled, false);
});

test("messaging rejects unassigned patient access and patient-only review flags", async (t) => {
  const originalFindOne = User.findOne;
  const originalCreate = Message.create;
  let createCalled = false;
  let currentUser = {
    _id: "clinician-id",
    role: "clinician",
    name: "Example Clinician",
  };
  User.findOne = () => ({ select: async () => null });
  Message.create = async () => {
    createCalled = true;
  };

  const app = express();
  app.set("views", path.join(root, "views"));
  app.set("view engine", "ejs");
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { user: currentUser };
    res.locals.user = req.session.user;
    res.locals.csrfToken = "test-token";
    res.locals.cspNonce = "test-nonce";
    next();
  });
  app.use("/messages", messagesController);
  const server = app.listen(0);
  t.after(() => {
    server.close();
    User.findOne = originalFindOne;
    Message.create = originalCreate;
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const assignedPatientId = "012345678901234567890123";
  const inaccessible = await fetch(
    `${origin}/messages/thread/${assignedPatientId}`,
  );
  assert.equal(inaccessible.status, 404);
  assert.match(await inaccessible.text(), /Messaging is available only/);
  assert.equal(createCalled, false);

  const unauthorizedPost = await fetch(
    `${origin}/messages/thread/${assignedPatientId}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ body: "A private test message" }),
      redirect: "manual",
    },
  );
  assert.equal(unauthorizedPost.status, 404);
  assert.equal(createCalled, false);

  currentUser = {
    _id: "patient-id",
    role: "patient",
    name: "Example Patient",
    assignedClinicianId: "clinician-id",
  };
  const forbiddenReviewFlag = await fetch(`${origin}/messages/thread`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      type: "review_flag",
      body: "Patients cannot create clinician review flags.",
    }),
    redirect: "manual",
  });
  assert.equal(forbiddenReviewFlag.status, 302);
  assert.equal(
    forbiddenReviewFlag.headers.get("location"),
    "/messages/thread?error=invalid",
  );
  assert.equal(createCalled, false);
});

test("CSRF middleware issues session tokens and rejects invalid submissions", () => {
  const session = {};
  const response = {
    locals: {},
    statusCode: 200,
    body: "",
    set() {
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  csrfProtection(
    { method: "GET", session },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  assert.match(session.csrfToken, /^[a-f0-9]{64}$/);
  assert.equal(response.locals.csrfToken, session.csrfToken);

  nextCalled = false;
  csrfProtection(
    { method: "POST", session, body: {}, get: () => undefined },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);

  csrfProtection(
    {
      method: "POST",
      session,
      body: { _csrf: session.csrfToken },
      get: () => undefined,
    },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  assert.equal(response.locals.csrfToken, session.csrfToken);
});

test("all POST forms include the shared CSRF field", () => {
  const templates = listFiles(path.join(root, "views")).filter((file) =>
    file.endsWith(".ejs"),
  );
  for (const file of templates) {
    const source = fs.readFileSync(file, "utf8");
    if (/<form\b[^>]*method=["']POST["']/i.test(source)) {
      assert.match(
        source,
        /include\(['"](?:\.\.\/)?csrf-field['"]\)/,
        `POST form is missing the CSRF field: ${path.relative(root, file)}`,
      );
    }
  }
});

test("clinician registration accepts a valid form and persists the selected role", async (t) => {
  const originalFind = User.find;
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let createdUser;
  let duplicateLookup = null;

  User.find = () => ({ sort: async () => [] });
  User.findOne = async (query) => {
    if (duplicateLookup?.username && duplicateLookup.username === query.username) {
      return { username: query.username };
    }
    if (duplicateLookup?.email && duplicateLookup.email === query.email) {
      return { email: query.email };
    }
    return null;
  };
  User.create = async (user) => {
    createdUser = user;
    return user;
  };

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: "test-only-session-secret-with-sufficient-length",
      resave: false,
      saveUninitialized: true,
    }),
  );
  app.use(csrfProtection);
  app.use((req, res, next) => {
    res.locals.user = null;
    next();
  });
  app.use("/auth", authController);

  const server = app.listen(0);
  t.after(async () => {
    server.close();
    User.find = originalFind;
    User.findOne = originalFindOne;
    User.create = originalCreate;
  });

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const signUpPage = await fetch(`${origin}/auth/sign-up`);
  assert.equal(signUpPage.status, 200);

  const cookie = signUpPage.headers.get("set-cookie")?.split(";")[0];
  const html = await signUpPage.text();
  const csrfToken = html.match(/name="_csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(cookie, "signup page should create a session cookie");
  assert.ok(csrfToken, "signup page should provide a CSRF token");

  const form = new URLSearchParams({
    _csrf: csrfToken,
    username: "smoke-clinician",
    name: "Smoke Clinician",
    email: "smoke-clinician@example.test",
    password: "synthetic-clinician-password",
    confirmPassword: "synthetic-clinician-password",
    role: "clinician",
  });
  const response = await fetch(`${origin}/auth/sign-up`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
    redirect: "manual",
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/auth/sign-in");
  assert.equal(createdUser.role, "clinician");
  assert.equal(createdUser.assignedClinicianId, null);
  assert.notEqual(createdUser.password, "synthetic-clinician-password");

  const submitSignup = async (values) =>
    fetch(`${origin}/auth/sign-up`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ _csrf: csrfToken, ...values }),
      redirect: "manual",
    });

  const sameNameSignup = await submitSignup({
    username: "another-clinician",
    name: "Smoke Clinician",
    email: "another-clinician@example.test",
    password: "synthetic-clinician-password",
    confirmPassword: "synthetic-clinician-password",
    role: "clinician",
  });
  assert.equal(sameNameSignup.status, 302);
  assert.equal(createdUser.name, "Smoke Clinician");
  assert.equal(createdUser.username, "another-clinician");

  duplicateLookup = { username: "already-used" };
  const duplicateUsername = await submitSignup({
    username: "already-used",
    name: "Same Full Name",
    email: "new-clinician@example.test",
    password: "synthetic-clinician-password",
    confirmPassword: "synthetic-clinician-password",
    role: "clinician",
  });
  assert.equal(duplicateUsername.status, 409);
  const duplicateUsernameHtml = await duplicateUsername.text();
  assert.match(duplicateUsernameHtml, /That username is already in use/);
  assert.match(duplicateUsernameHtml, /Choose a different username/);
  assert.match(duplicateUsernameHtml, /value="already-used"/);
  assert.match(duplicateUsernameHtml, /value="Same Full Name"/);
  assert.match(duplicateUsernameHtml, /value="new-clinician@example\.test"/);
  assert.match(duplicateUsernameHtml, /Clinician — view records[^<]*<\/option>/);
  assert.doesNotMatch(duplicateUsernameHtml, /value="synthetic-clinician-password"/);

  duplicateLookup = { email: "already-used@example.test" };
  const duplicateEmail = await submitSignup({
    username: "different-user",
    name: "Same Full Name",
    email: "already-used@example.test",
    password: "synthetic-clinician-password",
    confirmPassword: "synthetic-clinician-password",
    role: "clinician",
  });
  assert.equal(duplicateEmail.status, 409);
  const duplicateEmailHtml = await duplicateEmail.text();
  assert.match(duplicateEmailHtml, /That email already has an account/);
  assert.match(duplicateEmailHtml, /Sign in/);
  assert.match(duplicateEmailHtml, /value="different-user"/);

  duplicateLookup = null;
  const originalCreateMock = User.create;
  User.create = async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    error.keyPattern = { username: 1 };
    throw error;
  };
  const duplicateRace = await submitSignup({
    username: "new-unavailable",
    name: "Same Full Name",
    email: "another-email@example.test",
    password: "synthetic-clinician-password",
    confirmPassword: "synthetic-clinician-password",
    role: "clinician",
  });
  assert.equal(duplicateRace.status, 409);
  assert.match(await duplicateRace.text(), /That username is already in use/);
  User.create = originalCreateMock;
});

test("sign-in failures show instructions and keep the username", async (t) => {
  const originalFindOne = User.findOne;
  User.findOne = async () => null;

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: "test-only-session-secret-with-sufficient-length",
      resave: false,
      saveUninitialized: true,
    }),
  );
  app.use(csrfProtection);
  app.use((req, res, next) => {
    res.locals.user = null;
    next();
  });
  app.use("/auth", authController);
  const server = app.listen(0);

  t.after(() => {
    server.close();
    User.findOne = originalFindOne;
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${origin}/auth/sign-in`);
  const cookie = page.headers.get("set-cookie")?.split(";")[0];
  const html = await page.text();
  const csrfToken = html.match(/name="_csrf" value="([a-f0-9]{64})"/)?.[1];
  const response = await fetch(`${origin}/auth/sign-in`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      _csrf: csrfToken,
      username: "unknown-account",
      password: "synthetic-invalid-password",
    }),
  });
  const responseHtml = await response.text();

  assert.equal(response.status, 401);
  assert.match(responseHtml, /We couldn&#39;t sign you in/);
  assert.match(responseHtml, /Check your username and password/);
  assert.match(responseHtml, /Password reset is not available yet/);
  assert.match(responseHtml, /value="unknown-account"/);
  assert.doesNotMatch(responseHtml, /value="synthetic-invalid-password"/);
});

test("sign-in middleware permits sessions and redirects guests", () => {
  let nextCalled = false;
  isSignedIn(
    { session: { user: { _id: "test-user" } } },
    { redirect() { assert.fail("signed-in users should not be redirected"); } },
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);

  let redirectPath;
  isSignedIn(
    { session: {} },
    { redirect(pathname) { redirectPath = pathname; } },
    () => assert.fail("guests should not reach protected routes"),
  );
  assert.equal(redirectPath, "/auth/sign-in");
});
