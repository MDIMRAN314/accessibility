const express = require("express");
const ReportController = require("../controllers/ReportController");

const router = express.Router();

router.post("/:requestId/generate", ReportController.generateReport);
router.get("/request/:requestId", ReportController.getReportByRequestId);
router.get("/:reportId", ReportController.getReport);
router.put("/:reportId/issue/:issueId", ReportController.updateIssueStatus);
router.put("/:reportId/element/status", ReportController.updateElementStatus);
router.get("/:reportId/download", ReportController.downloadReport);

module.exports = router;
