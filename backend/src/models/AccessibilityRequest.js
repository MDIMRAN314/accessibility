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
  screenReader: {
    type: String,
    enum: ["JAWS"],
    default: "JAWS",
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
  pdfStandard: {
    type: String,
    enum: ["PDF/UA (ISO 14289)", "WCAG 2.0", "WCAG 2.1", "WCAG 2.2"],
  },
  passCriteriaPercentage: {
    type: Number,
  },
  pdfMaxFailures: {
    type: Number,
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
      "Links/Buttons",
      "ARIA",
      "Color Contrast",
      "Colour Contrast",
      "Responsive",
      "Hidden Content",
      "Language",
      "Tagged Content",
      "Primary Language",
      "Bookmarks",
      "Tables",
      "Lists",
      "Title",
      "Reading Order",
      "Decorative Elements",
      "Best Practice",
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
  sourceFileName: String,
  sourceFilePath: String,
  sourceFileMimeType: String,
  sourceFileSize: Number,
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
