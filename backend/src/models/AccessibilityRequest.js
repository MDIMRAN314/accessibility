const mongoose = require("mongoose");

const AccessibilityRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true,
    default: () => "REQ-" + Date.now(),
  },
  url: {
    type: String,
    required: true,
  },
  requestName: {
    type: String,
  },
  requestType: {
    type: String,
    enum: ["Web", "Mobile", "PDF"],
    default: "Web",
  },
  taskType: {
    type: String,
    enum: [
      "Guidelines Check",
      "Transcription Comparison",
      "Generate Screen Reader Transcription",
    ],
    default: "Guidelines Check",
  },
  complianceType: {
    type: String,
    enum: ["WCAG Standards", "Country Regulations"],
    default: "WCAG Standards",
  },
  wcagVersion: {
    type: String,
    enum: ["2.0", "2.1", "2.2"],
    default: "2.2",
  },
  countryRegulation: {
    type: String,
    enum: [
      "United States - ADA / Section 508",
      "United Kingdom - Equality Act / PSBAR 2018",
      "European Union - EAA / EN 301 549",
      "Canada - ACA / AODA",
      "Australia - DDA",
      "India - RPwD Act / IS 17802",
      "Japan - JIS X 8341-3",
      "Brazil - LBI / eMAG",
      "Singapore - DSS",
      "South Africa - PEPUDA",
    ],
  },
  conformanceLevel: {
    type: String,
    enum: ["A", "AA", "AAA"],
    default: "AA",
  },
  checkPoints: {
    type: [String],
    enum: [
      "All",
      "Headings",
      "Landmarks",
      "Page Title",
      "Tab Order",
      "Focus Order",
      "Skip Links",
      "Forms",
      "Images",
      "Video/Audio",
      "Link/Buttons",
      "ARIA",
      "Color Contrast",
      "Hidden Content",
      "Language",
      "Best Practices",
    ],
    default: ["All"],
  },
  guidelines: {
    type: [String],
    default: [],
  },
  successCriteriaWeightage: {
    type: Map,
    of: Number,
    default: {},
  },
  scanScope: {
    type: String,
    enum: ["Page", "Site"],
    default: "Page",
  },
  maxPages: {
    type: Number,
    default: 10,
  },
  maxDepth: {
    type: Number,
    default: 2,
  },
  autoScroll: {
    type: Boolean,
    default: true,
  },
  includeSitemap: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ["Pending", "Running", "Completed", "Failed"],
    default: "Pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model(
  "AccessibilityRequest",
  AccessibilityRequestSchema,
);
