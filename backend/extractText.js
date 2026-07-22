const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * Extracts plain text from an uploaded resume file buffer based on its mimetype.
 * Supports PDF, DOCX and plain text files.
 */
async function extractResumeText(buffer, mimetype, originalName = "") {
  const lowerName = originalName.toLowerCase();

  if (mimetype === "application/pdf" || lowerName.endsWith(".pdf")) {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimetype === "text/plain" || lowerName.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  // Legacy .doc files aren't reliably parseable without extra native
  // dependencies, so we surface a clear error instead of silently failing.
  if (mimetype === "application/msword" || lowerName.endsWith(".doc")) {
    throw new Error(
      "Legacy .doc files aren't supported. Please upload a PDF, DOCX, or TXT resume."
    );
  }

  throw new Error(
    "Unsupported file type. Please upload a PDF, DOCX, or TXT resume."
  );
}

module.exports = { extractResumeText };
