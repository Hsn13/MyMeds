const express = require("express");
const router = express.Router();
const Medication = require("../models/Medication.js");

// ─── INDEX — List all medications for the current user ───────────────────────
// Default: show only active. If query param showInactive=true, show all.
router.get("/", async (req, res) => {
  try {
    const showInactive = req.query.showInactive === "true";

    const filter = { userId: req.session.user._id };
    if (!showInactive) {
      filter.isActive = true; // hide soft-deleted by default
    }

    const medications = await Medication.find(filter).sort({ createdAt: -1 });
    res.render("medications/index.ejs", { medications, showInactive });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading medications.");
  }
});

// ─── NEW — Render the "Add Medication" form ──────────────────────────────────
router.get("/new", (req, res) => {
  res.render("medications/new.ejs");
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, dosage, frequency, startDate, endDate, instructions } =
      req.body;

    // Basic validation
    if (!name || !dosage || !frequency || !startDate) {
      return res.render("medications/new.ejs", {
        error: "Name, dosage, frequency, and start date are required.",
      });
    }

    await Medication.create({
      userId: req.session.user._id,
      name,
      dosage,
      frequency,
      startDate,
      endDate: endDate || null, // empty string → null (means ongoing)
      instructions: instructions || "",
      isActive: true,
    });

    res.redirect("/medications");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating medication.");
  }
});

// ─── SHOW — Detail view of a single medication ──────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const medication = await Medication.findOne({
      _id: req.params.id,
      userId: req.session.user._id, // security: only own meds
    });

    if (!medication) {
      return res.status(404).send("Medication not found.");
    }

    res.render("medications/show.ejs", { medication });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading medication.");
  }
});

// ─── EDIT — Render the edit form pre-filled ──────────────────────────────────
router.get("/:id/edit", async (req, res) => {
  try {
    const medication = await Medication.findOne({
      _id: req.params.id,
      userId: req.session.user._id,
    });

    if (!medication) {
      return res.status(404).send("Medication not found.");
    }

    res.render("medications/edit.ejs", { medication });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading medication for edit.");
  }
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const medication = await Medication.findOne({
      _id: req.params.id,
      userId: req.session.user._id,
    });

    if (!medication) {
      return res.status(404).send("Medication not found.");
    }

    const {
      name,
      dosage,
      frequency,
      startDate,
      endDate,
      instructions,
      isActive,
    } = req.body;

    medication.name = name || medication.name;
    medication.dosage = dosage || medication.dosage;
    medication.frequency = frequency || medication.frequency;
    medication.startDate = startDate || medication.startDate;
    medication.endDate = endDate || null;
    medication.instructions = instructions || "";
    // isActive comes from the edit form (checkbox)
    medication.isActive = isActive === "true";

    await medication.save();
    res.redirect("/medications");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating medication.");
  }
});

// ─── DELETE (Soft Delete) ─────────────────────────────────────────────────────
// Sets isActive = false instead of removing the document.
// This preserves history for intake logs and side effects linked to this med.
router.delete("/:id", async (req, res) => {
  try {
    const medication = await Medication.findOne({
      _id: req.params.id,
      userId: req.session.user._id,
    });

    if (!medication) {
      return res.status(404).send("Medication not found.");
    }

    medication.isActive = false;
    await medication.save();

    res.redirect("/medications");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting medication.");
  }
});

module.exports = router;
