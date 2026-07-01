const AccessibilityTester = require("../services/AccessibilityTester");
const AccessibilityStore = require("../services/AccessibilityStore");
const ScoreCalculator = require("../services/ScoreCalculator");
const ScreenReaderTranscriber = require("../services/ScreenReaderTranscriber");
const PdfAccessibilityTester = require("../services/PdfAccessibilityTester");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
  wcagStandards,
  getSuccessCriteriaForVersion,
} = require("../config/wcagStandards");
const { resolveSelectedGuidelines } = require("../config/guidelineScope");

const GUIDELINE_SCAN_OPTIONS = {
  scanScope: "Page",
  maxPages: 1,
  maxDepth: 0,
  autoScroll: true,
  includeSitemap: false,
};
const CONFORMANCE_LEVEL_RANK = {
  A: 1,
  AA: 2,
  AAA: 3,
};

class ReportController {
  static async generateReport(req, res) {
    try {
      const { requestId } = req.params;
      const request = await AccessibilityStore.findRequest(requestId);

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      if (request.requestType === "PDF") {
        const veraPdfStatus = await PdfAccessibilityTester.getVeraPdfStatus();

        if (!veraPdfStatus.available) {
          return res.status(409).json({
            error: veraPdfStatus.message,
            code: "VERAPDF_NOT_INSTALLED",
            veraPdf: veraPdfStatus,
          });
        }
      }

      await AccessibilityStore.updateRequest(requestId, { status: "Running" });
      const startTime = Date.now();

      try {
        if (request.taskType === "Generate Screen Reader Transcription") {
          const transcription = await ScreenReaderTranscriber.generate({
            url: request.url,
            screenReader: request.screenReader || "JAWS",
            checkPoints: request.checkPoints,
          });
          const generationTime = Date.now() - startTime;
          const report = await AccessibilityStore.createReport({
            requestId,
            requestName: request.requestName,
            url: request.url,
            wcagVersion: request.wcagVersion || "2.2",
            conformanceLevel: request.conformanceLevel || "AA",
            complianceType: request.complianceType,
            countryRegulation: request.countryRegulation,
            requestDetails: request,
            transcription,
            scannedPages: [
              {
                url: transcription.url,
                depth: 0,
                title: transcription.pageTitle,
                status: "Transcribed",
                statusCode: 200,
                issueCount: 0,
                error: null,
              },
            ],
            generationTime,
            reportSize: JSON.stringify(transcription).length,
            accessibilityScore: 0,
            scoreBreakdown: null,
            scoreHistory: [],
            summary: ReportController.createSummary([]),
            issueSeverityCount: ReportController.createSeverityCount([]),
            issues: [],
            principles: [],
          });

          await AccessibilityStore.updateRequest(requestId, { status: "Completed" });

          return res.status(201).json({
            success: true,
            report: ReportController.toReportResponse(report),
            message: "Screen reader transcription generated successfully",
          });
        }

        if (request.requestType === "PDF") {
          const scanResult = await PdfAccessibilityTester.runPdfScan({
            filePath: request.sourceFilePath,
            fileName: request.sourceFileName || request.url,
            pdfStandard: request.pdfStandard || "PDF/UA (ISO 14289)",
            wcagVersion: request.wcagVersion || "2.2",
            conformanceLevel: request.conformanceLevel || "AA",
            checkPoints: request.checkPoints,
            selectedGuidelines: request.guidelines,
            pdfMaxFailures: request.pdfMaxFailures,
          });
          const issues = scanResult.issues;
          const generationTime = Date.now() - startTime;
          const scoreResult = ScoreCalculator.calculate({
            wcagVersion: request.wcagVersion || "2.2",
            requestDetails: request,
            issues,
          });
          const report = await AccessibilityStore.createReport({
            requestId,
            requestName: request.requestName,
            url: request.sourceFileName || request.url,
            wcagVersion: request.wcagVersion || "2.2",
            conformanceLevel: request.conformanceLevel || "AA",
            complianceType: request.complianceType,
            countryRegulation: request.countryRegulation,
            requestDetails: request,
            pdfValidation: scanResult.pdfValidation,
            scannedPages: scanResult.scannedPages,
            generationTime,
            reportSize: JSON.stringify(issues).length,
            accessibilityScore: scoreResult.accessibilityScore,
            scoreBreakdown: scoreResult.scoreBreakdown,
            scoreHistory: [],
            summary: ReportController.createSummary(issues),
            issueSeverityCount: ReportController.createSeverityCount(issues),
            issues,
            principles: ReportController.organizePrinciples(
              issues,
              request.wcagVersion || "2.2",
              {
                conformanceLevel: request.conformanceLevel || "AA",
                selectedGuidelines: request.guidelines,
                successCriteriaWeightage: request.successCriteriaWeightage,
                checkPoints: request.checkPoints,
                requestType: request.requestType,
              },
            ),
          });

          await AccessibilityStore.updateRequest(requestId, { status: "Completed" });

          return res.status(201).json({
            success: true,
            report: ReportController.toReportResponse(report),
            message: "PDF accessibility report generated successfully",
          });
        }

        const scanResult = await AccessibilityTester.runAccessibilityScan(
          request.url,
          request.conformanceLevel,
          request.wcagVersion,
          request.checkPoints,
          request.guidelines,
          {
            ...GUIDELINE_SCAN_OPTIONS,
            engineOptions: request.engineOptions,
          },
        );
        const issues = scanResult.issues;

        const generationTime = Date.now() - startTime;
        const scoreResult = ScoreCalculator.calculate({
          wcagVersion: request.wcagVersion || "2.2",
          requestDetails: request,
          issues,
        });

        const report = await AccessibilityStore.createReport({
          requestId,
          requestName: request.requestName,
          url: request.url,
          wcagVersion: request.wcagVersion || "2.2",
          conformanceLevel: request.conformanceLevel || "AA",
          complianceType: request.complianceType,
          countryRegulation: request.countryRegulation,
          requestDetails: request,
          scannedPages: scanResult.scannedPages,
          generationTime,
          reportSize: JSON.stringify(issues).length,
          accessibilityScore: scoreResult.accessibilityScore,
          scoreBreakdown: scoreResult.scoreBreakdown,
          scoreHistory: [],
          summary: ReportController.createSummary(issues),
          issueSeverityCount: ReportController.createSeverityCount(issues),
          issues,
          principles: ReportController.organizePrinciples(
            issues,
            request.wcagVersion || "2.2",
            {
              conformanceLevel: request.conformanceLevel || "AA",
              selectedGuidelines: request.guidelines,
              successCriteriaWeightage: request.successCriteriaWeightage,
              checkPoints: request.checkPoints,
              requestType: request.requestType,
            },
          ),
        });

        await AccessibilityStore.updateRequest(requestId, { status: "Completed" });

        res.status(201).json({
          success: true,
          report: ReportController.toReportResponse(report),
          message: "Report generated successfully",
        });
      } catch (testError) {
        await AccessibilityStore.updateRequest(requestId, { status: "Failed" });
        throw testError;
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getReport(req, res) {
    try {
      const { reportId } = req.params;
      const report = await AccessibilityStore.findReport(reportId);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.json(ReportController.toReportResponse(report));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getReportByRequestId(req, res) {
    try {
      const { requestId } = req.params;
      const report = await AccessibilityStore.findReportByRequestId(requestId);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.json(ReportController.toReportResponse(report));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getScoreHistory(req, res) {
    try {
      const { reportId } = req.params;
      const report = await AccessibilityStore.findReport(reportId);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.json({
        success: true,
        reportId: report.reportId,
        requestId: report.requestId,
        scoreHistory: report.scoreHistory || [],
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async previewSourcePdf(req, res) {
    try {
      const { reportId } = req.params;
      const report = await AccessibilityStore.findReport(reportId);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (report.requestDetails?.requestType !== "PDF") {
        return res.status(400).json({ error: "Source preview is available for PDF reports only" });
      }

      const sourceFilePath = report.requestDetails?.sourceFilePath;

      if (!sourceFilePath) {
        return res.status(404).json({ error: "Source PDF path not found" });
      }

      const uploadsRoot = path.resolve(__dirname, "../../uploads");
      const resolvedPath = path.resolve(sourceFilePath);
      const relativeToUploads = path.relative(uploadsRoot, resolvedPath);

      if (
        relativeToUploads.startsWith("..") ||
        path.isAbsolute(relativeToUploads)
      ) {
        return res.status(403).json({ error: "Source PDF path is outside the upload directory" });
      }

      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: "Source PDF file not found" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${ReportController.sanitizeFileName(
          String(report.requestDetails?.sourceFileName || report.url || "source").replace(/\.pdf$/i, ""),
        )}.pdf"`,
      );

      return fs.createReadStream(resolvedPath).pipe(res);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static organizePrinciples(
    issues,
    wcagVersion,
    {
      conformanceLevel = "AA",
      selectedGuidelines = ["All"],
      successCriteriaWeightage = {},
      checkPoints = ["All"],
      requestType = "Web",
    } = {},
  ) {
    const principles = [
      { name: "Perceivable", guidelines: [] },
      { name: "Operable", guidelines: [] },
      { name: "Understandable", guidelines: [] },
      { name: "Robust", guidelines: [] },
    ];

    const wcagConfig = wcagStandards[wcagVersion] || wcagStandards["2.2"];
    const versionCriteria = getSuccessCriteriaForVersion(wcagVersion);
    const selectedGuidelineSet = new Set(
      ReportController.resolveSelectedGuidelines(
        selectedGuidelines,
        successCriteriaWeightage,
        wcagVersion,
        checkPoints,
        requestType,
      ),
    );
    const includeAllGuidelines =
      selectedGuidelineSet.size === 0 || selectedGuidelineSet.has("All");

    principles.forEach((principle) => {
      principle.guidelines = Object.entries(wcagConfig.guidelines)
        .filter(([, config]) => config.principle === principle.name)
        .filter(
          ([guidelineId]) =>
            includeAllGuidelines || selectedGuidelineSet.has(guidelineId),
        )
        .map(([guidelineId, config]) => {
          const criteria = Object.entries(versionCriteria)
            .filter(([, criteria]) => criteria.guideline === guidelineId)
            .filter(([, criteria]) =>
              ReportController.isCriterionInConformance(
                criteria,
                conformanceLevel,
              ),
            )
            .map(([criteriaId, criteria]) => {
              const criteriaIssues = issues.filter(
                (issue) => issue.criterion === criteriaId,
              );

              return {
                id: criteriaId,
                name: criteria.name,
                level: criteria.level,
                status: ReportController.deriveStatus(criteriaIssues),
                type: criteria.type || config.type || "Manual",
                issues: criteriaIssues,
              };
            });

          return {
            name: `${guidelineId} - ${config.name}`,
            status: ReportController.deriveStatus(
              criteria.flatMap((criterion) => criterion.issues || []),
            ),
            criteria,
          };
        })
        .filter((guideline) => guideline.criteria.length > 0);
      principle.status = ReportController.deriveStatus(
        principle.guidelines.flatMap((guideline) =>
          guideline.criteria.flatMap((criterion) => criterion.issues || []),
        ),
      );
    });

    return principles;
  }

  static resolveSelectedGuidelines(
    selectedGuidelines = ["All"],
    successCriteriaWeightage = {},
    wcagVersion = "2.2",
    checkPoints = ["All"],
    requestType = "Web",
  ) {
    return resolveSelectedGuidelines({
      selectedGuidelines,
      successCriteriaWeightage,
      wcagVersion,
      checkPoints,
      requestType,
    });
  }

  static isCriterionInConformance(criterionConfig, conformanceLevel = "AA") {
    if (!criterionConfig?.level) {
      return true;
    }

    const requestedLevel =
      CONFORMANCE_LEVEL_RANK[String(conformanceLevel || "AA").toUpperCase()] ||
      CONFORMANCE_LEVEL_RANK.AA;
    const criterionLevel =
      CONFORMANCE_LEVEL_RANK[String(criterionConfig.level).toUpperCase()] ||
      requestedLevel;

    return criterionLevel <= requestedLevel;
  }

  static deriveStatus(issues) {
    const criterionGroups = ReportController.groupIssuesByCriterion(issues);
    const statuses =
      criterionGroups.length > 0
        ? criterionGroups.map((criterionIssues) =>
            ScoreCalculator.deriveCriterionState(criterionIssues),
          )
        : ReportController.getAggregateStatuses(issues);

    if (statuses.length === 0) {
      return "NA";
    }

    if (statuses.every((status) => status === "NA")) {
      return "NA";
    }

    if (statuses.some((status) => ["Fail", "Error"].includes(status))) {
      return "Fail";
    }

    if (
      statuses.some((status) =>
        ["Warning", "Manual Review"].includes(status),
      )
    ) {
      return "Warning";
    }

    if (
      statuses.every((status) =>
        ["Pass", "Approved Exception", "Not an issue", "Best Practice"].includes(
          status,
        ),
      )
    ) {
      return "Pass";
    }

    return "Warning";
  }

  static groupIssuesByCriterion(issues) {
    const groups = new Map();

    (issues || []).forEach((issue) => {
      if (!issue.criterion || issue.type === "Best Practices") {
        return;
      }

      if (!groups.has(issue.criterion)) {
        groups.set(issue.criterion, []);
      }

      groups.get(issue.criterion).push(issue);
    });

    return Array.from(groups.values());
  }

  static getAggregateStatuses(issues) {
    return issues
      .flatMap((issue) => [
        issue.status,
        ...(issue.elements || [])
          .map((element) => element.status)
          .filter(Boolean),
      ])
      .filter((status) => status !== "Suppressed");
  }

  static isReportable(issue, type) {
    return (
      issue.type === type &&
      ["Fail", "Error", "Warning", "Manual Review", "Best Practice"].includes(
        issue.status,
      )
    );
  }

  static createSummary(issues) {
    const failedIssues = issues.filter((issue) =>
      ["Fail", "Error"].includes(issue.status),
    );
    const warningIssues = issues.filter((issue) =>
      ["Warning", "Manual Review"].includes(issue.status),
    );
    const passCount = issues.filter((issue) => issue.status === "Pass").length;

    return {
      totalIssues: failedIssues.length + warningIssues.length,
      automatedIssues: issues.filter((issue) =>
        ReportController.isReportable(issue, "Automated"),
      ).length,
      semiAutomatedIssues: issues.filter((issue) =>
        ReportController.isReportable(issue, "Semi-Automated"),
      ).length,
      manualIssues: issues.filter((issue) =>
        ReportController.isReportable(issue, "Manual"),
      ).length,
      bestPractices: issues.filter((issue) => issue.type === "Best Practices")
        .length,
      passCount,
      failCount: failedIssues.length,
      warningCount: warningIssues.length,
    };
  }

  static createSeverityCount(issues) {
    const failedIssues = issues.filter((issue) =>
      ["Fail", "Error"].includes(issue.status),
    );

    return {
      critical: failedIssues.filter((issue) => issue.severity === "Critical")
        .length,
      serious: failedIssues.filter((issue) => issue.severity === "Serious")
        .length,
      moderate: failedIssues.filter((issue) => issue.severity === "Moderate")
        .length,
      minor: failedIssues.filter((issue) => issue.severity === "Minor").length,
    };
  }

  static async updateIssueStatus(req, res) {
    try {
      const { reportId, issueId } = req.params;
      const { status } = req.body;
      const currentReport = await AccessibilityStore.findReport(reportId);

      if (!currentReport) {
        return res.status(404).json({ error: "Report not found" });
      }

      const issue = await AccessibilityStore.updateIssueStatus(
        reportId,
        issueId,
        status,
      );

      if (!issue) {
        return res.status(404).json({ error: "Issue not found" });
      }

      const reportWithStatus = await AccessibilityStore.findReport(reportId);
      const scoreResult = ScoreCalculator.calculate(reportWithStatus);
      const report = await AccessibilityStore.updateReport(reportId, {
        accessibilityScore: scoreResult.accessibilityScore,
        scoreBreakdown: scoreResult.scoreBreakdown,
        summary: ReportController.createSummary(reportWithStatus.issues),
        issueSeverityCount: ReportController.createSeverityCount(
          reportWithStatus.issues,
        ),
        reportSize: JSON.stringify(reportWithStatus.issues).length,
        principles: ReportController.organizePrinciples(
          reportWithStatus.issues,
          reportWithStatus.wcagVersion || "2.2",
          {
            conformanceLevel:
              reportWithStatus.requestDetails?.conformanceLevel ||
              reportWithStatus.conformanceLevel ||
              "AA",
            selectedGuidelines: reportWithStatus.requestDetails?.guidelines,
            successCriteriaWeightage:
              reportWithStatus.requestDetails?.successCriteriaWeightage,
            checkPoints: reportWithStatus.requestDetails?.checkPoints,
            requestType: reportWithStatus.requestDetails?.requestType,
          },
        ),
        scoreHistory: [
          ...(reportWithStatus.scoreHistory || []),
          {
            previousScore: currentReport.accessibilityScore,
            updatedScore: scoreResult.accessibilityScore,
            updatedAt: new Date().toISOString(),
            reason: `Issue ${issueId} changed to ${status}`,
          },
        ],
      });

      res.json({
        success: true,
        message: "Issue status updated successfully",
        issue,
        report: ReportController.toReportResponse(report),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateElementStatus(req, res) {
    try {
      const { reportId } = req.params;
      const { elementKey, status } = req.body;
      const currentReport = await AccessibilityStore.findReport(reportId);

      if (!currentReport) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (!elementKey || !status) {
        return res
          .status(400)
          .json({ error: "Element key and status are required" });
      }

      const element = await AccessibilityStore.updateElementStatus(
        reportId,
        elementKey,
        status,
      );

      if (!element) {
        return res.status(404).json({ error: "Element not found" });
      }

      const reportWithStatus = await AccessibilityStore.findReport(reportId);
      const scoreResult = ScoreCalculator.calculate(reportWithStatus);
      const report = await AccessibilityStore.updateReport(reportId, {
        accessibilityScore: scoreResult.accessibilityScore,
        scoreBreakdown: scoreResult.scoreBreakdown,
        summary: ReportController.createSummary(reportWithStatus.issues),
        issueSeverityCount: ReportController.createSeverityCount(
          reportWithStatus.issues,
        ),
        reportSize: JSON.stringify(reportWithStatus.issues).length,
        principles: ReportController.organizePrinciples(
          reportWithStatus.issues,
          reportWithStatus.wcagVersion || "2.2",
          {
            conformanceLevel:
              reportWithStatus.requestDetails?.conformanceLevel ||
              reportWithStatus.conformanceLevel ||
              "AA",
            selectedGuidelines: reportWithStatus.requestDetails?.guidelines,
            successCriteriaWeightage:
              reportWithStatus.requestDetails?.successCriteriaWeightage,
            checkPoints: reportWithStatus.requestDetails?.checkPoints,
            requestType: reportWithStatus.requestDetails?.requestType,
          },
        ),
        scoreHistory: [
          ...(reportWithStatus.scoreHistory || []),
          {
            previousScore: currentReport.accessibilityScore,
            updatedScore: scoreResult.accessibilityScore,
            updatedAt: new Date().toISOString(),
            reason: `Element ${elementKey} changed to ${status}`,
          },
        ],
      });

      res.json({
        success: true,
        message: "Element status updated successfully",
        element,
        report: ReportController.toReportResponse(report),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async downloadReport(req, res) {
    try {
      const { reportId } = req.params;
      const format = String(req.query.format || "html").toLowerCase();
      const report = await AccessibilityStore.findReport(reportId);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const htmlReport = report.transcription
        ? ReportController.generateTranscriptionHTMLReport(report)
        : ReportController.generateHTMLReport(report);

      if (format === "pdf") {
        const pdfReport = await ReportController.renderHtmlToPdf(htmlReport);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${ReportController.createDownloadFileName(
            report,
            "pdf",
          )}"`,
        );
        return res.send(pdfReport);
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${ReportController.createDownloadFileName(
          report,
          "html",
        )}"`,
      );
      return res.send(htmlReport);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async renderHtmlToPdf(htmlReport) {
    let browser;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();

      await page.setContent(htmlReport, { waitUntil: "load" });

      const pdfReport = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "16mm",
          right: "12mm",
          bottom: "16mm",
          left: "12mm",
        },
      });

      return pdfReport;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  static createDownloadFileName(report, format = "html") {
    const suffix = report.transcription
      ? "JawsTranscription"
      : report.requestDetails?.requestType === "PDF"
        ? "PdfAccessibilityReport"
        : "Report";

    return `${ReportController.sanitizeFileName(
      ReportController.getRequestName(report),
    )}${suffix}.${format}`;
  }

  static getRequestName(report) {
    if (typeof report.requestName === "string" && report.requestName.trim()) {
      return report.requestName.trim();
    }

    if (
      typeof report.requestDetails?.requestName === "string" &&
      report.requestDetails.requestName.trim()
    ) {
      return report.requestDetails.requestName.trim();
    }

    try {
      const parsed = new URL(report.url);
      return parsed.hostname.replace(/^www\./, "") || report.requestId;
    } catch {
      return report.requestId || "Accessibility";
    }
  }

  static sanitizeFileName(value) {
    return (
      String(value || "Accessibility")
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 80) || "Accessibility"
    );
  }

  static getStandardLabel(report) {
    if (report.complianceType === "Country Regulations" && report.countryRegulation) {
      return report.countryRegulation;
    }

    return `WCAG ${report.wcagVersion} ${report.conformanceLevel}`;
  }

  static isBestPracticeConfigured(report) {
    const checkPoints = report.requestDetails?.checkPoints || [];

    if (checkPoints.includes("All") || checkPoints.includes("Best Practices")) {
      return true;
    }

    return !report.requestDetails && Number(report.summary?.bestPractices || 0) > 0;
  }

  static formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 KB";
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  static formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 1000) {
      return `${Math.max(milliseconds || 0, 0)} ms`;
    }

    return `${(milliseconds / 1000).toFixed(2)} s`;
  }

  static groupElements(issues) {
    const groups = new Map();

    issues.forEach((issue) => {
      (issue.elements || []).forEach((element) => {
        const key =
          [
            element.pageUrl || issue.pageUrl,
            element.selector || element.xpath || element.html || element.elementName,
          ]
            .filter(Boolean)
            .join("::");
        const current = groups.get(key);

        if (current) {
          current.issues.push(issue);
          return;
        }

        groups.set(key, { key, element, issues: [issue] });
      });
    });

    return Array.from(groups.values());
  }

  static generateHTMLReport(report) {
    const reportableIssues = (report.issues || []).filter(
      (issue) => !["Pass", "NA", "Suppressed"].includes(issue.status),
    );
    const elementGroups = ReportController.groupElements(reportableIssues);
    const standardLabel = ReportController.getStandardLabel(report);
    const requestName = ReportController.getRequestName(report);
    const showBestPractices = ReportController.isBestPracticeConfigured(report);
    const scannedPages = report.scannedPages || [];
    const configuredWeightTotal =
      report.scoreBreakdown?.configuredWeightTotal || 0;
    const scoredWeightTotal =
      report.scoreBreakdown?.scoredWeightTotal ?? configuredWeightTotal;
    const scoringNote =
      scoredWeightTotal !== configuredWeightTotal
        ? `${scoredWeightTotal} of configured weight was scored automatically; remaining criteria require manual validation.`
        : "Score is based on automatically assessed success criteria weightage.";
    const tabCounts = [
      ["All Guidelines", reportableIssues.length],
      [
        "Automated",
        reportableIssues.filter((issue) => issue.type === "Automated").length,
      ],
      [
        "Semi-Automated",
        reportableIssues.filter((issue) => issue.type === "Semi-Automated").length,
      ],
      ["Manual", reportableIssues.filter((issue) => issue.type === "Manual").length],
      showBestPractices
        ? [
            "Best Practices",
            reportableIssues.filter((issue) => issue.type === "Best Practices").length,
          ]
        : null,
    ].filter(Boolean);

    const requestWeightages = Object.entries(
      report.requestDetails?.successCriteriaWeightage || {},
    )
      .map(
        ([guidelineId, weight]) => `
          <tr>
            <td>${escapeHtml(guidelineId)}</td>
            <td>${escapeHtml(weight)}</td>
          </tr>
        `,
      )
      .join("");

    const scannedPageRows = scannedPages
      .map(
        (page) => `
          <tr>
            <td>${escapeHtml(page.url)}</td>
            <td>${escapeHtml(page.status || "Scanned")}</td>
            <td>${escapeHtml(page.statusCode || "N/A")}</td>
            <td>${escapeHtml(page.issueCount || 0)}</td>
          </tr>
        `,
      )
      .join("");

    const pdfValidationRows = report.pdfValidation
      ? [
          ["Tool", report.pdfValidation.tool || "veraPDF"],
          [
            "Tool Available",
            report.pdfValidation.toolAvailable === false ? "No" : "Yes",
          ],
          ["Standard", report.pdfValidation.standard || "PDF/UA (ISO 14289)"],
          [
            "Compliant",
            report.pdfValidation.isCompliant === null ||
            report.pdfValidation.isCompliant === undefined
              ? "Unknown"
              : report.pdfValidation.isCompliant
                ? "Yes"
                : "No",
          ],
          ["Failed Checks", (report.pdfValidation.failedChecks || []).length],
          ["Error", report.pdfValidation.error || ""],
        ]
          .filter(([, value]) => value !== "")
          .map(
            ([label, value]) => `
              <tr>
                <th>${escapeHtml(label)}</th>
                <td>${escapeHtml(value)}</td>
              </tr>
            `,
          )
          .join("")
      : "";

    const guidelineHtml = (report.principles || [])
      .map((principle) => {
        const guidelines = (principle.guidelines || [])
          .map((guideline) => {
            const criteria = (guideline.criteria || [])
              .map((criterion) => {
                const issues = reportableIssues.filter(
                  (issue) => issue.criterion === criterion.id,
                );
                const issueHtml = issues
                  .map(
                    (issue) => `
                      <details class="issue" open>
                        <summary>
                          <span>${escapeHtml(issue.description)}</span>
                          <b>${escapeHtml(issue.severity)}</b>
                          <em>${escapeHtml(issue.status)}</em>
                        </summary>
                        <p>Page: ${escapeHtml(issue.pageUrl || report.url)}</p>
                        <p>${escapeHtml(issue.suggestedFix || "Review the affected element.")}</p>
                        ${(issue.elements || [])
                          .map(
                            (element) => `
                              <article class="element">
                                <h5>${escapeHtml(
                                  element.elementName || "Unnamed element",
                                )}</h5>
                                <p>${escapeHtml(
                                  element.selector || element.xpath || "No locator",
                                )}</p>
                                <pre>${escapeHtml(
                                  element.html || "No DOM snippet found.",
                                )}</pre>
                              </article>
                            `,
                          )
                          .join("")}
                      </details>
                    `,
                  )
                  .join("");

                return `
                  <details class="criterion" ${issues.length ? "open" : ""}>
                    <summary>
                      <span>${escapeHtml(criterion.id)} ${escapeHtml(
                        criterion.name,
                      )} (${escapeHtml(criterion.level)})</span>
                      <em>${escapeHtml(criterion.status || "NA")}</em>
                    </summary>
                    ${issueHtml || "<p>No reportable issues.</p>"}
                  </details>
                `;
              })
              .join("");

            return `
              <details class="guideline" open>
                <summary>
                  <span>${escapeHtml(guideline.name)}</span>
                  <em>${escapeHtml(guideline.status || "NA")}</em>
                </summary>
                ${criteria}
              </details>
            `;
          })
          .join("");

        return `
          <details class="principle" open>
            <summary>
              <span>${escapeHtml(principle.name)}</span>
              <em>${escapeHtml(principle.status || "NA")}</em>
            </summary>
            ${guidelines}
          </details>
        `;
      })
      .join("");

    const elementHtml = elementGroups
      .map(
        (group) => `
          <details class="element-group">
            <summary>
              <span>${escapeHtml(
                group.element.elementName || group.element.selector || "Unnamed element",
              )}</span>
              <em>${group.issues.length} issues</em>
            </summary>
            <dl>
              <div><dt>Selector</dt><dd>${escapeHtml(
                group.element.selector || "No CSS selector",
              )}</dd></div>
              <div><dt>Page</dt><dd>${escapeHtml(
                group.element.pageUrl || "No page URL",
              )}</dd></div>
              <div><dt>XPath</dt><dd>${escapeHtml(
                group.element.xpath || "No XPath",
              )}</dd></div>
            </dl>
            <pre>${escapeHtml(group.element.html || "No DOM snippet found.")}</pre>
            <ul>
              ${group.issues
                .map(
                  (issue) =>
                    `<li>${escapeHtml(issue.criterion)} - ${escapeHtml(
                      issue.description,
                    )}</li>`,
                )
                .join("")}
            </ul>
          </details>
        `,
      )
      .join("");

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(requestName)} Accessibility Report</title>
        <style>
          * { box-sizing: border-box; }
          body { background: #f6f8fb; color: #202734; font-family: Arial, sans-serif; margin: 0; padding: 24px; }
          .header, .card, details { background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; }
          .header { display: flex; gap: 16px; justify-content: space-between; margin-bottom: 14px; padding: 18px; }
          .url { overflow-wrap: anywhere; }
          .metrics { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
          .metric { background: #f6f8fb; border: 1px solid #dfe3ea; border-radius: 6px; display: grid; gap: 2px; min-width: 120px; padding: 7px 10px; }
          .metric small { color: #667085; font-size: 11px; }
          .metric strong { font-size: 13px; }
          .tabs { background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; display: flex; gap: 4px; margin-bottom: 14px; padding: 5px; }
          .tabs button { background: transparent; border: 0; border-radius: 6px; cursor: pointer; min-height: 34px; padding: 0 12px; }
          .tabs button.active { background: #edf8f8; color: #167a7f; font-weight: 700; }
          .panel { display: none; }
          .panel.active { display: block; }
          .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
          .card { display: grid; gap: 10px; padding: 18px; }
          .score { color: #167a7f; font-size: 46px; font-weight: 800; }
          .chips { display: flex; flex-wrap: wrap; gap: 8px; }
          .chip { background: #f6f8fb; border: 1px solid #dfe3ea; border-radius: 999px; padding: 6px 10px; }
          table { background: #ffffff; border-collapse: collapse; border: 1px solid #dfe3ea; width: 100%; }
          th, td { border-bottom: 1px solid #eef1f6; padding: 10px; text-align: left; vertical-align: top; }
          th { background: #f6f8fb; }
          details { margin-bottom: 8px; padding: 0; }
          summary { align-items: center; cursor: pointer; display: flex; gap: 12px; justify-content: space-between; padding: 10px 12px; }
          details details { border-radius: 0; border-width: 1px 0 0; margin: 0; }
          .principle > summary { background: #edf8f8; font-weight: 800; }
          .guideline > summary { padding-left: 28px; }
          .criterion > summary { padding-left: 44px; }
          .issue > summary { padding-left: 60px; }
          .issue p, .criterion > p { color: #4b5563; margin: 0; padding: 0 12px 12px 60px; }
          .element { background: #fbfcfe; border-top: 1px solid #eef1f6; padding: 10px 12px 10px 76px; }
          .element h5 { margin: 0 0 4px; }
          .element p { margin: 0 0 8px; padding: 0; }
          pre { background: #f6f8fb; border: 1px solid #dfe3ea; border-radius: 6px; overflow: auto; padding: 10px; white-space: pre-wrap; }
          .element-group { padding: 0; }
          dl { display: grid; gap: 8px; margin: 12px; }
          dl div { background: #f6f8fb; border-radius: 6px; display: grid; gap: 4px; padding: 8px; }
          dt { color: #667085; font-size: 12px; font-weight: 700; }
          dd { margin: 0; overflow-wrap: anywhere; }
        </style>
      </head>
      <body>
        <section class="header">
          <div>
            <h1>${escapeHtml(requestName)} Report</h1>
            <p class="url">${escapeHtml(report.url)}</p>
            <p>${escapeHtml(standardLabel)}</p>
          </div>
          <div class="metrics">
            <span class="metric"><small>Report Size</small><strong>${ReportController.formatBytes(
              report.reportSize,
            )}</strong></span>
            <span class="metric"><small>Generation Time</small><strong>${ReportController.formatDuration(
              report.generationTime,
            )}</strong></span>
            <span class="metric"><small>Accessibility Score</small><strong>${escapeHtml(
              report.accessibilityScore,
            )}%</strong></span>
            <span class="metric"><small>Generated</small><strong>${escapeHtml(
              new Date(report.createdAt).toLocaleString(),
            )}</strong></span>
          </div>
        </section>

        <nav class="tabs" aria-label="Report views">
          <button class="active" data-tab="summary" type="button">Summary</button>
          <button data-tab="guidelines" type="button">Guideline View</button>
          <button data-tab="elements" type="button">Element View</button>
          <button data-tab="request" type="button">Request Details</button>
        </nav>

        <main>
          <section class="panel active" id="summary">
            <div class="summary">
              <article class="card">
                <h2>Accessibility Score</h2>
                <div class="score">${escapeHtml(report.accessibilityScore)}%</div>
                <p>${escapeHtml(scoringNote)}</p>
              </article>
              <article class="card">
                <h2>Issues</h2>
                <div class="chips">
                  ${tabCounts
                    .map(
                      ([label, count]) =>
                        `<span class="chip">${escapeHtml(label)}: ${escapeHtml(
                          count,
                        )}</span>`,
                    )
                    .join("")}
                </div>
              </article>
              <article class="card">
                <h2>Severity</h2>
                <div class="chips">
                  <span class="chip">Critical: ${escapeHtml(
                    report.issueSeverityCount?.critical || 0,
                  )}</span>
                  <span class="chip">Serious: ${escapeHtml(
                    report.issueSeverityCount?.serious || 0,
                  )}</span>
                  <span class="chip">Moderate: ${escapeHtml(
                    report.issueSeverityCount?.moderate || 0,
                  )}</span>
                  <span class="chip">Minor: ${escapeHtml(
                    report.issueSeverityCount?.minor || 0,
                  )}</span>
                  <span class="chip">Pages scanned: ${escapeHtml(
                    scannedPages.length || 1,
                  )}</span>
                </div>
              </article>
            </div>
            <p>This report is based on ${escapeHtml(
              standardLabel,
            )}. Automated analysis is included; manual validation may still be required for full compliance.</p>
          </section>

          <section class="panel" id="guidelines">
            ${guidelineHtml || "<p>No guideline data found.</p>"}
          </section>

          <section class="panel" id="elements">
            ${elementHtml || "<p>No element data found.</p>"}
          </section>

          <section class="panel" id="request">
            <table>
              <tbody>
                <tr><th>Request Name</th><td>${escapeHtml(requestName)}</td></tr>
                <tr><th>URL</th><td>${escapeHtml(report.url)}</td></tr>
                <tr><th>Compliance</th><td>${escapeHtml(standardLabel)}</td></tr>
                <tr><th>Pages Scanned</th><td>${escapeHtml(
                  scannedPages.length || 1,
                )}</td></tr>
                <tr><th>Request Type</th><td>${escapeHtml(
                  report.requestDetails?.requestType || "Web",
                )}</td></tr>
                <tr><th>Check Points</th><td>${escapeHtml(
                  (report.requestDetails?.checkPoints || ["All"]).join(", "),
                )}</td></tr>
                <tr><th>Guidelines</th><td>${escapeHtml(
                  (report.requestDetails?.guidelines || ["All"]).join(", "),
                )}</td></tr>
              </tbody>
            </table>
            <h2>Success Criteria Weightage</h2>
            <table>
              <thead><tr><th>Guideline</th><th>Weightage</th></tr></thead>
              <tbody>${requestWeightages || '<tr><td colspan="2">No weightage data.</td></tr>'}</tbody>
            </table>
            <h2>Scanned Pages</h2>
            <table>
              <thead><tr><th>URL</th><th>Status</th><th>HTTP</th><th>Issues</th></tr></thead>
              <tbody>${scannedPageRows || '<tr><td colspan="4">No scanned page data.</td></tr>'}</tbody>
            </table>
            ${
              pdfValidationRows
                ? `
                  <h2>PDF Validation</h2>
                  <table>
                    <tbody>${pdfValidationRows}</tbody>
                  </table>
                `
                : ""
            }
          </section>
        </main>

        <script>
          document.querySelectorAll("[data-tab]").forEach((button) => {
            button.addEventListener("click", () => {
              document.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active"));
              document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
              button.classList.add("active");
              document.getElementById(button.dataset.tab).classList.add("active");
            });
          });
        </script>
      </body>
      </html>
    `;
  }

  static generateTranscriptionHTMLReport(report) {
    const requestName = ReportController.getRequestName(report);
    const transcription = report.transcription || {};
    const sectionHtml = (transcription.sections || [])
      .map(
        (section) => `
          <section class="card">
            <h2>${escapeHtml(section.checkpoint)}</h2>
            <ul>
              ${(section.lines || [])
                .map((line) => `<li>${escapeHtml(line)}</li>`)
                .join("")}
            </ul>
          </section>
        `,
      )
      .join("");

    const notesHtml = (transcription.notes || [])
      .map((note) => `<li>${escapeHtml(note)}</li>`)
      .join("");

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(requestName)} JAWS Transcription</title>
        <style>
          * { box-sizing: border-box; }
          body { background: #f6f8fb; color: #202734; font-family: Arial, sans-serif; margin: 0; padding: 24px; }
          .header, .card { background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; }
          .header { display: flex; gap: 16px; justify-content: space-between; margin-bottom: 14px; padding: 18px; }
          .url { overflow-wrap: anywhere; }
          .metrics { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
          .metric { background: #f6f8fb; border: 1px solid #dfe3ea; border-radius: 6px; display: grid; gap: 2px; min-width: 120px; padding: 7px 10px; }
          .metric small { color: #667085; font-size: 11px; }
          .metric strong { font-size: 13px; }
          .card { display: grid; gap: 10px; margin-bottom: 12px; padding: 16px; }
          h1, h2 { margin: 0; }
          h1 { font-size: 22px; }
          h2 { font-size: 15px; }
          pre { background: #fbfcfe; border: 1px solid #eef1f6; border-radius: 6px; font-size: 13px; line-height: 1.55; overflow: auto; padding: 12px; white-space: pre-wrap; }
          ul { color: #4b5563; line-height: 1.45; margin: 0; padding-left: 18px; }
        </style>
      </head>
      <body>
        <section class="header">
          <div>
            <h1>${escapeHtml(requestName)} JAWS Transcription</h1>
            <p class="url">${escapeHtml(transcription.url || report.url)}</p>
            <p>Generated from selected checkpoints for ${escapeHtml(
              transcription.screenReader || "JAWS",
            )}.</p>
          </div>
          <div class="metrics">
            <span class="metric"><small>Screen Reader</small><strong>${escapeHtml(
              transcription.screenReader || "JAWS",
            )}</strong></span>
            <span class="metric"><small>Mode</small><strong>${escapeHtml(
              transcription.mode || "semantic-fallback",
            )}</strong></span>
            <span class="metric"><small>Lines</small><strong>${escapeHtml(
              transcription.stats?.lines || 0,
            )}</strong></span>
            <span class="metric"><small>Words</small><strong>${escapeHtml(
              transcription.stats?.words || 0,
            )}</strong></span>
            <span class="metric"><small>Generation Time</small><strong>${ReportController.formatDuration(
              report.generationTime,
            )}</strong></span>
          </div>
        </section>

        <section class="card">
          <h2>Traversal Transcript</h2>
          <pre>${escapeHtml(transcription.actualContent || "")}</pre>
        </section>

        ${sectionHtml || '<section class="card"><p>No transcription sections found.</p></section>'}

        ${
          notesHtml
            ? `<section class="card"><h2>Notes</h2><ul>${notesHtml}</ul></section>`
            : ""
        }
      </body>
      </html>
    `;
  }

  static toReportResponse(report) {
    if (!report) {
      return report;
    }

    const reportResponse = JSON.parse(JSON.stringify(report));
    ReportController.removeDuplicatedPrincipleIssues(reportResponse);
    delete reportResponse.crawlSummary;
    delete reportResponse.scoreHistory;
    delete reportResponse.scanScope;

    return reportResponse;
  }

  static removeDuplicatedPrincipleIssues(report) {
    (report.principles || []).forEach((principle) => {
      (principle.guidelines || []).forEach((guideline) => {
        (guideline.criteria || []).forEach((criterion) => {
          delete criterion.issues;
        });
      });
    });
  }
}

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

module.exports = ReportController;
