const mongoose = require("mongoose");

const LogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    habitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Habit",
      required: true,
    },
    completedDate: {
      type: String, // format: "yyyy-MM-dd"
      required: [true, "Please add a completion date"],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure uniqueness of completion date per habit
LogSchema.index({ habitId: 1, completedDate: 1 }, { unique: true });

module.exports = mongoose.model("Log", LogSchema);
