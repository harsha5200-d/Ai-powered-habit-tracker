const express = require("express");
const router = express.Router();
const {
  createLog,
  deleteLog,
  getTodayLogs,
  getRangeLogs,
  getHeatmapLogs,
  getStatsLogs,
  getHabitStatsLogs,
} = require("../controllers/logController");
const { protect } = require("../middleware/auth");

// All routes require authentication
router.use(protect);

router.route("/").post(createLog).delete(deleteLog);
router.get("/today", getTodayLogs);
router.get("/range", getRangeLogs);
router.get("/heatmap", getHeatmapLogs);
router.get("/stats", getStatsLogs);
router.get("/stats/:id", getHabitStatsLogs);

module.exports = router;
