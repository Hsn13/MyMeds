function formatDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildAdherenceTrend(logs, startDate, endDate) {
  const dayStats = new Map();
  for (const log of logs) {
    const key = formatDateKey(log.date);
    const stats = dayStats.get(key) || { total: 0, taken: 0 };
    stats.total++;
    if (log.status === "taken") stats.taken++;
    dayStats.set(key, stats);
  }

  const trend = [];
  const day = new Date(startDate);
  const last = new Date(endDate);
  while (day <= last) {
    const key = formatDateKey(day);
    const stats = dayStats.get(key);
    trend.push({
      date: key,
      label: day.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      adherence: stats ? Math.round((stats.taken / stats.total) * 100) : null,
    });
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return trend;
}

module.exports = { buildAdherenceTrend };
