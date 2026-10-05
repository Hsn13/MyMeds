module.exports = function logError(context, error, requestId) {
  const reference = requestId ? ` [${requestId}]` : "";
  const code = error?.code ? ` (${error.code})` : "";
  console.error(`${context}${reference}: ${error?.name || "Error"}${code}`);
};
