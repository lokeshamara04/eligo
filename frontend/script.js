const form = document.getElementById("analyze-form");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("resume-input");
const dzIdle = dropzone.querySelector(".dropzone__idle");
const dzFile = dropzone.querySelector(".dropzone__file");
const dzFilename = dropzone.querySelector(".dropzone__filename");
const clearFileBtn = document.getElementById("clear-file");
const jdInput = document.getElementById("jd-input");
const submitBtn = document.getElementById("submit-btn");
const formError = document.getElementById("form-error");

const formPanel = document.getElementById("form-panel");
const loadingPanel = document.getElementById("loading-panel");
const loadingText = document.getElementById("loading-text");
const resultsSection = document.getElementById("results");
const resetBtn = document.getElementById("reset-btn");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 86;

// ---------- File picking ----------

dropzone.addEventListener("click", () => fileInput.click());
dropzone.setAttribute("tabindex", "0");
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  })
);

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) {
    handleFileSelection(file);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) {
    handleFileSelection(fileInput.files[0]);
  }
});

clearFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.value = "";
  formError.textContent = "";
  resetDropzone();
});

function resetDropzone() {
  dzIdle.hidden = false;
  dzFile.hidden = true;
  dzFilename.textContent = "";
}

function handleFileSelection(file) {
  const validationError = validateFile(file);
  if (validationError) {
    formError.textContent = validationError;
    fileInput.value = "";
    resetDropzone();
    return;
  }

  formError.textContent = "";
  dzFilename.textContent = file.name;
  dzIdle.hidden = true;
  dzFile.hidden = false;
}

function validateFile(file) {
  const extension = (file.name || "").toLowerCase();
  const isAllowedExtension = /\.pdf$/i.test(extension) || /\.docx$/i.test(extension) || /\.txt$/i.test(extension);

  if (!isAllowedExtension) {
    return "Please upload a PDF, DOCX, or TXT resume.";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "That file is too large. Please choose a file under 8MB.";
  }

  if (!ALLOWED_MIME_TYPES.has(file.type) && !/\.(pdf|docx|txt)$/i.test(extension)) {
    return "Please upload a PDF, DOCX, or TXT resume.";
  }

  return "";
}

// ---------- Submit ----------

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const file = fileInput.files[0];
  const jobDescription = jdInput.value.trim();

  if (!file) {
    formError.textContent = "Add a resume file first.";
    return;
  }
  if (!jobDescription) {
    formError.textContent = "Paste the job description first.";
    return;
  }

  const validationError = validateFile(file);
  if (validationError) {
    formError.textContent = validationError;
    fileInput.value = "";
    resetDropzone();
    return;
  }

  const fd = new FormData();
  fd.append("resume", file);
  fd.append("jobDescription", jobDescription);

  setLoading(true);

  try {
    const res = await fetch("/api/analyze", { method: "POST", body: fd });
    const text = await res.text();
    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("The server returned an invalid response. Please try again.");
    }

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    renderResults(data);
    formPanel.hidden = true;
    loadingPanel.hidden = true;
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    loadingPanel.hidden = true;
    formPanel.hidden = false;
    formError.textContent = err.message || "Something went wrong. Try again.";
  } finally {
    setLoading(false, true);
  }
});

function setLoading(isLoading, resetOnly = false) {
  submitBtn.disabled = isLoading;
  
  // Always clear any existing interval
  if (loadingPanel._interval) {
    clearInterval(loadingPanel._interval);
    loadingPanel._interval = null;
  }

  if (resetOnly) return;

  formPanel.hidden = isLoading;
  loadingPanel.hidden = !isLoading;
  resultsSection.hidden = true;
  
  // Only set up a new interval if loading
  if (isLoading) {
    const messages = [
      "Reading your resume…",
      "Parsing the job description…",
      "Cross-referencing skills…",
      "Weighing your odds…",
    ];
    let i = 0;
    loadingText.textContent = messages[0];
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      loadingText.textContent = messages[i];
    }, 1400);
    loadingPanel._interval = interval;
  }
}

resetBtn.addEventListener("click", () => {
  resultsSection.hidden = true;
  formPanel.hidden = false;
  loadingPanel.hidden = true;
  formError.textContent = "";
  form.reset();
  fileInput.value = "";
  dzIdle.hidden = false;
  dzFile.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ---------- Rendering ----------

function renderResults(data) {
  renderGauge(data.ats_score, data.eligible);

  document.getElementById("score-number").textContent = data.ats_score;
  document.getElementById("verdict-status").textContent = data.eligible
    ? "You clear the bar"
    : "Not quite eligible yet";
  document.getElementById("verdict-summary").textContent =
    data.eligibility_summary || "";

  renderScorebars(data.section_scores);
  renderChips("matched-chips", data.matched_keywords, "No standout matches found.");
  renderChips("missing-chips", data.missing_keywords, "Nothing major missing — nice.");
  renderList("strengths-list", data.strengths, "No specific strengths surfaced.");
  renderSuggestions(data.suggestions);
}

function renderGauge(score, eligible) {
  const fill = document.getElementById("gauge-fill");
  const offset = GAUGE_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, score)) / 100);
  fill.style.stroke = eligible ? "var(--brass-bright)" : "#d98a72";
  // trigger transition
  fill.style.strokeDashoffset = GAUGE_CIRCUMFERENCE;
  requestAnimationFrame(() => {
    fill.style.strokeDashoffset = offset;
  });
}

const SECTION_LABELS = {
  keyword_match: "Keyword match",
  formatting: "Formatting / parseability",
  experience_relevance: "Experience relevance",
  skills_alignment: "Skills alignment",
};

function renderScorebars(sections) {
  const el = document.getElementById("scorebars");
  el.innerHTML = "";
  Object.entries(sections || {}).forEach(([key, value]) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="scorebar__label"><span>${SECTION_LABELS[key] || key}</span><span>${value}</span></div>
      <div class="scorebar__track"><div class="scorebar__fill" style="width:0%"></div></div>
    `;
    el.appendChild(wrap);
    const fillEl = wrap.querySelector(".scorebar__fill");
    requestAnimationFrame(() => (fillEl.style.width = `${value}%`));
  });
}

function renderChips(containerId, items, emptyText) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  if (!items || items.length === 0) {
    el.innerHTML = `<span class="chips__empty">${emptyText}</span>`;
    return;
  }
  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    el.appendChild(chip);
  });
}

function renderList(containerId, items, emptyText) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  if (!items || items.length === 0) {
    el.innerHTML = `<li style="color:rgba(18,23,43,0.45)">${emptyText}</li>`;
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  });
}

function renderSuggestions(suggestions) {
  const el = document.getElementById("suggestions-list");
  el.innerHTML = "";
  if (!suggestions || suggestions.length === 0) {
    el.innerHTML = `<li style="color:rgba(18,23,43,0.45)">No suggestions — looking strong.</li>`;
    return;
  }
  suggestions.forEach((s) => {
    const li = document.createElement("li");
    li.className = "suggestion";
    li.innerHTML = `
      <span class="suggestion__area">${s.area}</span>
      <p class="suggestion__text">${s.recommendation}</p>
    `;
    el.appendChild(li);
  });
}
