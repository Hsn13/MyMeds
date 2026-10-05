const crypto = require("node:crypto");

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function matchesToken(expected, received) {
  if (
    typeof received !== "string" ||
    !/^[a-f0-9]{64}$/i.test(received) ||
    typeof expected !== "string"
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  );
}

function csrfProtection(req, res, next) {
  res.set("Cache-Control", "no-store");

  if (safeMethods.has(req.method)) {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }
    res.locals.csrfToken = req.session.csrfToken;
    return next();
  }

  const receivedToken = req.body?._csrf || req.get("x-csrf-token");
  if (!matchesToken(req.session.csrfToken, receivedToken)) {
    return res.status(403).send("Invalid or missing security token.");
  }

  next();
}

module.exports = csrfProtection;
