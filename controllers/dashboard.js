const express = require("express");
const router = express.Router();
const Medication = require("../models/Medication.js");
const IntakeLog = require("../models/IntakeLog.js");
const SideEffect = require("../models/SideEffect.js");
const logError = require("../utils/log-error.js");
const { getMedicationStatus, startOfUtcDay } = require("../utils/medication-status.js");
const { buildAdherenceTrend } = require("../utils/dashboard-metrics.js");
const { parseDateOnly } = require("../utils/date-only.js");

const DAY_MS = 86_400_000;

router.get("/", async (req, res) => {
  try {
    const userId = req.session.user._id;
    const medications = await Medication.find({ userId }).sort({ name: 1 });
    const today = startOfUtcDay();
    const range = ["7", "30", "90", "custom"].includes(req.query.range)
      ? req.query.range
      : "7";
    let startDate = new Date(today);
    let endDate = new Date(today);
    let filterError = null;

    if (range === "custom") {
      const requestedStartDate = parseDateOnly(req.query.from);
      const requestedEndDate = parseDateOnly(req.query.to);
      if (
        requestedStartDate &&
        requestedEndDate &&
        req.query.from <= req.query.to &&
        req.query.to <= today.toISOString().slice(0, 10)
      ) {
        startDate = requestedStartDate;
        endDate = requestedEndDate;
        if ((endDate - startDate) / DAY_MS > 365) {
          startDate = new Date(endDate.getTime() - 365 * DAY_MS);
          filterError = "Custom date ranges are limited to one year.";
        }
      } else {
        startDate.setUTCDate(startDate.getUTCDate() - 6);
        filterError = "Choose valid start and end dates on or before today.";
      }
    } else {
      startDate.setUTCDate(startDate.getUTCDate() - (Number(range) - 1));
    }

    let selectedMedicationId = "";
    if (req.query.medicationId) {
      const selected = medications.find(
        (medication) =>
          medication._id.toString() === String(req.query.medicationId),
      );
      if (selected) {
        selectedMedicationId = selected._id.toString();
      } else {
        filterError = "That medication is not in your list. Showing all medications.";
      }
    }

    const matchingMedications = selectedMedicationId
      ? medications.filter(
          (medication) =>
            medication._id.toString() === selectedMedicationId,
        )
      : medications;
    const medicationIds = matchingMedications.map(
      (medication) => medication._id,
    );
    const endExclusive = new Date(endDate.getTime() + DAY_MS);
    const [logs, sideEffects] = medicationIds.length
      ? await Promise.all([
          IntakeLog.find({
            medicationId: { $in: medicationIds },
            date: { $gte: startDate, $lt: endExclusive },
          }).lean(),
          SideEffect.find({
            medicationId: { $in: medicationIds },
            startDate: { $gte: startDate, $lt: endExclusive },
          }).lean(),
        ])
      : [[], []];

    const pieData = { taken: 0, missed: 0, late: 0 };
    const missedCountByMedication = new Map();
    for (const log of logs) {
      pieData[log.status]++;
      if (log.status === "missed") {
        const key = log.medicationId.toString();
        missedCountByMedication.set(
          key,
          (missedCountByMedication.get(key) || 0) + 1,
        );
      }
    }

    const missedMedicationId = [...missedCountByMedication.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    const mostMissedMedication = missedMedicationId
      ? {
          name:
            medications.find(
              (medication) =>
                medication._id.toString() === missedMedicationId[0],
            )?.name || "Unknown",
          missCount: missedMedicationId[1],
        }
      : null;

    const severityData = [0, 0, 0, 0, 0];
    for (const effect of sideEffects) {
      if (effect.severity >= 1 && effect.severity <= 5) {
        severityData[effect.severity - 1]++;
      }
    }

    const totalLogs = logs.length;
    const adherenceScore = totalLogs
      ? Math.round((pieData.taken / totalLogs) * 100)
      : 0;
    const weeklyTrend = buildAdherenceTrend(logs, startDate, endDate);
    const activeMedCount = matchingMedications.filter(
      (medication) => getMedicationStatus(medication, today) === "Active",
    ).length;

    res.render("dashboard.ejs", {
      adherenceScore,
      mostMissedMedication,
      severityData,
      weeklyTrend,
      pieData,
      activeMedCount,
      totalLogs,
      medications,
      selectedMedicationId,
      range,
      fromDate: startDate.toISOString().slice(0, 10),
      toDate: endDate.toISOString().slice(0, 10),
      filterError,
    });
  } catch (err) {
    logError("Dashboard loading failed", err, res.locals.requestId);
    res.status(500).send("Error loading dashboard.");
  }
});

module.exports = router;
