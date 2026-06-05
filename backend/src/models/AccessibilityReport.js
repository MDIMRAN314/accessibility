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
    ],
    default: "Fail",
  },
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
    },
  ],
  suggestedFix: String,
  howToTest: String,
  automationJustification: String,
  helpUrl: String,
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
  scanScope: String,
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
  crawlSummary: mongoose.Schema.Types.Mixed,
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
  principles: [
    {
      name: String,
      status: String,
      guidelines: [
        {
          name: String,
          status: String,
          criteria: [
            {
              id: String,
              name: String,
              level: String,
              status: String,
              type: String,
              issues: [{ type: mongoose.Schema.Types.ObjectId, ref: "Issue" }],
            },
          ],
        },
      ],
    },
  ],
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
