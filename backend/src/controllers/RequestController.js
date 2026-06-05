const AccessibilityStore = require("../services/AccessibilityStore");
const URLValidator = require("../services/URLValidator");

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
        countryRegulation = "US - ADA / Section 508",
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

      const request = await AccessibilityStore.createRequest({
        url,
        requestName: createRequestName(requestName, url),
        requestType,
        taskType,
        complianceType,
        wcagVersion,
        countryRegulation:
          complianceType === "Country Regulations" ? countryRegulation : undefined,
        conformanceLevel,
        checkPoints,
        guidelines,
        successCriteriaWeightage,
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

module.exports = RequestController;
