const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const RequestController = require("../controllers/RequestController");

const router = express.Router();

const uploadDir = path.resolve(__dirname, "../../uploads/pdf");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || ".pdf";
    const baseName =
      path
        .basename(file.originalname, extension)
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 80) || "document";

    callback(null, `${Date.now()}-${baseName}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.PDF_UPLOAD_LIMIT_BYTES || 100 * 1024 * 1024),
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const isPdfExtension = extension === ".pdf" || extension === ".pdfx";
    const isPdfMimeType = [
      "application/pdf",
      "application/octet-stream",
      "application/vnd.adobe.pdf",
    ].includes(file.mimetype);

    if (isPdfExtension && isPdfMimeType) {
      callback(null, true);
      return;
    }

    callback(new Error("Only PDF and PDF/X files are supported"));
  },
});

router.post("/", (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return RequestController.createRequest(req, res, next);
  });
});
router.get("/", RequestController.getAllRequests);
router.get("/:requestId", RequestController.getRequest);
router.put("/:requestId", RequestController.updateRequest);
router.delete("/:requestId", RequestController.deleteRequest);

module.exports = router;
