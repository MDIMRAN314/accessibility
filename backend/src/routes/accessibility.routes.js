const express = require("express");
const URLValidator = require("../services/URLValidator");
const PdfAccessibilityTester = require("../services/PdfAccessibilityTester");
const { wcagStandards, successCriteria } = require("../config/wcagStandards");

const router = express.Router();

// Validate URL
router.post("/validate-url", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    if (!URLValidator.isValidURL(url)) {
      return res.status(400).json({ error: "Enter valid URL" });
    }

    const validation = await URLValidator.validateURLAccessibility(url);

    res.json({
      success: true,
      ...validation,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get WCAG standards
router.get("/standards/:version", (req, res) => {
  try {
    const { version } = req.params;

    if (!wcagStandards[version]) {
      return res.status(400).json({ error: "Invalid WCAG version" });
    }

    res.json(wcagStandards[version]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all WCAG standards
router.get("/standards", (req, res) => {
  res.json(wcagStandards);
});

// Get success criteria
router.get("/criteria", (req, res) => {
  res.json(successCriteria);
});

router.get("/tools/verapdf", async (req, res) => {
  try {
    const status = await PdfAccessibilityTester.getVeraPdfStatus();

    res.status(status.available ? 200 : 409).json({
      success: status.available,
      veraPdf: status,
      message: status.message,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
