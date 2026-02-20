const express = require("express");
const router = express.Router();
const isClinician = require("../middleware/is-clinician.js");
const User = require("../models/User.js");
const Medication = require("../models/Medication.js");
const IntakeLog = require("../models/IntakeLog.js");
const SideEffect = require("../models/SideEffect.js");

// Apply isClinician middleware to ALL routes in this router
router.use(isClinician);

// ─── PATIENTS LIST — All patients assigned to this clinician ─────────────────
router.get("/patients", async (req, res) => {
  try {
    const patients = await User.find({
      role: "patient",
      assignedClinicianId: req.session.user._id,
      isActive: true,
    }).sort({ name: 1 });

    res.render("clinician/patients.ejs", { patients });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading patients.");
  }
});

// ─── PATIENT DETAIL — Read-only view of a single patient's full data ─────────
router.get("/patients/:patientId", async (req, res) => {
  try {
    // Verify this patient is assigned to the current clinician
    const patient = await User.findOne({
      _id: req.params.patientId,
      role: "patient",
      assignedClinicianId: req.session.user._id,
    });

    if (!patient) {
      return res.status(404).send("Patient not found or not assigned to you.");
    }

    // Load all their data (read-only)
    const medications = await Medication.find({ userId: patient._id }).sort({
      createdAt: -1,
    });
    const medicationIds = medications.map((m) => m._id);

    const intakeLogs = await IntakeLog.find({
      medicationId: { $in: medicationIds },
    })
      .populate("medicationId", "name")
      .sort({ date: -1 })
      .limit(30); // last 30 logs

    const sideEffects = await SideEffect.find({
      medicationId: { $in: medicationIds },
    })
      .populate("medicationId", "name")
      .sort({ startDate: -1 });

    // Quick adherence calc for this patient
    const totalLogs = await IntakeLog.countDocuments({
      medicationId: { $in: medicationIds },
    });
    const takenLogs = await IntakeLog.countDocuments({
      medicationId: { $in: medicationIds },
      status: "taken",
    });
    const adherenceScore =
      totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : 0;

    res.render("clinician/patient-detail.ejs", {
      patient,
      medications,
      intakeLogs,
      sideEffects,
      adherenceScore,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading patient detail.");
  }
});

module.exports = router;
