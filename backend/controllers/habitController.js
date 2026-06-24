const Habit = require("../models/Habit");
const Log = require("../models/Log");

// @desc    Get user habits
// @route   GET /api/habits
// @access  Private
const getHabits = async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    
    const query = { userId: req.user._id };
    if (!includeArchived) {
      query.isArchived = false;
    }

    const habits = await Habit.find(query).sort({ order: 1, createdAt: 1 });
    res.json(habits);
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new habit
// @route   POST /api/habits
// @access  Private
const createHabit = async (req, res, next) => {
  try {
    const { name, description, category, frequency, targetDays, color, icon } = req.body;

    if (!name) {
      res.status(400);
      throw new Error("Please add a habit name");
    }

    // Determine the next order number
    const habitCount = await Habit.countDocuments({ userId: req.user._id });

    const habit = await Habit.create({
      userId: req.user._id,
      name,
      description: description || "",
      category: category || "Other",
      frequency: frequency || "daily",
      targetDays: targetDays || 7,
      color: color || "#6366f1",
      icon: icon || "🎯",
      order: habitCount,
    });

    res.status(201).json(habit);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a habit
// @route   PUT /api/habits/:id
// @access  Private
const updateHabit = async (req, res, next) => {
  try {
    let habit = await Habit.findById(req.params.id);

    if (!habit) {
      res.status(404);
      throw new Error("Habit not found");
    }

    // Make sure user owns habit
    if (habit.userId.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error("User not authorized");
    }

    habit = await Habit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json(habit);
  } catch (error) {
    next(error);
  }
};

// @desc    Archive / unarchive a habit
// @route   PUT /api/habits/:id/archive
// @access  Private
const archiveHabit = async (req, res, next) => {
  try {
    const habit = await Habit.findById(req.params.id);

    if (!habit) {
      res.status(404);
      throw new Error("Habit not found");
    }

    // Make sure user owns habit
    if (habit.userId.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error("User not authorized");
    }

    habit.isArchived = !habit.isArchived;
    await habit.save();

    res.json(habit);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a habit
// @route   DELETE /api/habits/:id
// @access  Private
const deleteHabit = async (req, res, next) => {
  try {
    const habit = await Habit.findById(req.params.id);

    if (!habit) {
      res.status(404);
      throw new Error("Habit not found");
    }

    // Make sure user owns habit
    if (habit.userId.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error("User not authorized");
    }

    // Delete associated logs first
    await Log.deleteMany({ habitId: habit._id });
    
    // Delete habit
    await habit.deleteOne();

    res.json({ message: "Habit and associated logs deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHabits,
  createHabit,
  updateHabit,
  archiveHabit,
  deleteHabit,
};
