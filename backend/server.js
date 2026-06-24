require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

// Connect to Database
connectDB();

const app = express();

// Middleware
app.use(cors({
  origin: "http://localhost:5173", // default Vite dev port
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Define Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/habits", require("./routes/habits"));
app.use("/api/logs", require("./routes/logs"));
app.use("/api/ai", require("./routes/ai"));

// Base check route
app.get("/api", (req, res) => {
  res.json({ message: "AI-Powered Habit Tracker API is running..." });
});

// Centralized Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
