const express = require("express");
const router = express.Router();
const SideEffect = require("../models/SideEffect.js");
const Medication = require("../models/Medication.js");

// Helper: verify a medication belongs to the current user
async function verifyMedicationOwnership(medicationId, userId) {
  return Medication.findOne({ _id: medicationId, userId });
}

// ─── INDEX — List all side effects for a specific medication ─────────────────
// If no medicationId query param, show ALL side effects across user's meds
router.get("/", async (req, res) => {
  try {
    const userId = req.session.user._id;

    // Get all of the user's medications (active + inactive, so we can see
    // side effects even on soft-deleted meds)
    const medications = await Medication.find({ userId }).sort({ name: 1 });
    const medicationIds = medications.map((m) => m._id);

    let filter = { medicationId: { $in: medicationIds } };

    // If filtering by a specific medication
    if (req.query.medicationId) {
      filter.medicationId = req.query.medicationId;
    }

    const sideEffects = await SideEffect.find(filter)
      .populate("medicationId", "name")
      .sort({ startDate: -1 });

    res.render("sideEffects/index.ejs", {
      sideEffects,
      medications,
      selectedMedicationId: req.query.medicationId || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading side effects.");
  }
});

// ─── NEW — Render the report form ────────────────────────────────────────────
router.get("/new", async (req, res) => {
  try {
    const medications = await Medication.find({
      userId: req.session.user._id,
      isActive: true,
    }).sort({ name: 1 });

    const selectedMedicationId = req.query.medicationId || null;

    res.render("sideEffects/new.ejs", { medications, selectedMedicationId });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading side effect form.");
  }
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { medicationId, effect, severity, startDate, endDate, notes } =
      req.body;

    if (!medicationId || !effect || !severity || !startDate) {
      const medications = await Medication.find({
        userId: req.session.user._id,
        isActive: true,
      }).sort({ name: 1 });

      return res.render("sideEffects/new.ejs", {
        medications,
        selectedMedicationId: medicationId,
        error: "Medication, effect, severity, and start date are required.",
      });
    }

    // Verify ownership
    const medication = await verifyMedicationOwnership(
      medicationId,
      req.session.user._id,
    );
    if (!medication) {
      return res
        .status(403)
        .send("You can only report side effects for your own medications.");
    }

    await SideEffect.create({
      medicationId,
      effect,
      severity: parseInt(severity),
      startDate,
      endDate: endDate || null,
      notes: notes || "",
    });

    res.redirect(`/side-effects?medicationId=${medicationId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating side effect.");
  }
});

// ─── SHOW (single side effect — optional detail view) ────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const sideEffect = await SideEffect.findById(req.params.id).populate(
      "medicationId",
    );

    if (!sideEffect) {
      return res.status(404).send("Side effect not found.");
    }

    // Verify ownership through the medication
    if (sideEffect.medicationId.userId.toString() !== req.session.user._id) {
      return res.status(403).send("Access denied.");
    }

    res.render("sideEffects/show.ejs", { sideEffect });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading side effect.");
  }
});

// ─── EDIT ─────────────────────────────────────────────────────────────────────
router.get("/:id/edit", async (req, res) => {
  try {
    const sideEffect = await SideEffect.findById(req.params.id).populate(
      "medicationId",
    );

    if (!sideEffect) {
      return res.status(404).send("Side effect not found.");
    }

    if (sideEffect.medicationId.userId.toString() !== req.session.user._id) {
      return res.status(403).send("Access denied.");
    }

    const medications = await Medication.find({
      userId: req.session.user._id,
    }).sort({ name: 1 });

    res.render("sideEffects/edit.ejs", { sideEffect, medications });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading side effect for edit.");
  }
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const sideEffect = await SideEffect.findById(req.params.id).populate(
      "medicationId",
    );

    if (!sideEffect) {
      return res.status(404).send("Side effect not found.");
    }

    if (sideEffect.medicationId.userId.toString() !== req.session.user._id) {
      return res.status(403).send("Access denied.");
    }

    const { effect, severity, startDate, endDate, notes } = req.body;

    sideEffect.effect = effect || sideEffect.effect;
    sideEffect.severity = severity ? parseInt(severity) : sideEffect.severity;
    sideEffect.startDate = startDate || sideEffect.startDate;
    sideEffect.endDate = endDate || null;
    sideEffect.notes = notes || "";

    await sideEffect.save();

    res.redirect(`/side-effects?medicationId=${sideEffect.medicationId._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating side effect.");
  }
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const sideEffect = await SideEffect.findById(req.params.id).populate(
      "medicationId",
    );

    if (!sideEffect) {
      return res.status(404).send("Side effect not found.");
    }

    if (sideEffect.medicationId.userId.toString() !== req.session.user._id) {
      return res.status(403).send("Access denied.");
    }

    const medId = sideEffect.medicationId._id;
    await SideEffect.findByIdAndDelete(req.params.id);

    res.redirect(`/side-effects?medicationId=${medId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting side effect.");
  }
});

module.exports = router;
