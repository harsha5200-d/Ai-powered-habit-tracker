const express = require("express");
const router = express.Router();
const {
  getHabits,
  createHabit,
  updateHabit,
  archiveHabit,
  deleteHabit,
} = require("../controllers/habitController");
const { protect } = require("../middleware/auth");

// All routes here require authentication
router.use(protect);

router.route("/").get(getHabits).post(createHabit);
router.route("/:id").put(updateHabit).delete(deleteHabit);
router.put("/:id/archive", archiveHabit);

module.exports = router;
