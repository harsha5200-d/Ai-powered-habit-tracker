const { GoogleGenerativeAI } = require("@google/generative-ai");
const Habit = require("../models/Habit");
const Log = require("../models/Log");
const User = require("../models/User");

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

// Initialize Gemini client (safely)
const getGeminiModel = () => {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return null;
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  } catch (error) {
    console.error("Failed to initialize Gemini:", error);
    return null;
  }
};

// Mock Fallbacks
const mockAI = {
  weeklyReport: `Big week for consistency! You've been maintaining your routine well.

*💧 Water intake* is becoming automatic. You hit it almost every day.
*🏃 Morning runs* have slipped slightly mid-week. Consider laying out your gear the night before to reduce friction.
*📚 Reading* has been steady. Keep utilizing those quiet evening slots.

Weekend completion rates are about 25% lower than weekdays. To keep streaks alive, try a "micro-habit" version of your habits on Saturday and Sunday (e.g., a 2-minute stretch instead of a full run). Keep it up! *(Note: Set GEMINI_API_KEY in backend/.env for real personalized AI insights)*`,

  recovery: `You've had some great streaks in the past. Remember, a broken streak is just a bump, not the end of the road. Let's rebuild that momentum:

**Day 1: Micro-dose.** Just do 5 minutes of this habit. The goal is to start, not to finish a big session.
**Day 2: Mid-level.** Do half of your regular target. Keep the friction low.
**Day 3: Regular.** Back to full strength. By now, the activation energy is gone.

Lay out your materials the night before to make it as easy as possible to start. You've got this! *(Note: Set GEMINI_API_KEY in backend/.env for real personalized AI insights)*`,

  morning: `Good morning! You're making progress on your habits. Keep that hydration streak alive today! One small step: take 5 minutes for your mindfulness habit today to maintain momentum. Have a great day! *(Note: Set GEMINI_API_KEY in backend/.env for real personalized AI insights)*`,

  suggestions: [
    {
      name: "5-minute morning stretch",
      description: "Loosen up before the day starts.",
      frequency: "daily",
      category: "Health",
      icon: "🧘",
      reason: "Pairs naturally with your morning routine and requires very little willpower to start."
    },
    {
      name: "No screens first 30 mins",
      description: "Keep the morning offline.",
      frequency: "daily",
      category: "Mindfulness",
      icon: "😴",
      reason: "Helps you start the day with focus rather than instantly consuming notifications."
    },
    {
      name: "Weekly review",
      description: "Reflect on wins and challenges on Sunday.",
      frequency: "weekly",
      category: "Productivity",
      icon: "📝",
      reason: "A weekly reflection point helps you stay aligned with your long-term goals."
    }
  ]
};

// @desc    Generate weekly report
// @route   POST /api/ai/weekly-report
// @access  Private
const generateWeeklyReport = async (req, res, next) => {
  try {
    const model = getGeminiModel();
    
    // Fetch habits
    const habits = await Habit.find({ userId: req.user._id, isArchived: false });
    
    // Get logs for the last 14 days
    const today = new Date();
    const startDate = formatDate(subDays(today, 13)); // 14 days total including today
    const endDate = formatDate(today);
    
    const logs = await Log.find({
      userId: req.user._id,
      completedDate: { $gte: startDate, $lte: endDate }
    });

    if (!model) {
      return res.json({ content: mockAI.weeklyReport });
    }

    // Format logs and habits data to send to Gemini
    const habitData = habits.map(h => {
      const hLogs = logs.filter(l => l.habitId.toString() === h._id.toString());
      const dates = hLogs.map(l => l.completedDate);
      
      // Split into this week (last 7 days) and last week (prior 7 days)
      const thisWeekThreshold = formatDate(subDays(new Date(), 6));
      const thisWeekCount = dates.filter(d => d >= thisWeekThreshold).length;
      const lastWeekCount = dates.filter(d => d < thisWeekThreshold).length;
      
      return `- ${h.icon} ${h.name} (${h.category}): Completed ${thisWeekCount}/7 days this week, ${lastWeekCount}/7 days last week.`;
    }).join("\n");

    const prompt = `You are a friendly, expert, and encouraging habit coach. Write a personalized, structured performance report for a user named ${req.user.name} based on their habit tracking data for the last 14 days.
    
Here is their tracking data:
${habitData || "No active habits tracked yet."}

Analyze their consistency. Highlight their strongest anchor habits. Identify if they struggle during specific periods (like weekend drop-offs or mid-week slips). Offer 2-3 specific, encouraging, actionable tips to keep their momentum. Write directly to the user in a warm, motivating tone. Use Markdown with lists and bold headers. Keep the report to about 150-200 words.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ content: response.text() });
  } catch (error) {
    console.error("Gemini Weekly Report Error:", error);
    res.json({ content: mockAI.weeklyReport });
  }
};

// @desc    Suggest habits based on goals
// @route   POST /api/ai/suggest-habits
// @access  Private
const suggestHabits = async (req, res, next) => {
  try {
    const { goals, productiveTime, struggles } = req.body;
    const model = getGeminiModel();

    if (!model) {
      return res.json({ suggestions: mockAI.suggestions });
    }

    const currentHabits = await Habit.find({ userId: req.user._id, isArchived: false });
    const habitsList = currentHabits.map(h => `- ${h.name} (${h.category})`).join("\n");

    const prompt = `You are an expert personal growth coach. A user named ${req.user.name} wants suggestions for habits.
    
User Profile:
- Goals: ${goals || "Improve health and focus"}
- Most productive times: ${productiveTime || "Mornings"}
- Main struggles: ${struggles || "Staying consistent and avoiding distractions"}
- Already tracking:
${habitsList || "None"}

Suggest exactly 3 complementary habits that fit their goals, peak hours, and address their struggles.
Return your output ONLY as a raw JSON array of objects. Do not wrap the JSON in markdown blocks (e.g. \`\`\`json). Output nothing but the JSON array.
Each object in the array MUST have exactly these keys:
- "name": string (name of the suggested habit, short and action-oriented)
- "description": string (one-sentence description of the habit)
- "frequency": string ("daily" or "weekly")
- "category": string (must be exactly one of: "Health", "Fitness", "Learning", "Mindfulness", "Productivity", "Other")
- "icon": string (a single emoji representing the habit)
- "reason": string (a short sentence explaining why this habit helps them specifically based on their goals/struggles)

Example format:
[{"name": "Hydrate First Thing", "description": "Drink a glass of water right after waking up.", "frequency": "daily", "category": "Health", "icon": "💧", "reason": "Kickstarts your morning focus and is an easy win for your goal."}]`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Sanitize markdown code blocks if the model ignored instructions
    if (text.startsWith("```")) {
      text = text.replace(/^```(json)?/, "").replace(/```$/, "").trim();
    }

    try {
      const suggestions = JSON.parse(text);
      res.json({ suggestions });
    } catch (parseError) {
      console.error("Failed to parse Gemini JSON output. Raw text:", text);
      res.json({ suggestions: mockAI.suggestions });
    }
  } catch (error) {
    console.error("Gemini Suggest Habits Error:", error);
    res.json({ suggestions: mockAI.suggestions });
  }
};

// @desc    Formulate a streak recovery plan
// @route   POST /api/ai/recovery-plan
// @access  Private
const generateRecoveryPlan = async (req, res, next) => {
  try {
    const { habitId } = req.body;
    
    if (!habitId) {
      res.status(400);
      throw new Error("Please add a habit id");
    }

    const habit = await Habit.findById(habitId);
    if (!habit) {
      res.status(404);
      throw new Error("Habit not found");
    }

    const model = getGeminiModel();
    if (!model) {
      return res.json({ content: mockAI.recovery });
    }

    // Fetch historical stats for logs
    const logs = await Log.find({ habitId });
    const totalCompletions = logs.length;

    const prompt = `You are a supportive, understanding personal growth mentor. A user broke their streak for the habit: "${habit.name}" (${habit.description || "No description"}).
    
Historical performance:
- Total completed days: ${totalCompletions}

Write a gentle, highly structured 3-day recovery plan to help them rebuild their streak. Focus on lowering the barrier to entry (e.g. Day 1 should be ridiculously easy, Day 2 moderate, Day 3 regular effort).
Format each day with bold titles (e.g. **Day 1: Title**) and short, encouraging advice.
Keep your response warm, actionable, under 120 words, and formatted in clean Markdown.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ content: response.text() });
  } catch (error) {
    console.error("Gemini Recovery Plan Error:", error);
    res.json({ content: mockAI.recovery });
  }
};

// @desc    Interactive chat with habit coach
// @route   POST /api/ai/chat
// @access  Private
const chatWithCoach = async (req, res, next) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      res.status(400);
      throw new Error("Please include a question");
    }

    const model = getGeminiModel();
    if (!model) {
      // Simple mock responses matching typical questions
      let reply = "I'm ready to help you analyze your habits. (Connect your Gemini API Key in the backend .env to get live insights from your data!)";
      const qLower = question.toLowerCase();
      if (qLower.includes("consistent") || qLower.includes("day of the week")) {
        reply = "Looking at the past 30 days of mock data, **Monday** is your strongest day (averaging 5 completions), while **Sunday** is your weakest (averaging 2 completions). The dip usually begins Friday afternoon.";
      } else if (qLower.includes("best performing") || qLower.includes("category")) {
        reply = "Your best performing category is **Health**, driven strongly by your hydration habits. Your lowest is **Mindfulness**, where consistency on journaling has dropped slightly.";
      } else if (qLower.includes("fail") || qLower.includes("exercise") || qLower.includes("run")) {
        reply = "Your exercise habit shows high consistency (80%) on weekdays, but drops to 30% on weekends. Adding a low-barrier alternative on Saturday, like a 10-minute jog, would help maintain your momentum.";
      }
      return res.json({ content: reply });
    }

    // Load user context: habits & 30d logs
    const habits = await Habit.find({ userId: req.user._id, isArchived: false });
    const today = new Date();
    const startDate = formatDate(subDays(today, 29));
    const logs = await Log.find({
      userId: req.user._id,
      completedDate: { $gte: startDate }
    });

    const habitsContext = habits.map(h => {
      const hLogs = logs.filter(l => l.habitId.toString() === h._id.toString());
      const dates = hLogs.map(l => l.completedDate).sort();
      return `- Habit "${h.name}" (${h.category}): Completed on [${dates.join(", ")}]`;
    }).join("\n");

    const prompt = `You are a supportive, insightful AI habit coach. You are talking to a user named ${req.user.name}.
    
Here is the user's active habit and completion log data over the last 30 days:
${habitsContext || "No habits currently tracked."}

User's Question: "${question}"

Provide a concise, analytical, yet friendly response addressing their question directly using the data provided. Look for patterns (e.g. week vs weekend differences, consistency, category strengths).
Keep your answer clear, motivating, under 100 words, and formatted in clean Markdown.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ content: response.text() });
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    res.json({ content: "Sorry, I encountered an issue while generating a response. Please check your AI settings." });
  }
};

// @desc    Daily morning motivation nudges
// @route   GET /api/ai/morning
// @access  Private
const getMorningMotivation = async (req, res, next) => {
  try {
    const model = getGeminiModel();
    if (!model) {
      return res.json({ content: mockAI.morning });
    }

    const habits = await Habit.find({ userId: req.user._id, isArchived: false });
    const today = formatDate(new Date());
    
    // Check logs for today and streaks
    const logsToday = await Log.find({ userId: req.user._id, completedDate: today });
    const completedTodayIds = new Set(logsToday.map(l => l.habitId.toString()));
    
    // Fetch all logs to check streaks
    const allLogs = await Log.find({ userId: req.user._id });
    
    const habitStreakList = habits.map(h => {
      const hLogs = allLogs.filter(l => l.habitId.toString() === h._id.toString());
      const dates = hLogs.map(l => l.completedDate).sort();
      
      // Calculate current streak
      const set = new Set(dates);
      let current = 0;
      const yesterdayStr = formatDate(subDays(new Date(), 1));
      
      if (set.has(today) || set.has(yesterdayStr)) {
        let cursor = set.has(today) ? new Date() : subDays(new Date(), 1);
        while (set.has(formatDate(cursor))) {
          current++;
          cursor = subDays(cursor, 1);
        }
      }
      
      const isCompletedToday = completedTodayIds.has(h._id.toString());
      return `- Habit "${h.name}": Current streak = ${current} days. Completed today? ${isCompletedToday ? "Yes" : "No"}`;
    }).join("\n");

    const prompt = `You are a positive, encouraging morning assistant. Write a short, uplifting morning motivation nudge for a user named ${req.user.name.split(" ")[0]}.
    
Here is their habit streak status for today:
${habitStreakList || "No habits tracked yet."}

Identify their longest active streak and praise it briefly. Pick one habit that has NOT been completed today, and gently nudge them to take a few minutes for it. Keep the greeting incredibly concise, encouraging, and under 50 words. Write in Markdown. Do not repeat "Good morning, name" in a formal way. Keep it natural.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ content: response.text() });
  } catch (error) {
    console.error("Gemini Morning Motivation Error:", error);
    res.json({ content: mockAI.morning });
  }
};

module.exports = {
  generateWeeklyReport,
  suggestHabits,
  generateRecoveryPlan,
  chatWithCoach,
  getMorningMotivation
};
