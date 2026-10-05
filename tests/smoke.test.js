const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ejs = require("ejs");
const isSignedIn = require("../middleware/is-signed-in.js");
const csrfProtection = require("../middleware/csrf-protection.js");

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
    "homepage.ejs": { user: null },
    "auth/sign-in.ejs": { user: null },
    "auth/sign-up.ejs": { user: null, clinicians: [] },
    "auth/profile.ejs": {
      user: null,
      profileUser: { username: "example", role: "patient", name: "Example", email: "example@example.test" },
    },
    "medications/index.ejs": { user: null, medications: [], showInactive: false },
    "medications/new.ejs": { user: null },
    "medications/edit.ejs": { user: null, medication },
    "medications/show.ejs": { user: null, medication },
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
    },
    "clinician/patients.ejs": { user: null, patients: [] },
    "clinician/patient-detail.ejs": {
      user: null,
      patient: { name: "Example", username: "example", email: "example@example.test" },
      adherenceScore: 0,
      medications: [],
      intakeLogs: [],
      sideEffects: [],
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
