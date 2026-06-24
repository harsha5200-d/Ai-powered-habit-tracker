const express = require("express");
const router = express.Router();
const {
  generateWeeklyReport,
  suggestHabits,
  generateRecoveryPlan,
  chatWithCoach,
  getMorningMotivation,
} = require("../controllers/aiController");
const { protect } = require("../middleware/auth");

// All routes require authentication
router.use(protect);

router.post("/weekly-report", generateWeeklyReport);
router.post("/suggest-habits", suggestHabits);
router.post("/recovery-plan", generateRecoveryPlan);
router.post("/chat", chatWithCoach);
router.get("/morning", getMorningMotivation);

module.exports = router;
