const AccessibilityStore = require("../services/AccessibilityStore");
const URLValidator = require("../services/URLValidator");
const {
  DEFAULT_COUNTRY_REGULATION,
  getCountryComplianceAlignment,
  normalizeCountryRegulation,
} = require("../config/countryCompliance");
const { normalizeEngineOptions } = require("../config/scanEngines");
const {
  getGuidelineIdsForVersion,
  resolveSelectedGuidelines,
} = require("../config/guidelineScope");

const SUPPORTED_WCAG_VERSIONS = ["2.0", "2.1", "2.2"];
const SUPPORTED_CONFORMANCE_LEVELS = ["A", "AA", "AAA"];
const SUPPORTED_SCREEN_READERS = ["JAWS"];
const SUPPORTED_REQUEST_TYPES = ["Web", "Mobile", "PDF"];
const SUPPORTED_PDF_STANDARDS = [
  "PDF/UA (ISO 14289)",
  "WCAG 2.0",
  "WCAG 2.1",
  "WCAG 2.2",
];
const BASE_WEIGHTAGES = {
  "1.1": 10,
  "1.2": 5,
  "1.3": 8,
  "1.4": 7,
  "2.1": 10,
  "2.2": 4,
  "2.3": 2,
  "2.4": 10,
  "2.5": 6,
  "3.1": 7,
  "3.2": 8,
  "3.3": 8,
  "4.1": 15,
};

class RequestController {
  static async createRequest(req, res) {
    try {
      const body = parseRequestBody(req.body);
      const {
        requestName,
        url,
        requestType = "Web",
        taskType = "Guidelines Check",
        screenReader = "JAWS",
        complianceType = "WCAG Standards",
        wcagVersion = "2.2",
        countryRegulation = DEFAULT_COUNTRY_REGULATION,
        conformanceLevel = "AA",
        pdfStandard = "PDF/UA (ISO 14289)",
        passCriteriaPercentage = 50,
        pdfMaxFailures = 100,
        checkPoints = ["All"],
        guidelines = [],
        successCriteriaWeightage = {},
        engineOptions = {},
      } = body;
      const normalizedRequestType = SUPPORTED_REQUEST_TYPES.includes(requestType)
        ? requestType
        : "Web";
      const isPdfRequest = normalizedRequestType === "PDF";
      const uploadedFile = req.file;

      // Validate URL
      if (!isPdfRequest && !url) {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!isPdfRequest && !URLValidator.isValidURL(url)) {
        return res.status(400).json({ error: "Enter valid URL" });
      }

      if (isPdfRequest && !uploadedFile) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      const normalizedComplianceType =
        !isPdfRequest && complianceType === "Country Regulations"
          ? "Country Regulations"
          : "WCAG Standards";
      const normalizedTaskType =
        isPdfRequest
          ? "Guidelines Check"
          : taskType === "Generate Screen Reader Transcription"
          ? "Generate Screen Reader Transcription"
          : taskType === "Transcription Comparison"
            ? "Transcription Comparison"
            : "Guidelines Check";
      const normalizedScreenReader = String(screenReader || "JAWS").trim();
      const normalizedPdfStandard = SUPPORTED_PDF_STANDARDS.includes(pdfStandard)
        ? pdfStandard
        : "PDF/UA (ISO 14289)";
      const normalizedCountryRegulation =
        normalizedComplianceType === "Country Regulations"
          ? normalizeCountryRegulation(countryRegulation)
          : undefined;
      const countryAlignment =
        normalizedComplianceType === "Country Regulations" &&
        normalizedCountryRegulation
          ? getCountryComplianceAlignment(normalizedCountryRegulation)
          : undefined;
      const normalizedWcagVersion =
        isPdfRequest
          ? getWcagVersionForPdfStandard(normalizedPdfStandard)
          : normalizedComplianceType === "Country Regulations"
          ? countryAlignment?.wcagVersion
          : String(wcagVersion || "2.2");
      const normalizedConformanceLevel =
        isPdfRequest
          ? "AA"
          : normalizedComplianceType === "Country Regulations"
          ? countryAlignment?.conformanceLevel
          : String(conformanceLevel || "AA").toUpperCase();
      const normalizedUrl = isPdfRequest
        ? uploadedFile.originalname
        : String(url || "").trim();
      const normalizedCheckPoints = normalizeArrayField(checkPoints, ["All"]);
      const normalizedGuidelines = normalizeArrayField(guidelines, []);
      const normalizedEngineOptions =
        !isPdfRequest && normalizedTaskType === "Guidelines Check"
          ? normalizeEngineOptions(engineOptions)
          : undefined;

      if (
        normalizedComplianceType === "Country Regulations" &&
        !normalizedCountryRegulation
      ) {
        return res.status(400).json({
          error: `Unsupported country regulation: ${countryRegulation}`,
        });
      }

      if (!SUPPORTED_WCAG_VERSIONS.includes(normalizedWcagVersion)) {
        return res.status(400).json({
          error: `Unsupported WCAG version: ${normalizedWcagVersion}. Supported versions: ${SUPPORTED_WCAG_VERSIONS.join(", ")}`,
        });
      }

      if (!SUPPORTED_CONFORMANCE_LEVELS.includes(normalizedConformanceLevel)) {
        return res.status(400).json({
          error: `Unsupported conformance level: ${normalizedConformanceLevel}. Supported levels: ${SUPPORTED_CONFORMANCE_LEVELS.join(", ")}`,
        });
      }

      if (
        normalizedTaskType === "Generate Screen Reader Transcription" &&
        !SUPPORTED_SCREEN_READERS.includes(normalizedScreenReader)
      ) {
        return res.status(400).json({
          error: `Unsupported screen reader: ${normalizedScreenReader}. Supported screen readers: ${SUPPORTED_SCREEN_READERS.join(", ")}`,
        });
      }

      if (
        normalizedTaskType === "Generate Screen Reader Transcription" &&
        normalizedRequestType !== "Web"
      ) {
        return res.status(400).json({
          error: "Screen reader transcription is supported for Web requests only",
        });
      }

      if (
        normalizedTaskType === "Generate Screen Reader Transcription" &&
        (!Array.isArray(normalizedCheckPoints) ||
          normalizedCheckPoints.length === 0)
      ) {
        return res.status(400).json({
          error: "At least one accessibility checkpoint is required",
        });
      }

      const providedWeightages = toPlainWeightages(successCriteriaWeightage);
      const effectiveGuidelines =
        normalizedTaskType === "Generate Screen Reader Transcription"
          ? []
          : resolveSelectedGuidelines({
              selectedGuidelines: normalizedGuidelines,
              successCriteriaWeightage: providedWeightages,
              wcagVersion: normalizedWcagVersion,
              checkPoints: normalizedCheckPoints,
              requestType: normalizedRequestType,
            });
      const normalizedSuccessCriteriaWeightage =
        normalizedTaskType === "Generate Screen Reader Transcription"
          ? {}
          : normalizeSuccessCriteriaWeightage(
              successCriteriaWeightage,
              normalizedWcagVersion,
              effectiveGuidelines,
            );

      const request = await AccessibilityStore.createRequest({
        url: normalizedUrl,
        requestName: createRequestName(
          requestName,
          normalizedUrl,
          uploadedFile?.originalname,
        ),
        requestType:
          normalizedTaskType === "Generate Screen Reader Transcription"
            ? "Web"
            : normalizedRequestType,
        taskType: normalizedTaskType,
        screenReader:
          normalizedTaskType === "Generate Screen Reader Transcription"
            ? normalizedScreenReader
            : undefined,
        complianceType: normalizedComplianceType,
        wcagVersion: normalizedWcagVersion,
        countryRegulation:
          normalizedComplianceType === "Country Regulations"
            ? normalizedCountryRegulation
            : undefined,
        conformanceLevel: normalizedConformanceLevel,
        pdfStandard: isPdfRequest ? normalizedPdfStandard : undefined,
        passCriteriaPercentage: isPdfRequest
          ? clampPercentage(passCriteriaPercentage, 50)
          : undefined,
        pdfMaxFailures: isPdfRequest
          ? normalizePositiveInteger(pdfMaxFailures, 100)
          : undefined,
        checkPoints: normalizedCheckPoints,
        guidelines: effectiveGuidelines,
        successCriteriaWeightage: normalizedSuccessCriteriaWeightage,
        engineOptions: normalizedEngineOptions,
        sourceFileName: uploadedFile?.originalname,
        sourceFilePath: uploadedFile?.path,
        sourceFileMimeType: uploadedFile?.mimetype,
        sourceFileSize: uploadedFile?.size,
        status: "Pending",
      });

      res.status(201).json({
        success: true,
        request,
        message: "Accessibility request created successfully",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getRequest(req, res) {
    try {
      const { requestId } = req.params;
      const request = await AccessibilityStore.findRequest(requestId);

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      res.json(request);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getAllRequests(req, res) {
    try {
      const requests = await AccessibilityStore.findRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateRequest(req, res) {
    try {
      const { requestId } = req.params;
      const updateData = req.body;

      const request = await AccessibilityStore.updateRequest(requestId, updateData);

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      res.json({
        success: true,
        request,
        message: "Request updated successfully",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteRequest(req, res) {
    try {
      const { requestId } = req.params;
      const request = await AccessibilityStore.deleteRequest(requestId);

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      res.json({
        success: true,
        message: "Request deleted successfully",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

const parseRequestBody = (body = {}) => {
  if (typeof body.metadata === "string") {
    try {
      const metadata = JSON.parse(body.metadata);
      return metadata && typeof metadata === "object" ? metadata : {};
    } catch {
      return {};
    }
  }

  return Object.entries(body).reduce((parsed, [key, value]) => {
    parsed[key] = parseFieldValue(value);
    return parsed;
  }, {});
};

const parseFieldValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return value;
  }

  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
};

const normalizeArrayField = (value, fallback = []) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    const parsed = parseFieldValue(value);

    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean);
    }

    if (value.trim()) {
      return [value.trim()];
    }
  }

  return fallback;
};

const getWcagVersionForPdfStandard = (pdfStandard) => {
  if (pdfStandard === "WCAG 2.0") {
    return "2.0";
  }

  if (pdfStandard === "WCAG 2.1") {
    return "2.1";
  }

  return "2.2";
};

const clampPercentage = (value, fallback) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, numericValue));
};

const normalizePositiveInteger = (value, fallback) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.trunc(numericValue);
};

const createRequestName = (name, url, fileName) => {
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  if (typeof fileName === "string" && fileName.trim()) {
    return fileName.replace(/\.(pdf|pdfx)$/i, "").trim() || "PDF Accessibility";
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || "Accessibility";
  } catch {
    return "Accessibility";
  }
};

const normalizeSuccessCriteriaWeightage = (
  successCriteriaWeightage,
  wcagVersion,
  guidelines,
) => {
  const providedWeightages = toPlainWeightages(successCriteriaWeightage);

  if (Object.keys(providedWeightages).length > 0) {
    return filterWeightagesForGuidelines(
      providedWeightages,
      wcagVersion,
      guidelines,
    );
  }

  return createDefaultWeightages(wcagVersion, guidelines);
};

const filterWeightagesForGuidelines = (weightages, wcagVersion, guidelines) => {
  if (Array.isArray(guidelines) && guidelines.length === 0) {
    return {};
  }

  const versionGuidelineIds = getGuidelineIdsForVersion(wcagVersion);
  const selectedGuidelines = Array.isArray(guidelines)
    ? guidelines.filter((guidelineId) => guidelineId !== "All")
    : [];
  const allowedGuidelines =
    selectedGuidelines.length > 0 ? selectedGuidelines : versionGuidelineIds;
  const allowedGuidelineSet = new Set(allowedGuidelines);

  return Object.entries(weightages).reduce((filtered, [guidelineId, weight]) => {
    if (allowedGuidelineSet.has(guidelineId)) {
      filtered[guidelineId] = weight;
    }

    return filtered;
  }, {});
};

const toPlainWeightages = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries =
    value instanceof Map ? Array.from(value.entries()) : Object.entries(value);

  return entries.reduce((weightages, [guidelineId, weight]) => {
    const numericWeight = Number(weight);

    if (Number.isFinite(numericWeight) && numericWeight >= 0) {
      weightages[guidelineId] = numericWeight;
    }

    return weightages;
  }, {});
};

const createDefaultWeightages = (wcagVersion, guidelines) => {
  if (Array.isArray(guidelines) && guidelines.length === 0) {
    return {};
  }

  const versionGuidelineIds = getGuidelineIdsForVersion(wcagVersion);
  const selectedGuidelines = Array.isArray(guidelines)
    ? guidelines.filter((guidelineId) => guidelineId !== "All")
    : [];
  const requestedGuidelines = selectedGuidelines.filter((guidelineId) =>
    versionGuidelineIds.includes(guidelineId),
  );
  const guidelineIds =
    requestedGuidelines.length > 0 ? requestedGuidelines : versionGuidelineIds;

  return guidelineIds.reduce((weightages, guidelineId) => {
    weightages[guidelineId] = Number(BASE_WEIGHTAGES[guidelineId] || 0);
    return weightages;
  }, {});
};

module.exports = RequestController;
