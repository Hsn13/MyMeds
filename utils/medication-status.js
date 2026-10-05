function startOfUtcDay(date = new Date()) {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function getMedicationStatus(medication, onDate = new Date()) {
  if (!medication.isActive) return "Inactive";

  const day = startOfUtcDay(onDate);
  const startDate = startOfUtcDay(medication.startDate);
  if (startDate > day) return "Scheduled";

  if (medication.endDate && startOfUtcDay(medication.endDate) < day) {
    return "Ended";
  }

  return "Active";
}

function isMedicationActiveOn(medication, onDate = new Date()) {
  const status = getMedicationStatus(medication, onDate);
  return status === "Active";
}

module.exports = { getMedicationStatus, isMedicationActiveOn, startOfUtcDay };
