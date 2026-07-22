const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "with",
  "you",
  "your",
]);

/**
 * Builds the instruction prompt sent to Gemini. We ask for strict JSON so the
 * server can parse it reliably and hand structured data to the frontend.
 */
function buildPrompt(resumeText, jobDescription) {
  return `You are an expert Applicant Tracking System (ATS) and technical recruiter.
Compare the RESUME against the JOB DESCRIPTION below and evaluate how well the
candidate matches the role, the way a real ATS + recruiter combo would.

Return ONLY valid JSON (no markdown fences, no commentary before or after) matching
exactly this schema:

{
  "ats_score": <integer 0-100, overall match/parseability score>,
  "eligible": <boolean, true if the candidate meets the core/must-have requirements>,
  "eligibility_summary": "<one or two sentence verdict explaining the eligible decision>",
  "matched_keywords": ["<skills/keywords from the JD that ARE present in the resume>"],
  "missing_keywords": ["<important skills/keywords from the JD that are MISSING>"],
  "strengths": ["<2-5 short bullet points on what makes this resume strong for this role>"],
  "suggestions": [
    {
      "area": "<short label, e.g. 'Keywords', 'Formatting', 'Experience', 'Quantifying impact'>",
      "recommendation": "<concrete, actionable suggestion to improve the score/eligibility>"
    }
  ],
  "section_scores": {
    "keyword_match": <integer 0-100>,
    "formatting": <integer 0-100>,
    "experience_relevance": <integer 0-100>,
    "skills_alignment": <integer 0-100>
  }
}

Scoring guidance:
- ats_score should weigh keyword/skill overlap, relevant experience, and how
  cleanly the resume would parse in a real ATS (avoid penalizing for things
  outside the candidate's control, like missing contact info if it's clearly present).
- eligible should reflect whether the candidate meets the JD's core/must-have
  requirements, not just a keyword count threshold.
- Provide 3-6 suggestions, each genuinely actionable and specific to this resume/JD pair.
- Keep every string concise (no walls of text).
- Output must be strictly parseable JSON. Do not wrap it in markdown code fences.

JOB DESCRIPTION:
"""
${jobDescription}
"""

RESUME:
"""
${resumeText}
"""`;
}

/**
 * Strips accidental markdown code fences some models add around JSON output.
 */
function stripCodeFences(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTerms(text) {
  return normalizeText(text)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function scoreResumeWithFallback(resumeText, jobDescription) {
  const resumeTerms = extractTerms(resumeText);
  const jobTerms = extractTerms(jobDescription);
  const uniqueResumeTerms = [...new Set(resumeTerms)];
  const uniqueJobTerms = [...new Set(jobTerms)];

  const matched = uniqueJobTerms.filter((term) => uniqueResumeTerms.includes(term)).slice(0, 8);
  const missing = uniqueJobTerms.filter((term) => !matched.includes(term)).slice(0, 6);
  const coverage = uniqueJobTerms.length ? matched.length / uniqueJobTerms.length : 0;
  const atsScore = Math.max(0, Math.min(100, Math.round(45 + coverage * 45 + (resumeText.length > 150 ? 5 : 0))));
  const eligible = atsScore >= 70 && matched.length >= 2;

  const strengths = [];
  if (matched.length > 0) {
    strengths.push(`The resume includes relevant terms such as ${matched.slice(0, 3).join(", ")}.`);
  }
  if (resumeText.length > 120) {
    strengths.push("The resume content is detailed enough for a meaningful ATS-style review.");
  }
  if (strengths.length === 0) {
    strengths.push("The resume appears readable and structured for ATS review.");
  }

  const suggestions = missing.length
    ? missing.slice(0, 3).map((term) => ({
        area: "Keywords",
        recommendation: `Add the term "${term}" more explicitly to your resume to improve alignment.`,
      }))
    : [
        {
          area: "Keywords",
          recommendation: "Add a few role-specific keywords and measurable outcomes to strengthen the match.",
        },
      ];

  return normalizeResult({
    ats_score: atsScore,
    eligible,
    eligibility_summary: eligible
      ? "This resume shows solid overlap with the job description and looks like a viable match."
      : "The resume needs closer alignment with the core skills and requirements in the job description.",
    matched_keywords: matched,
    missing_keywords: missing,
    strengths,
    suggestions,
    section_scores: {
      keyword_match: Math.round(coverage * 100),
      formatting: resumeText.length > 80 ? 82 : 70,
      experience_relevance: Math.round(Math.min(100, 55 + coverage * 35)),
      skills_alignment: Math.round(Math.min(100, 50 + coverage * 40)),
    },
  });
}

async function scoreResume(resumeText, jobDescription) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Using local fallback analysis.");
    return scoreResumeWithFallback(resumeText, jobDescription);
  }

  const prompt = buildPrompt(resumeText, jobDescription);

  try {
    const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Gemini API request failed (${response.status}): ${errText || response.statusText}`);
    }

    const data = await response.json();

    const candidateText = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();

    if (!candidateText) {
      const blockReason = data?.promptFeedback?.blockReason;
      throw new Error(
        blockReason
          ? `Gemini declined to respond (reason: ${blockReason}).`
          : "Gemini returned an empty response."
      );
    }

    const cleaned = stripCodeFences(candidateText);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error("Couldn't parse Gemini's response as JSON. Try again in a moment.");
    }

    return normalizeResult(parsed);
  } catch (err) {
    console.warn("Gemini request failed. Falling back to local analysis.", err.message);
    return scoreResumeWithFallback(resumeText, jobDescription);
  }
}

/**
 * Fills in safe defaults for any fields the model might omit, so the
 * frontend never has to guard against undefined values.
 */
function normalizeResult(raw) {
  const clamp = (n) =>
    Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

  return {
    ats_score: clamp(raw.ats_score),
    eligible: Boolean(raw.eligible),
    eligibility_summary: raw.eligibility_summary || "",
    matched_keywords: Array.isArray(raw.matched_keywords)
      ? raw.matched_keywords
      : [],
    missing_keywords: Array.isArray(raw.missing_keywords)
      ? raw.missing_keywords
      : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.map((s) => ({
          area: s.area || "General",
          recommendation: s.recommendation || "",
        }))
      : [],
    section_scores: {
      keyword_match: clamp(raw.section_scores?.keyword_match),
      formatting: clamp(raw.section_scores?.formatting),
      experience_relevance: clamp(raw.section_scores?.experience_relevance),
      skills_alignment: clamp(raw.section_scores?.skills_alignment),
    },
  };
}

module.exports = { scoreResume, scoreResumeWithFallback, normalizeResult };
