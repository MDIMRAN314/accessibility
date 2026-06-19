const mongoose = require("mongoose");

const IssueSchema = new mongoose.Schema({
  issueId: String,
  criterion: String,
  principle: String,
  guideline: String,
  description: String,
  severity: {
    type: String,
    enum: ["Critical", "Serious", "Moderate", "Minor", "None"],
    default: "Moderate",
  },
  status: {
    type: String,
    enum: [
      "Pass",
      "Fail",
      "Warning",
      "NA",
      "Manual Review",
      "Approved Exception",
      "Not an issue",
      "Best Practice",
      "Error",
      "Suppressed",
    ],
    default: "Fail",
  },
  engine: String,
  enginePriority: Number,
  engineResults: [mongoose.Schema.Types.Mixed],
  mergedIssueIds: [String],
  redundantEntryCount: Number,
  rawStatus: String,
  finalStatus: String,
  decisionEngine: String,
  suppressedByPriority: {
    type: Boolean,
    default: false,
  },
  suppressedByEngine: String,
  type: {
    type: String,
    enum: ["Automated", "Semi-Automated", "Manual", "Best Practices"],
    default: "Automated",
  },
  pageUrl: String,
  pageTitle: String,
  pageDepth: Number,
  elements: [
    {
      elementName: String,
      selector: String,
      xpath: String,
      html: String,
      screenshot: String,
      pageUrl: String,
      pageTitle: String,
      locators: [
        {
          type: String,
          value: String,
        },
      ],
      status: String,
      rawStatus: String,
    },
  ],
  suggestedFix: String,
  howToTest: String,
  automationJustification: String,
  helpUrl: String,
  referenceLinks: [mongoose.Schema.Types.Mixed],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const AccessibilityReportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    unique: true,
    default: () => "REPORT-" + Date.now(),
  },
  requestId: {
    type: String,
    ref: "AccessibilityRequest",
    required: true,
  },
  requestName: String,
  url: String,
  wcagVersion: String,
  conformanceLevel: String,
  complianceType: String,
  countryRegulation: String,
  requestDetails: mongoose.Schema.Types.Mixed,
  transcription: mongoose.Schema.Types.Mixed,
  pdfValidation: mongoose.Schema.Types.Mixed,
  scannedPages: [
    {
      url: String,
      depth: Number,
      title: String,
      status: String,
      statusCode: Number,
      issueCount: Number,
      error: String,
    },
  ],
  generationTime: Number, // in milliseconds
  reportSize: Number, // in bytes
  accessibilityScore: Number,
  summary: {
    totalIssues: Number,
    automatedIssues: Number,
    semiAutomatedIssues: Number,
    manualIssues: Number,
    bestPractices: Number,
    passCount: Number,
    failCount: Number,
    warningCount: Number,
  },
  issueSeverityCount: {
    critical: Number,
    serious: Number,
    moderate: Number,
    minor: Number,
  },
  scoreBreakdown: mongoose.Schema.Types.Mixed,
  scoreHistory: [mongoose.Schema.Types.Mixed],
  issues: [IssueSchema],
  principles: [mongoose.Schema.Types.Mixed],
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
  "AccessibilityReport",
  AccessibilityReportSchema,
);
