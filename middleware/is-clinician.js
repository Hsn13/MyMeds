// Middleware: only clinicians can access clinician-specific routes
// If the user is not a clinician, redirect home (could also send 403)
const isClinician = (req, res, next) => {
  if (req.session.user && req.session.user.role === "clinician") {
    return next();
  }
  res.redirect("/");
};

module.exports = isClinician;
