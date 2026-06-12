const AccessibilityStore = require("../services/AccessibilityStore");
const URLValidator = require("../services/URLValidator");
const {
  DEFAULT_COUNTRY_REGULATION,
  getCountryComplianceAlignment,
  normalizeCountryRegulation,
} = require("../config/countryCompliance");
const { getSuccessCriteriaForVersion } = require("../config/wcagStandards");

const SUPPORTED_WCAG_VERSIONS = ["2.0", "2.1", "2.2"];
const SUPPORTED_CONFORMANCE_LEVELS = ["A", "AA", "AAA"];
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
      const {
        requestName,
        url,
        requestType = "Web",
        taskType = "Guidelines Check",
        complianceType = "WCAG Standards",
        wcagVersion = "2.2",
        countryRegulation = DEFAULT_COUNTRY_REGULATION,
        conformanceLevel = "AA",
        checkPoints = ["All"],
        guidelines = [],
        successCriteriaWeightage = {},
        scanScope = "Page",
        maxPages = 10,
        maxDepth = 2,
        autoScroll = true,
        includeSitemap = true,
      } = req.body;

      // Validate URL
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!URLValidator.isValidURL(url)) {
        return res.status(400).json({ error: "Enter valid URL" });
      }

      const normalizedComplianceType =
        complianceType === "Country Regulations"
          ? "Country Regulations"
          : "WCAG Standards";
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
        normalizedComplianceType === "Country Regulations"
          ? countryAlignment?.wcagVersion
          : String(wcagVersion || "2.2");
      const normalizedConformanceLevel =
        normalizedComplianceType === "Country Regulations"
          ? countryAlignment?.conformanceLevel
          : String(conformanceLevel || "AA").toUpperCase();

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

      const request = await AccessibilityStore.createRequest({
        url,
        requestName: createRequestName(requestName, url),
        requestType,
        taskType,
        complianceType: normalizedComplianceType,
        wcagVersion: normalizedWcagVersion,
        countryRegulation:
          normalizedComplianceType === "Country Regulations"
            ? normalizedCountryRegulation
            : undefined,
        conformanceLevel: normalizedConformanceLevel,
        checkPoints,
        guidelines,
        successCriteriaWeightage: normalizeSuccessCriteriaWeightage(
          successCriteriaWeightage,
          normalizedWcagVersion,
          guidelines,
        ),
        scanScope: scanScope === "Site" ? "Site" : "Page",
        maxPages: clampNumber(maxPages, 1, 50, 10),
        maxDepth: clampNumber(maxDepth, 0, 5, 2),
        autoScroll: autoScroll !== false,
        includeSitemap: includeSitemap !== false,
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

const createRequestName = (name, url) => {
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || "Accessibility";
  } catch {
    return "Accessibility";
  }
};

const clampNumber = (value, minimum, maximum, fallback) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(number), minimum), maximum);
};

const normalizeSuccessCriteriaWeightage = (
  successCriteriaWeightage,
  wcagVersion,
  guidelines,
) => {
  const providedWeightages = toPlainWeightages(successCriteriaWeightage);

  if (Object.keys(providedWeightages).length > 0) {
    return providedWeightages;
  }

  return createDefaultWeightages(wcagVersion, guidelines);
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
  const versionGuidelineIds = getGuidelineIdsForVersion(wcagVersion);
  const selectedGuidelines = Array.isArray(guidelines)
    ? guidelines.filter((guidelineId) => guidelineId !== "All")
    : [];
  const requestedGuidelines = selectedGuidelines.filter((guidelineId) =>
    versionGuidelineIds.includes(guidelineId),
  );
  const guidelineIds =
    requestedGuidelines.length > 0 ? requestedGuidelines : versionGuidelineIds;
  const totalBase = guidelineIds.reduce(
    (total, guidelineId) => total + Number(BASE_WEIGHTAGES[guidelineId] || 0),
    0,
  );

  if (totalBase <= 0) {
    return {};
  }

  let runningTotal = 0;
  return guidelineIds.reduce((weightages, guidelineId, index) => {
    const value =
      index === guidelineIds.length - 1
        ? 100 - runningTotal
        : Math.round((BASE_WEIGHTAGES[guidelineId] / totalBase) * 100);

    runningTotal += value;
    weightages[guidelineId] = value;
    return weightages;
  }, {});
};

const getGuidelineIdsForVersion = (wcagVersion) =>
  Array.from(
    new Set(
      Object.values(getSuccessCriteriaForVersion(wcagVersion)).map(
        (criterion) => criterion.guideline || criterion.guidelineId,
      ),
    ),
  );

module.exports = RequestController;
