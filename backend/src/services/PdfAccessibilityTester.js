const fs = require("fs");
const { spawn } = require("child_process");
const { getSuccessCriteriaForVersion } = require("../config/wcagStandards");

const DEFAULT_VERAPDF_TIMEOUT_MS = 120000;
const VERAPDF_DOWNLOAD_URL =
  process.env.VERAPDF_DOWNLOAD_URL || "https://verapdf.org/software/";
const VERAPDF_INSTALL_URL = "https://docs.verapdf.org/install/";
const CONFORMANCE_LEVEL_RANK = {
  A: 1,
  AA: 2,
  AAA: 3,
};

const PDF_CRITERION_MAPPINGS = [
  { checkpoint: "Tagged Content", criterion: "1.3.1" },
  { checkpoint: "Primary Language", criterion: "3.1.1" },
  { checkpoint: "Bookmarks", criterion: "2.4.5" },
  { checkpoint: "Tab Order", criterion: "2.4.3" },
  { checkpoint: "Images", criterion: "1.1.1" },
  { checkpoint: "Video/Audio", criterion: "1.2.1" },
  { checkpoint: "Video/Audio", criterion: "1.2.2" },
  { checkpoint: "Video/Audio", criterion: "1.2.3" },
  { checkpoint: "Video/Audio", criterion: "1.2.4" },
  { checkpoint: "Video/Audio", criterion: "1.2.5" },
  { checkpoint: "Forms", criterion: "1.3.1" },
  { checkpoint: "Forms", criterion: "3.3.1" },
  { checkpoint: "Forms", criterion: "3.3.2" },
  { checkpoint: "Forms", criterion: "4.1.2" },
  { checkpoint: "Forms", criterion: "4.1.3" },
  { checkpoint: "Tables", criterion: "1.3.1" },
  { checkpoint: "Lists", criterion: "1.3.1" },
  { checkpoint: "Headings", criterion: "1.3.1" },
  { checkpoint: "Headings", criterion: "2.4.6" },
  { checkpoint: "Links/Buttons", criterion: "2.4.4" },
  { checkpoint: "Links/Buttons", criterion: "4.1.2" },
  { checkpoint: "Colour Contrast", criterion: "1.4.3" },
  { checkpoint: "Colour Contrast", criterion: "1.4.11" },
  { checkpoint: "Language", criterion: "3.1.1" },
  { checkpoint: "Language", criterion: "3.1.2" },
  { checkpoint: "Title", criterion: "2.4.2" },
  { checkpoint: "Reading Order", criterion: "1.3.2" },
  { checkpoint: "Decorative Elements", criterion: "1.1.1" },
];

const FAILURE_CLASSIFIERS = [
  {
    checkpoint: "Primary Language",
    criterion: "3.1.1",
    patterns: [/language/, /\blang\b/],
  },
  {
    checkpoint: "Title",
    criterion: "2.4.2",
    patterns: [/title/],
  },
  {
    checkpoint: "Bookmarks",
    criterion: "2.4.5",
    patterns: [/bookmark/, /outline/],
  },
  {
    checkpoint: "Images",
    criterion: "1.1.1",
    patterns: [/alternate text/, /\balt\b/, /figure/, /image/],
  },
  {
    checkpoint: "Decorative Elements",
    criterion: "1.1.1",
    patterns: [/artifact/, /decorative/],
  },
  {
    checkpoint: "Reading Order",
    criterion: "1.3.2",
    patterns: [/reading order/, /logical order/],
  },
  {
    checkpoint: "Tab Order",
    criterion: "2.4.3",
    patterns: [/tab order/, /focus order/],
  },
  {
    checkpoint: "Forms",
    criterion: "4.1.2",
    patterns: [/form/, /field/, /widget/, /annotation/],
  },
  {
    checkpoint: "Tables",
    criterion: "1.3.1",
    patterns: [/table/, /header cell/],
  },
  {
    checkpoint: "Lists",
    criterion: "1.3.1",
    patterns: [/\blist\b/, /list item/],
  },
  {
    checkpoint: "Headings",
    criterion: "2.4.6",
    patterns: [/heading/],
  },
  {
    checkpoint: "Links/Buttons",
    criterion: "2.4.4",
    patterns: [/link/, /button/],
  },
  {
    checkpoint: "Colour Contrast",
    criterion: "1.4.3",
    patterns: [/contrast/, /color/, /colour/],
  },
  {
    checkpoint: "Video/Audio",
    criterion: "1.2.2",
    patterns: [/caption/, /audio/, /video/, /media/],
  },
  {
    checkpoint: "Tagged Content",
    criterion: "1.3.1",
    patterns: [/tagged/, /structure/, /semantic/, /role map/],
  },
];

class PdfAccessibilityTester {
  static async getVeraPdfStatus() {
    const command = process.env.VERAPDF_COMMAND || "verapdf";

    try {
      const result = await this.spawnCommand(command, ["--version"], 10000);
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      const commandError = this.getCommandUnavailableError(output);

      if (commandError) {
        return this.createUnavailableStatus(commandError);
      }

      return {
        available: true,
        command,
        downloadUrl: VERAPDF_DOWNLOAD_URL,
        installUrl: VERAPDF_INSTALL_URL,
        version: this.extractToolVersion(result.stdout, result.stderr),
        message: "veraPDF is available.",
      };
    } catch (error) {
      return this.createUnavailableStatus(error.message, command);
    }
  }

  static createUnavailableStatus(error, command = process.env.VERAPDF_COMMAND || "verapdf") {
    return {
      available: false,
      command,
      downloadUrl: VERAPDF_DOWNLOAD_URL,
      installUrl: VERAPDF_INSTALL_URL,
      error,
      message: `veraPDF is required before generating PDF reports. Download and install veraPDF from ${VERAPDF_DOWNLOAD_URL}, configure VERAPDF_COMMAND, then try again.`,
    };
  }

  static async runPdfScan({
    filePath,
    fileName,
    pdfStandard = "PDF/UA (ISO 14289)",
    wcagVersion = "2.2",
    conformanceLevel = "AA",
    checkPoints = ["All"],
    selectedGuidelines = ["All"],
    pdfMaxFailures = 100,
  }) {
    const selectedCriteria = this.getSelectedPdfCriteria({
      wcagVersion,
      conformanceLevel,
      checkPoints,
      selectedGuidelines,
    });
    const validation = await this.runVeraPdf(filePath, pdfStandard, pdfMaxFailures);
    const failedIssues = validation.failedChecks
      .map((check, index) =>
        this.mapVeraFailureToIssue({
          check,
          index,
          fileName,
          wcagVersion,
          selectedCriteria,
          selectedGuidelines,
          checkPoints,
        }),
      )
      .filter(Boolean);

    if (!validation.toolAvailable || validation.error) {
      const issues = [
        this.createToolIssue({
          error: validation.error || "veraPDF validation did not complete",
          fileName,
          wcagVersion,
          selectedCriteria,
        }),
      ];

      return this.createScanResult({
        fileName,
        validation,
        issues,
        status: "Failed",
      });
    }

    const failedCriteria = new Set(failedIssues.map((issue) => issue.criterion));
    const passIssues =
      validation.isCompliant === false && failedIssues.length === 0
        ? []
        : selectedCriteria
            .filter((item) => !failedCriteria.has(item.criterion))
            .map((item) => this.createPassIssue(item, fileName));
    const issues =
      validation.isCompliant === false && failedIssues.length === 0
        ? [
            this.createGenericFailureIssue({
              fileName,
              wcagVersion,
              selectedCriteria,
            }),
          ]
        : [...passIssues, ...failedIssues];

    return this.createScanResult({
      fileName,
      validation,
      issues,
      status: "Validated",
    });
  }

  static getSelectedPdfCriteria({
    wcagVersion,
    conformanceLevel,
    checkPoints,
    selectedGuidelines,
  }) {
    const criteria = getSuccessCriteriaForVersion(wcagVersion);
    const requestedCheckPoints = new Set(checkPoints || ["All"]);
    const requestedGuidelines = new Set(selectedGuidelines || ["All"]);
    const includeAllCheckPoints = requestedCheckPoints.has("All");
    const includeAllGuidelines = requestedGuidelines.has("All");
    const seen = new Set();

    return PDF_CRITERION_MAPPINGS.filter((mapping) => {
      if (!includeAllCheckPoints && !requestedCheckPoints.has(mapping.checkpoint)) {
        return false;
      }

      const guidelineId = this.getGuidelineId(mapping.criterion);
      if (!includeAllGuidelines && !requestedGuidelines.has(guidelineId)) {
        return false;
      }

      const criterionConfig = criteria[mapping.criterion];
      if (!criterionConfig) {
        return false;
      }

      if (
        !this.isCriterionInConformance(criterionConfig, conformanceLevel)
      ) {
        return false;
      }

      if (seen.has(mapping.criterion)) {
        return false;
      }

      seen.add(mapping.criterion);
      return true;
    }).map((mapping) => ({
      ...mapping,
      config: criteria[mapping.criterion],
    }));
  }

  static async runVeraPdf(filePath, pdfStandard, pdfMaxFailures) {
    if (!filePath || !fs.existsSync(filePath)) {
      return {
        standard: pdfStandard,
        tool: "veraPDF",
        toolAvailable: false,
        isCompliant: null,
        error: "Uploaded PDF file was not found on the server",
        failedChecks: [],
      };
    }

    const command = process.env.VERAPDF_COMMAND || "verapdf";
    const args = this.buildVeraPdfArgs(filePath, pdfStandard, pdfMaxFailures);

    try {
      const result = await this.spawnCommand(command, args, this.getTimeoutMs());
      const parsed = this.parseVeraPdfOutput(result.stdout);
      const failedChecks = parsed
        ? this.extractFailedChecks(parsed)
        : [];
      const isCompliant = parsed
        ? this.extractFirstBoolean(parsed, "isCompliant")
        : null;
      const commandError = this.getCommandUnavailableError(
        result.stderr || result.stdout,
      );

      if (!parsed && result.exitCode !== 0) {
        return {
          standard: pdfStandard,
          tool: "veraPDF",
          toolAvailable: !commandError,
          isCompliant: false,
          error:
            commandError ||
            this.truncateText(result.stderr || result.stdout, 1200) ||
            `veraPDF exited with code ${result.exitCode}`,
          failedChecks: [],
        };
      }

      return {
        standard: pdfStandard,
        tool: "veraPDF",
        toolAvailable: true,
        toolVersion: this.extractToolVersion(result.stdout, result.stderr),
        isCompliant:
          typeof isCompliant === "boolean"
            ? isCompliant
            : failedChecks.length === 0,
        error: result.exitCode !== 0 && failedChecks.length === 0
          ? this.truncateText(result.stderr, 1200)
          : undefined,
        failedChecks,
        failedRules: failedChecks.length,
        rawSummary: this.extractRawSummary(parsed),
      };
    } catch (error) {
      return {
        standard: pdfStandard,
        tool: "veraPDF",
        toolAvailable: false,
        isCompliant: null,
        error: error.message,
        failedChecks: [],
      };
    }
  }

  static buildVeraPdfArgs(filePath, pdfStandard, pdfMaxFailures) {
    const configuredArgs = this.splitArgs(process.env.VERAPDF_ARGS || "");
    const maxFailures = this.normalizeMaxFailures(pdfMaxFailures);

    if (configuredArgs.length > 0) {
      return [
        ...configuredArgs,
        ...(maxFailures ? ["--maxfailures", String(maxFailures)] : []),
        filePath,
      ];
    }

    const args = ["--format", "json"];
    const profile =
      String(pdfStandard).startsWith("PDF/UA")
        ? process.env.VERAPDF_PDFUA_PROFILE || process.env.VERAPDF_PROFILE
        : process.env.VERAPDF_PROFILE;
    const flavour = process.env.VERAPDF_FLAVOUR;

    if (profile) {
      args.push("--profile", profile);
    }

    if (flavour) {
      args.push("--flavour", flavour);
    }

    if (maxFailures) {
      args.push("--maxfailures", String(maxFailures));
    }

    args.push(filePath);
    return args;
  }

  static normalizeMaxFailures(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return null;
    }

    return Math.trunc(numericValue);
  }

  static spawnCommand(command, args, timeoutMs) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        shell: process.platform === "win32",
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        child.kill();
        reject(new Error(`veraPDF timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            `Unable to run veraPDF. Download and install veraPDF from ${VERAPDF_DOWNLOAD_URL}, configure VERAPDF_COMMAND, then regenerate the report. ${error.message}`,
          ),
        );
      });

      child.on("close", (exitCode) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve({ exitCode, stdout, stderr });
      });
    });
  }

  static parseVeraPdfOutput(output = "") {
    const trimmed = String(output || "").trim();

    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");

      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  static extractFailedChecks(root) {
    const failures = [];

    this.walk(root, (value, key) => {
      if (!value || typeof value !== "object") {
        return;
      }

      if (
        ["failedChecks", "failedRules", "failed"].includes(key) &&
        Array.isArray(value)
      ) {
        value.forEach((item) => {
          if (item && typeof item === "object") {
            failures.push(this.normalizeFailedCheck(item));
          }
        });
        return;
      }

      const status = String(value.status || value.result || value.outcome || "")
        .toLowerCase();
      const looksLikeCheck =
        value.description ||
        value.errorMessage ||
        value.ruleId ||
        value.clause ||
        value.testNumber;

      if (looksLikeCheck && status.includes("fail")) {
        failures.push(this.normalizeFailedCheck(value));
      }
    });

    return this.dedupeFailedChecks(failures);
  }

  static normalizeFailedCheck(check = {}) {
    return {
      ruleId: check.ruleId || check.id || check.rule || check.specification || "",
      clause: check.clause || check.clauseId || "",
      testNumber: check.testNumber || check.test || check.testId || "",
      description:
        check.description ||
        check.errorMessage ||
        check.message ||
        check.ruleDescription ||
        "veraPDF validation check failed",
      status: check.status || "failed",
      context:
        check.context ||
        check.object ||
        check.location ||
        check.path ||
        check.xPath ||
        "",
    };
  }

  static dedupeFailedChecks(checks) {
    const seen = new Set();

    return checks.filter((check) => {
      const key = [
        check.ruleId,
        check.clause,
        check.testNumber,
        check.description,
        check.context,
      ].join("::");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  static mapVeraFailureToIssue({
    check,
    index,
    fileName,
    wcagVersion,
    selectedCriteria,
    selectedGuidelines,
    checkPoints,
  }) {
    const criteria = getSuccessCriteriaForVersion(wcagVersion);
    const classification = this.classifyFailure(check, criteria);
    const selectedCriterionIds = new Set(
      selectedCriteria.map((item) => item.criterion),
    );
    const requestedGuidelines = new Set(selectedGuidelines || ["All"]);
    const requestedCheckPoints = new Set(checkPoints || ["All"]);

    if (!selectedCriterionIds.has(classification.criterion)) {
      return null;
    }

    if (
      !requestedGuidelines.has("All") &&
      !requestedGuidelines.has(this.getGuidelineId(classification.criterion))
    ) {
      return null;
    }

    if (
      !requestedCheckPoints.has("All") &&
      !requestedCheckPoints.has(classification.checkpoint)
    ) {
      return null;
    }

    const criterionConfig = criteria[classification.criterion];

    return {
      issueId: `PDF-${index + 1}`,
      criterion: classification.criterion,
      principle: this.getPrincipleFromGuideline(criterionConfig?.guideline),
      guideline: criterionConfig?.guidelineName || criterionConfig?.guideline,
      description: check.description || "PDF accessibility validation failed",
      severity: "Serious",
      status: "Fail",
      rawStatus: "Fail",
      finalStatus: "Fail",
      type: "Automated",
      engine: "veraPDF",
      enginePriority: 1,
      pageUrl: fileName,
      pageTitle: fileName,
      suggestedFix:
        "Review the PDF structure and metadata for the mapped PDF/UA and WCAG requirement.",
      howToTest: criterionConfig?.howToTest,
      automationJustification:
        "Validated through veraPDF against the selected PDF standard.",
      referenceLinks: [
        {
          label: "veraPDF validation",
          source: "veraPDF",
          url: "https://verapdf.org/",
        },
      ],
      elements: [
        this.createDocumentElement({
          fileName,
          status: "Fail",
          name: classification.checkpoint,
          details: check.context || check.ruleId || check.clause || "",
        }),
      ],
      createdAt: new Date().toISOString(),
    };
  }

  static classifyFailure(check, criteria) {
    const text = [
      check.ruleId,
      check.clause,
      check.testNumber,
      check.description,
      check.context,
    ]
      .join(" ")
      .toLowerCase();
    const match = FAILURE_CLASSIFIERS.find((classifier) =>
      classifier.patterns.some((pattern) => pattern.test(text)),
    );

    if (match && criteria[match.criterion]) {
      return match;
    }

    const fallbackCriterion = criteria["4.1.2"]
      ? "4.1.2"
      : criteria["4.1.1"]
        ? "4.1.1"
        : Object.keys(criteria)[0] || "1.3.1";

    return {
      checkpoint: "Tagged Content",
      criterion: fallbackCriterion,
    };
  }

  static createPassIssue(item, fileName) {
    return {
      issueId: `PDF-PASS-${item.criterion.replace(/\./g, "-")}`,
      criterion: item.criterion,
      principle: this.getPrincipleFromGuideline(item.config?.guideline),
      guideline: item.config?.guidelineName || item.config?.guideline,
      description: `${item.criterion} ${item.config?.name || ""} passed veraPDF validation.`,
      severity: "None",
      status: "Pass",
      rawStatus: "Pass",
      finalStatus: "Pass",
      type: "Automated",
      engine: "veraPDF",
      enginePriority: 1,
      pageUrl: fileName,
      pageTitle: fileName,
      suggestedFix: "No remediation required for this automated PDF check.",
      howToTest: item.config?.howToTest,
      automationJustification:
        "Validated through veraPDF against the selected PDF standard.",
      referenceLinks: [
        {
          label: "veraPDF validation",
          source: "veraPDF",
          url: "https://verapdf.org/",
        },
      ],
      elements: [
        this.createDocumentElement({
          fileName,
          status: "Pass",
          name: item.checkpoint,
        }),
      ],
      createdAt: new Date().toISOString(),
    };
  }

  static createToolIssue({ error, fileName, wcagVersion, selectedCriteria }) {
    const criterion =
      selectedCriteria[0]?.criterion ||
      (getSuccessCriteriaForVersion(wcagVersion)["4.1.2"] ? "4.1.2" : "1.3.1");
    const config = getSuccessCriteriaForVersion(wcagVersion)[criterion];

    return {
      issueId: "PDF-VERAPDF-ERROR",
      criterion,
      principle: this.getPrincipleFromGuideline(config?.guideline),
      guideline: config?.guidelineName || config?.guideline,
      description: `veraPDF could not validate this PDF. ${error}`,
      severity: "Critical",
      status: "Error",
      rawStatus: "Error",
      finalStatus: "Error",
      type: "Automated",
      engine: "veraPDF",
      pageUrl: fileName,
      pageTitle: fileName,
      suggestedFix:
        `Download and install veraPDF from ${VERAPDF_DOWNLOAD_URL}, set VERAPDF_COMMAND to the installed CLI or batch file, then regenerate the report.`,
      automationJustification:
        "PDF guideline generation is configured to run through veraPDF.",
      referenceLinks: [
        {
          label: "Download veraPDF",
          source: "veraPDF",
          url: VERAPDF_DOWNLOAD_URL,
        },
        {
          label: "veraPDF installation instructions",
          source: "veraPDF Docs",
          url: VERAPDF_INSTALL_URL,
        },
      ],
      elements: [
        this.createDocumentElement({
          fileName,
          status: "Error",
          name: "PDF document",
          details: error,
        }),
      ],
      createdAt: new Date().toISOString(),
    };
  }

  static createGenericFailureIssue({ fileName, wcagVersion, selectedCriteria }) {
    const criterion =
      selectedCriteria[0]?.criterion ||
      (getSuccessCriteriaForVersion(wcagVersion)["4.1.2"] ? "4.1.2" : "1.3.1");
    const config = getSuccessCriteriaForVersion(wcagVersion)[criterion];

    return {
      issueId: "PDF-VERAPDF-FAILED",
      criterion,
      principle: this.getPrincipleFromGuideline(config?.guideline),
      guideline: config?.guidelineName || config?.guideline,
      description:
        "veraPDF reported the PDF as non-compliant, but no individual failed checks were returned in the parsed output.",
      severity: "Serious",
      status: "Fail",
      rawStatus: "Fail",
      finalStatus: "Fail",
      type: "Automated",
      engine: "veraPDF",
      pageUrl: fileName,
      pageTitle: fileName,
      suggestedFix:
        "Run veraPDF with JSON output and review the PDF/UA validation details.",
      automationJustification:
        "Validated through veraPDF against the selected PDF standard.",
      elements: [
        this.createDocumentElement({
          fileName,
          status: "Fail",
          name: "PDF document",
        }),
      ],
      createdAt: new Date().toISOString(),
    };
  }

  static createDocumentElement({ fileName, status, name, details = "" }) {
    return {
      elementId: `PDF-DOCUMENT-${String(name || "document").replace(/\W+/g, "-")}`,
      elementName: name || "PDF document",
      selector: "Document",
      xpath: "",
      html: details,
      screenshot: this.createPdfEvidenceImage({
        fileName,
        status,
        name,
        details,
      }),
      status,
      pageUrl: fileName,
      pageTitle: fileName,
      locators: [
        {
          type: "PDF Object",
          value: details || "Document",
        },
        {
          type: "File",
          value: fileName || "Uploaded PDF",
        },
      ],
    };
  }

  static createPdfEvidenceImage({ fileName, status, name, details = "" }) {
    const titleLines = this.wrapSvgText(name || "PDF document", 34, 2);
    const detailLines = this.wrapSvgText(details || "Document-level PDF check", 68, 5);
    const fileLines = this.wrapSvgText(fileName || "Uploaded PDF", 54, 2);
    const statusColor =
      status === "Pass"
        ? "#067647"
        : status === "Error"
          ? "#b42318"
          : "#b54708";
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
        <rect width="900" height="520" fill="#f6f8fb"/>
        <rect x="36" y="34" width="828" height="452" rx="12" fill="#ffffff" stroke="#dfe3ea"/>
        <rect x="36" y="34" width="828" height="72" rx="12" fill="#edf8f8"/>
        <text x="64" y="78" fill="#167a7f" font-family="Arial, sans-serif" font-size="24" font-weight="700">PDF accessibility evidence</text>
        <rect x="64" y="132" width="140" height="178" rx="8" fill="#fef3f2" stroke="#fecdca"/>
        <text x="92" y="220" fill="#b42318" font-family="Arial, sans-serif" font-size="38" font-weight="800">PDF</text>
        <text x="64" y="352" fill="#6b7280" font-family="Arial, sans-serif" font-size="14" font-weight="700">FILE</text>
        ${fileLines
          .map(
            (line, index) =>
              `<text x="64" y="${378 + index * 22}" fill="#202734" font-family="Arial, sans-serif" font-size="18">${this.escapeSvg(line)}</text>`,
          )
          .join("")}
        <text x="236" y="156" fill="#6b7280" font-family="Arial, sans-serif" font-size="14" font-weight="700">CHECK</text>
        ${titleLines
          .map(
            (line, index) =>
              `<text x="236" y="${188 + index * 30}" fill="#202734" font-family="Arial, sans-serif" font-size="24" font-weight="700">${this.escapeSvg(line)}</text>`,
          )
          .join("")}
        <text x="236" y="268" fill="#6b7280" font-family="Arial, sans-serif" font-size="14" font-weight="700">STATUS</text>
        <rect x="236" y="286" width="130" height="38" rx="19" fill="${statusColor}" opacity="0.12"/>
        <text x="256" y="311" fill="${statusColor}" font-family="Arial, sans-serif" font-size="18" font-weight="800">${this.escapeSvg(status || "Review")}</text>
        <text x="236" y="366" fill="#6b7280" font-family="Arial, sans-serif" font-size="14" font-weight="700">VERAPDF CONTEXT</text>
        ${detailLines
          .map(
            (line, index) =>
              `<text x="236" y="${396 + index * 22}" fill="#334155" font-family="Arial, sans-serif" font-size="17">${this.escapeSvg(line)}</text>`,
          )
          .join("")}
      </svg>
    `;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  static wrapSvgText(value, maxLength, maxLines) {
    const words = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
    const lines = [];
    let currentLine = "";

    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (candidate.length <= maxLength) {
        currentLine = candidate;
        return;
      }

      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    if (lines.length === 0) {
      lines.push("No details available");
    }

    const limitedLines = lines.slice(0, maxLines);

    if (lines.length > maxLines) {
      limitedLines[maxLines - 1] = `${limitedLines[maxLines - 1].slice(0, Math.max(maxLength - 3, 1))}...`;
    }

    return limitedLines;
  }

  static escapeSvg(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  static createScanResult({ fileName, validation, issues, status }) {
    const reportableIssueCount = issues.filter((issue) =>
      ["Fail", "Error", "Warning", "Manual Review"].includes(issue.status),
    ).length;

    return {
      issues,
      scannedPages: [
        {
          url: fileName,
          depth: 0,
          title: fileName,
          status,
          statusCode: null,
          issueCount: reportableIssueCount,
          error: validation.error || null,
        },
      ],
      pdfValidation: {
        ...validation,
        failedChecks: validation.failedChecks.map((check) => {
          const classification = this.classifyFailure(
            check,
            getSuccessCriteriaForVersion("2.2"),
          );

          return {
            ...check,
            criterion: classification.criterion,
            checkpoint: classification.checkpoint,
          };
        }),
      },
    };
  }

  static getGuidelineId(criterion = "") {
    const parts = String(criterion).split(".");
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : criterion;
  }

  static getPrincipleFromGuideline(guidelineId) {
    const first = String(guidelineId || "").split(".")[0];

    if (first === "1") return "Perceivable";
    if (first === "2") return "Operable";
    if (first === "3") return "Understandable";
    if (first === "4") return "Robust";
    return "Robust";
  }

  static isCriterionInConformance(criterionConfig, conformanceLevel = "AA") {
    const requestedLevel =
      CONFORMANCE_LEVEL_RANK[String(conformanceLevel || "AA").toUpperCase()] ||
      CONFORMANCE_LEVEL_RANK.AA;
    const criterionLevel =
      CONFORMANCE_LEVEL_RANK[String(criterionConfig?.level || "AA").toUpperCase()] ||
      requestedLevel;

    return criterionLevel <= requestedLevel;
  }

  static extractFirstBoolean(root, keyName) {
    let found = null;

    this.walk(root, (value, key) => {
      if (found !== null) {
        return;
      }

      if (key === keyName && typeof value === "boolean") {
        found = value;
      }
    });

    return found;
  }

  static extractRawSummary(root) {
    if (!root || typeof root !== "object") {
      return undefined;
    }

    return root.summary || root.report?.summary || root.report?.jobs?.[0]?.summary;
  }

  static extractToolVersion(stdout = "", stderr = "") {
    const text = `${stdout}\n${stderr}`;
    const match = text.match(/veraPDF[^\d]*(\d+(?:\.\d+)+)/i);
    return match?.[1];
  }

  static walk(value, visitor, key = "") {
    visitor(value, key);

    if (Array.isArray(value)) {
      value.forEach((item) => this.walk(item, visitor, key));
      return;
    }

    if (value && typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => {
        this.walk(childValue, visitor, childKey);
      });
    }
  }

  static splitArgs(value) {
    const matches = String(value || "").match(/"[^"]*"|'[^']*'|\S+/g) || [];

    return matches.map((item) =>
      item.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"),
    );
  }

  static getTimeoutMs() {
    const timeout = Number(process.env.VERAPDF_TIMEOUT_MS);

    return Number.isFinite(timeout) && timeout > 0
      ? timeout
      : DEFAULT_VERAPDF_TIMEOUT_MS;
  }

  static getCommandUnavailableError(output = "") {
    const text = String(output || "").toLowerCase();

    if (
      text.includes("not recognized as an internal or external command") ||
      text.includes("is not recognized") ||
      text.includes("command not found") ||
      text.includes("no such file or directory")
    ) {
      return `Unable to run veraPDF. Download and install veraPDF from ${VERAPDF_DOWNLOAD_URL}, configure VERAPDF_COMMAND, then regenerate the report.`;
    }

    return "";
  }

  static truncateText(value, limit) {
    const text = String(value || "").trim();

    if (text.length <= limit) {
      return text;
    }

    return `${text.slice(0, limit)}...`;
  }
}

module.exports = PdfAccessibilityTester;
