const isClinician = (req, res, next) => {
  if (req.session.user && req.session.user.role === "clinician") {
    return next();
  }
  res.redirect("/"); // Or send a 403 Forbidden error
};

module.exports = isClinician;
