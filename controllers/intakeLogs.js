const express = require("express");
const router = express.Router();
const IntakeLog = require("../models/IntakeLog.js");
const Medication = require("../models/Medication.js");

// Helper: get only the date part (midnight UTC) for consistent date matching
function normalizeDate(dateString) {
  const d = new Date(dateString);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Helper: get all active medications for the current user
async function getUserMedications(userId) {
  return Medication.find({ userId, isActive: true }).sort({ name: 1 });
}

// ─── INDEX — Calendar view of intake logs ────────────────────────────────────
// Shows logs for a specific date (defaults to today)
router.get("/", async (req, res) => {
  try {
    // If a date is provided in the query, use it; otherwise use today
    const selectedDate = req.query.date
      ? normalizeDate(req.query.date)
      : normalizeDate(new Date().toISOString().split("T")[0]);

    const medications = await getUserMedications(req.session.user._id);

    // Get all intake logs for the selected date across user's medications
    const medicationIds = medications.map((m) => m._id);
    const logs = await IntakeLog.find({
      medicationId: { $in: medicationIds },
      date: selectedDate,
    }).populate("medicationId", "name");

    // Build a map: medicationId → log (for easy lookup in the view)
    const logMap = {};
    logs.forEach((log) => {
      logMap[log.medicationId._id.toString()] = log;
    });

    res.render("intake/index.ejs", {
      medications,
      logs,
      logMap,
      selectedDate,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading intake logs.");
  }
});

// ─── NEW — Form to log intake for a specific medication ──────────────────────
router.get("/new", async (req, res) => {
  try {
    const medications = await getUserMedications(req.session.user._id);
    // Pre-select a medication if passed via query param
    const selectedMedicationId = req.query.medicationId || null;
    const selectedDate =
      req.query.date || new Date().toISOString().split("T")[0];

    res.render("intake/new.ejs", {
      medications,
      selectedMedicationId,
      selectedDate,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading intake form.");
  }
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { medicationId, date, status, notes } = req.body;

    if (!medicationId || !date || !status) {
      return res.render("intake/new.ejs", {
        medications: await getUserMedications(req.session.user._id),
        selectedMedicationId: medicationId,
        selectedDate: date,
        error: "Medication, date, and status are required.",
      });
    }

    // Verify the medication belongs to this user
    const medication = await Medication.findOne({
      _id: medicationId,
      userId: req.session.user._id,
    });
    if (!medication) {
      return res
        .status(403)
        .send("You can only log intake for your own medications.");
    }

    const normalizedDate = normalizeDate(date);

    // Check if a log already exists for this medication on this date
    const existing = await IntakeLog.findOne({
      medicationId,
      date: normalizedDate,
    });

    if (existing) {
      // Update the existing log instead of creating a duplicate
      existing.status = status;
      existing.notes = notes || "";
      await existing.save();
    } else {
      await IntakeLog.create({
        medicationId,
        date: normalizedDate,
        status,
        notes: notes || "",
      });
    }

    // Redirect back to the calendar for the same date
    res.redirect(`/intake?date=${date}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating intake log.");
  }
});

// ─── EDIT — Form to update an existing intake log ────────────────────────────
router.get("/:id/edit", async (req, res) => {
  try {
    const log = await IntakeLog.findById(req.params.id).populate(
      "medicationId",
    );

    if (!log) {
      return res.status(404).send("Intake log not found.");
    }

    // Security: verify this log belongs to the current user
    if (log.medicationId.userId.toString() !== req.session.user._id) {
      return res.status(403).send("Access denied.");
    }

    const medications = await getUserMedications(req.session.user._id);

    res.render("intake/edit.ejs", { log, medications });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading intake log for edit.");
  }
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const log = await IntakeLog.findById(req.params.id).populate(
      "medicationId",
    );

    if (!log) {
      return res.status(404).send("Intake log not found.");
    }

    if (log.medicationId.userId.toString() !== req.session.user._id) {
      return res.status(403).send("Access denied.");
    }

    const { status, notes } = req.body;
    log.status = status || log.status;
    log.notes = notes || "";
    await log.save();

    const dateStr = log.date.toISOString().split("T")[0];
    res.redirect(`/intake?date=${dateStr}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating intake log.");
  }
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const log = await IntakeLog.findById(req.params.id).populate(
      "medicationId",
    );

    if (!log) {
      return res.status(404).send("Intake log not found.");
    }

    if (log.medicationId.userId.toString() !== req.session.user._id) {
      return res.status(403).send("Access denied.");
    }

    const dateStr = log.date.toISOString().split("T")[0];
    await IntakeLog.findByIdAndDelete(req.params.id);

    res.redirect(`/intake?date=${dateStr}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting intake log.");
  }
});

module.exports = router;
