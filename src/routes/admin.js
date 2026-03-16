const { Router } = require("express");
const path = require("path");

const router = Router();

// HTTP Basic Auth middleware
router.use((req, res, next) => {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;

  if (!user || !pass) {
    return res.status(500).send("ADMIN_USER and ADMIN_PASS env vars are required");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="Chili Pulse Admin"');
    return res.status(401).send("Authentication required");
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const [reqUser, reqPass] = decoded.split(":");

  if (reqUser !== user || reqPass !== pass) {
    res.set("WWW-Authenticate", 'Basic realm="Chili Pulse Admin"');
    return res.status(401).send("Invalid credentials");
  }

  next();
});

// Serve admin HTML
router.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "admin.html"));
});

module.exports = router;
