const Log = require("../models/Log");
const Habit = require("../models/Habit");

// Helper to format date to yyyy-MM-dd in local time
const formatDate = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper to subtract days
const subDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
};

// Helper to calculate streaks from sorted completedDate strings
// dates must be sorted ascending (oldest first)
const calculateStreaks = (dates) => {
  if (!dates || dates.length === 0) {
    return { current: 0, longest: 0 };
  }

  const set = new Set(dates);
  const todayStr = formatDate(new Date());
  const yesterdayStr = formatDate(subDays(new Date(), 1));

  let current = 0;
  // If neither today nor yesterday is completed, current streak is 0
  if (!set.has(todayStr) && !set.has(yesterdayStr)) {
    current = 0;
  } else {
    let cursor = set.has(todayStr) ? new Date() : subDays(new Date(), 1);
    while (set.has(formatDate(cursor))) {
      current++;
      cursor = subDays(cursor, 1);
    }
  }

  // Longest streak calculation
  // Parse to timestamps and find longest consecutive run of days
  let longest = 0;
  let run = 0;
  let prevDate = null;

  // dates are sorted ascending
  for (const dStr of dates) {
    const d = new Date(dStr);
    if (prevDate) {
      const diffTime = Math.abs(d - prevDate);
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        run++;
      } else if (diffDays > 1) {
        run = 1; // broken
      }
    } else {
      run = 1;
    }
    if (run > longest) {
      longest = run;
    }
    prevDate = d;
  }

  return { current, longest: Math.max(longest, current) };
};

// @desc    Log a habit completion
// @route   POST /api/logs
// @access  Private
const createLog = async (req, res, next) => {
  try {
    const { habitId, date } = req.body;

    if (!habitId) {
      res.status(400);
      throw new Error("Please add a habit id");
    }

    const habit = await Habit.findById(habitId);
    if (!habit) {
      res.status(404);
      throw new Error("Habit not found");
    }

    // Check ownership
    if (habit.userId.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error("Not authorized");
    }

    const completedDate = date || formatDate(new Date());

    // Check if log already exists
    let log = await Log.findOne({ habitId, completedDate });
    if (log) {
      return res.json(log);
    }

    log = await Log.create({
      userId: req.user._id,
      habitId,
      completedDate,
    });

    res.status(201).json(log);
  } catch (error) {
    next(error);
  }
};

// @desc    Unmark a habit completion
// @route   DELETE /api/logs
// @access  Private
const deleteLog = async (req, res, next) => {
  try {
    // Delete accepts body
    const { habitId, date } = req.body;

    if (!habitId) {
      res.status(400);
      throw new Error("Please add a habit id");
    }

    const completedDate = date || formatDate(new Date());

    const log = await Log.findOne({
      userId: req.user._id,
      habitId,
      completedDate,
    });

    if (!log) {
      return res.status(404).json({ message: "Log not found" });
    }

    await log.deleteOne();
    res.json({ message: "Log removed successfully" });
  } catch (error) {
    next(error);
  }
};

// @desc    Get today's completions
// @route   GET /api/logs/today
// @access  Private
const getTodayLogs = async (req, res, next) => {
  try {
    const today = formatDate(new Date());
    const logs = await Log.find({
      userId: req.user._id,
      completedDate: today,
    });
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

// @desc    Get completions in a date range
// @route   GET /api/logs/range
// @access  Private
const getRangeLogs = async (req, res, next) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      res.status(400);
      throw new Error("Please provide start and end dates");
    }

    const logs = await Log.find({
      userId: req.user._id,
      completedDate: { $gte: start, $lte: end },
    });

    res.json(logs);
  } catch (error) {
    next(error);
  }
};

// @desc    Get heatmap count (last 90 days)
// @route   GET /api/logs/heatmap
// @access  Private
const getHeatmapLogs = async (req, res, next) => {
  try {
    const days = [];
    const today = new Date();
    const startRangeDate = formatDate(subDays(today, 89));
    const endRangeDate = formatDate(today);

    // Get all completions for user in last 90 days
    const logs = await Log.find({
      userId: req.user._id,
      completedDate: { $gte: startRangeDate, $lte: endRangeDate },
    });

    // Create lookup map for count per date
    const countMap = {};
    for (const log of logs) {
      countMap[log.completedDate] = (countMap[log.completedDate] || 0) + 1;
    }

    // Build the 90 day heatmap array
    for (let i = 89; i >= 0; i--) {
      const d = subDays(today, i);
      const key = formatDate(d);
      days.push({
        date: key,
        count: countMap[key] || 0,
      });
    }

    res.json(days);
  } catch (error) {
    next(error);
  }
};

// @desc    Get 30d stats for all habits
// @route   GET /api/logs/stats
// @access  Private
const getStatsLogs = async (req, res, next) => {
  try {
    const habits = await Habit.find({ userId: req.user._id, isArchived: false });
    
    // Generate the last 30 days key array
    const days30 = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      days30.push(formatDate(subDays(today, i)));
    }
    
    const startDate = days30[0];
    const endDate = days30[29];

    // Fetch all logs in this range
    const logs = await Log.find({
      userId: req.user._id,
      completedDate: { $gte: startDate, $lte: endDate },
    });

    // Group logs by habitId
    const habitLogsMap = {};
    for (const h of habits) {
      habitLogsMap[h._id.toString()] = [];
    }
    for (const l of logs) {
      const hIdStr = l.habitId.toString();
      if (habitLogsMap[hIdStr]) {
        habitLogsMap[hIdStr].push(l.completedDate);
      }
    }

    const perHabit = habits.map((h) => {
      const hLogs = habitLogsMap[h._id.toString()] || [];
      // Sort ascending for streak calculation
      const sortedAsc = [...hLogs].sort();
      const { current, longest } = calculateStreaks(sortedAsc);

      return {
        habitId: h._id,
        name: h.name,
        icon: h.icon,
        color: h.color,
        category: h.category,
        completions30d: hLogs.length,
        currentStreak: current,
        longestStreak: longest,
      };
    });

    res.json({ perHabit, days: days30 });
  } catch (error) {
    next(error);
  }
};

// @desc    Get detailed stats for a specific habit
// @route   GET /api/logs/stats/:id
// @access  Private
const getHabitStatsLogs = async (req, res, next) => {
  try {
    const habit = await Habit.findById(req.params.id);
    if (!habit) {
      res.status(404);
      throw new Error("Habit not found");
    }

    if (habit.userId.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error("Not authorized");
    }

    // Fetch all logs of this habit
    const logs = await Log.find({ habitId: habit._id }).sort({ completedDate: 1 });
    const dates = logs.map((l) => l.completedDate);

    const { current, longest } = calculateStreaks(dates);

    // Calculate Completion Rate
    // If habit was created recently, use diff in days between creation and now, min 1
    const creationDate = habit.createdAt || new Date();
    const diffTime = Math.abs(new Date() - creationDate);
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const totalCompletions = logs.length;
    const completionRate = Math.min(100, Math.round((totalCompletions / diffDays) * 100));

    res.json({
      habit,
      totalCompletions,
      currentStreak: current,
      longestStreak: longest,
      completionRate,
      monthly: {}, // Optional placeholder
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createLog,
  deleteLog,
  getTodayLogs,
  getRangeLogs,
  getHeatmapLogs,
  getStatsLogs,
  getHabitStatsLogs,
};
