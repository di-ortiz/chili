require("dotenv").config();
const express = require("express");
const cors = require("cors");

const leadersRouter = require("./routes/leaders");
const accountsRouter = require("./routes/accounts");
const briefingsRouter = require("./routes/briefings");
const adminRouter = require("./routes/admin");
const testRouter = require("./routes/test");
const syncRouter = require("./routes/sync");
const scheduler = require("./scheduler");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "chili-pulse" });
});

// Routes
app.use("/leaders", leadersRouter);
app.use("/accounts", accountsRouter);
app.use("/briefings", briefingsRouter);
app.use("/admin", adminRouter);
app.use("/test", testRouter);
app.use("/sync", syncRouter);

app.listen(PORT, () => {
  console.log(`chili-pulse running on port ${PORT}`);
  scheduler.start();
});
