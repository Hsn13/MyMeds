const router = require("express").Router();
const Medication = require("../models/Medication.js");
const IntakeLog = require("../models/IntakeLog.js");
const SideEffect = require("../models/SideEffect.js");
const logError = require("../utils/log-error.js");
const { getMedicationStatus, startOfUtcDay } = require("../utils/medication-status.js");

router.get("/", async (req, res) => {
  // If user is a clinician, redirect them to their patient list
  if (req.session.user && req.session.user.role === "clinician") {
    return res.redirect("/clinician/patients");
  }

  if (!req.session.user) {
    return res.render("homepage.ejs", { todaySummary: null, recentSideEffects: [] });
  }

  try {
    const userId = req.session.user._id;
    const today = startOfUtcDay();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const medications = await Medication.find({ userId }).sort({ name: 1 });
    const activeMedications = medications.filter(
      (medication) => getMedicationStatus(medication, today) === "Active",
    );
    const medicationIds = medications.map((medication) => medication._id);
    const [todayLogs, recentSideEffects] = medicationIds.length
      ? await Promise.all([
          IntakeLog.find({
            medicationId: { $in: medicationIds },
            date: { $gte: today, $lt: tomorrow },
          })
            .populate("medicationId", "name")
            .sort({ updatedAt: -1 }),
          SideEffect.find({ medicationId: { $in: medicationIds } })
            .populate("medicationId", "name")
            .sort({ startDate: -1 })
            .limit(3),
        ])
      : [[], []];

    const summary = {
      activeMedicationCount: activeMedications.length,
      medicationCount: medications.length,
      loggedCount: todayLogs.length,
      unloggedCount: Math.max(activeMedications.length - todayLogs.length, 0),
      missedCount: todayLogs.filter((log) => log.status === "missed").length,
      recentLogs: todayLogs.slice(0, 4),
    };

    res.render("homepage.ejs", { todaySummary: summary, recentSideEffects });
  } catch (err) {
    logError("Patient home loading failed", err, res.locals.requestId);
    res.status(500).send("Unable to load your overview. Please try again.");
  }
});

module.exports = router;
