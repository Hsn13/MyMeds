// Middleware: makes the current user available in EVERY EJS template
// so navbar and other partials can conditionally show login/logout links
const passUserToView = (req, res, next) => {
  res.locals.user = req.session.user ? req.session.user : null;
  next();
};

module.exports = passUserToView;
