const express = require("express");
const router = express.Router();
const Medication = require("../models/Medication.js");
const IntakeLog = require("../models/IntakeLog.js");
const SideEffect = require("../models/SideEffect.js");

// ─── Helper: get the start of a day (midnight UTC) ──────────────────────────
function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Helper: get the end of a day (23:59:59 UTC) ─────────────────────────────
function endOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const userId = req.session.user._id;

    // --- 1. Get all user's medications (active only for current stats) ---
    const activeMeds = await Medication.find({ userId, isActive: true });
    const allMeds = await Medication.find({ userId });
    const medicationIds = allMeds.map((m) => m._id);
    const activeMedicationIds = activeMeds.map((m) => m._id);

    // --- 2. Overall Adherence Score ---
    // Count total intake logs and how many were "taken"
    const totalLogs = await IntakeLog.countDocuments({
      medicationId: { $in: medicationIds },
    });
    const takenLogs = await IntakeLog.countDocuments({
      medicationId: { $in: medicationIds },
      status: "taken",
    });
    const missedLogs = await IntakeLog.countDocuments({
      medicationId: { $in: medicationIds },
      status: "missed",
    });
    const lateLogs = await IntakeLog.countDocuments({
      medicationId: { $in: medicationIds },
      status: "late",
    });

    const adherenceScore =
      totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : 0;

    // --- 3. Most Missed Medication ---
    // Aggregate: group intake logs by medicationId, count "missed" status
    const missedByMed = await IntakeLog.aggregate([
      { $match: { medicationId: { $in: medicationIds }, status: "missed" } },
      { $group: { _id: "$medicationId", missCount: { $sum: 1 } } },
      { $sort: { missCount: -1 } },
      { $limit: 1 },
    ]);

    let mostMissedMedication = null;
    if (missedByMed.length > 0) {
      mostMissedMedication = await Medication.findById(missedByMed[0]._id);
      mostMissedMedication = {
        name: mostMissedMedication ? mostMissedMedication.name : "Unknown",
        missCount: missedByMed[0].missCount,
      };
    }

    // --- 4. Side Effects by Severity (for bar chart) ---
    // Group all side effects by severity level (1-5), count occurrences
    const sideEffectsBySeverity = await SideEffect.aggregate([
      {
        $match: { medicationId: { $in: medicationIds } },
      },
      {
        $group: { _id: "$severity", count: { $sum: 1 } },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill in missing severity levels with 0 for the chart
    const severityData = [0, 0, 0, 0, 0]; // index 0 = severity 1, etc.
    sideEffectsBySeverity.forEach((item) => {
      severityData[item._id - 1] = item.count;
    });

    // --- 5. Weekly Adherence Trend (last 7 days) ---
    // For each of the last 7 days, calculate taken/total ratio
    const weeklyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const dayDate = new Date();
      dayDate.setUTCDate(dayDate.getUTCDate() - i);
      const dayStart = startOfDay(dayDate);
      const dayEnd = endOfDay(dayDate);

      const dayTotal = await IntakeLog.countDocuments({
        medicationId: { $in: medicationIds },
        date: { $gte: dayStart, $lte: dayEnd },
      });
      const dayTaken = await IntakeLog.countDocuments({
        medicationId: { $in: medicationIds },
        date: { $gte: dayStart, $lte: dayEnd },
        status: "taken",
      });

      const label = dayDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      weeklyTrend.push({
        label,
        adherence:
          dayTotal > 0 ? Math.round((dayTaken / dayTotal) * 100) : null,
      });
    }

    // --- 6. Missed-Dose Streak Detection ---
    // Find the longest consecutive streak of days with at least one "missed" log
    const recentLogs = await IntakeLog.find({
      medicationId: { $in: medicationIds },
    }).sort({ date: -1 });

    let currentStreak = 0;
    let maxStreak = 0;
    let lastDate = null;

    // Group logs by date
    const logsByDate = {};
    recentLogs.forEach((log) => {
      const dateKey = log.date.toISOString().split("T")[0];
      if (!logsByDate[dateKey]) logsByDate[dateKey] = [];
      logsByDate[dateKey].push(log);
    });

    // Check consecutive days from most recent
    const sortedDates = Object.keys(logsByDate).sort().reverse();
    for (const dateKey of sortedDates) {
      const dayLogs = logsByDate[dateKey];
      const hasMissed = dayLogs.some((log) => log.status === "missed");

      if (hasMissed) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        // If any day has no missed dose, break the streak
        // But only if we've started counting (consecutive from today)
        if (currentStreak > 0) break;
      }
    }

    // --- 7. Pie chart data: Taken vs Missed vs Late ---
    const pieData = {
      taken: takenLogs,
      missed: missedLogs,
      late: lateLogs,
    };

    res.render("dashboard.ejs", {
      adherenceScore,
      mostMissedMedication,
      severityData, // [count_sev1, count_sev2, ..., count_sev5]
      weeklyTrend, // [{label, adherence}, ...]
      pieData, // {taken, missed, late}
      missedDoseStreak: maxStreak,
      activeMedCount: activeMeds.length,
      totalMedCount: allMeds.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading dashboard.");
  }
});

module.exports = router;
