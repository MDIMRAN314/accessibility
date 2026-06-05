const express = require("express");
const RequestController = require("../controllers/RequestController");

const router = express.Router();

router.post("/", RequestController.createRequest);
router.get("/", RequestController.getAllRequests);
router.get("/:requestId", RequestController.getRequest);
router.put("/:requestId", RequestController.updateRequest);
router.delete("/:requestId", RequestController.deleteRequest);

module.exports = router;
