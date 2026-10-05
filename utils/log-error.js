module.exports = function logError(context, error) {
  console.error(`${context}: ${error?.name || "Error"}`);
};
