require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const { extractResumeText } = require("./extractText");
const { scoreResume } = require("./geminiClient");

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.post("/api/analyze", upload.single("resume"), async (req, res) => {
  try {
    const { jobDescription } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Please upload a resume file." });
    }
    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ error: "Please paste a job description." });
    }

    const resumeText = await extractResumeText(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    if (!resumeText || resumeText.trim().length < 30) {
      return res.status(422).json({
        error:
          "Couldn't extract enough text from that file. Try a different PDF/DOCX export.",
      });
    }

    const result = await scoreResume(resumeText, jobDescription.trim());
    return res.json(result);
  } catch (err) {
    console.error("Analyze error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`Eligo is running at http://localhost:${PORT}`);
});
