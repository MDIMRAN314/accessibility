const express = require("express");
const cors = require("cors");
require("dotenv").config();
const mongoose = require("mongoose");

// Import routes
const requestRoutes = require("./routes/request.routes");
const reportRoutes = require("./routes/report.routes");
const accessibilityRoutes = require("./routes/accessibility.routes");

const app = express();

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
  }),
);

const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || "10mb";

app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ limit: requestBodyLimit, extended: true }));

// Routes
app.use("/api/requests", requestRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/accessibility", accessibilityRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "Accessibility Testing API is running" });
});

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

if (process.env.MONGODB_URI && NODE_ENV !== "test") {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => {
      console.error("MongoDB connection error:", err.message);
      console.log("Continuing with in-memory storage");
    });
} else {
  console.log("MONGODB_URI not set; using in-memory storage");
}

const server = app.listen(PORT, () => {
  console.log(
    `Accessibility Testing API running on port ${PORT} (${NODE_ENV})`,
  );
  console.log("Available endpoints:");
  console.log("  GET  /health                          - Health check");
  console.log(
    "  POST /api/requests                    - Create accessibility request",
  );
  console.log("  GET  /api/requests                    - Get all requests");
  console.log("  POST /api/accessibility/validate-url - Validate URL");
  console.log("  POST /api/reports/:requestId/generate - Generate report");
  console.log("  GET  /api/accessibility/standards    - Get WCAG standards");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the existing backend process or set a different PORT value.`,
    );
    process.exit(1);
  }

  throw error;
});

module.exports = app;
