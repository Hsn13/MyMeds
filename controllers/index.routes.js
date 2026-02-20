const router = require("express").Router();

router.get("/", (req, res) => {
  // If user is a clinician, redirect them to their patient list
  if (req.session.user && req.session.user.role === "clinician") {
    return res.redirect("/clinician/patients");
  }
  res.render("homepage.ejs");
});

module.exports = router;
