# Eligo

Upload a résumé and a job description. Eligo extracts the résumé text, sends
it to Google Gemini alongside the job description, and returns an ATS score,
an eligibility verdict, matched/missing keywords, and concrete suggestions
for improving the match.

## Structure

```
eligo/
├── backend/          Express API + Gemini integration
│   ├── index.js       server entry point, routes
│   ├── extractText.js resume text extraction (PDF/DOCX/TXT)
│   ├── geminiClient.js prompt building + Gemini API call
│   ├── package.json
│   └── .env.example
└── frontend/         Static site served by the backend
    ├── index.html
    ├── style.css
    └── script.js
```

The backend serves the frontend as static files, so in this local setup you
only run one process — there's no separate frontend dev server or build step.

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` and add your Gemini API key (get one free at
https://aistudio.google.com/app/apikey):

```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

## Run

```bash
cd backend
npm start
```

Then open http://localhost:3000 — the frontend is served automatically from
the sibling `frontend/` folder.

For auto-restart on file changes during development:

```bash
npm run dev
```

## How it works

1. `frontend/` — the upload form (drag-and-drop resume + job description
   textarea) and the results view (score gauge, section breakdown, matched
   vs. missing keywords, strengths, suggestions).
2. `POST /api/analyze` (in `backend/index.js`) accepts a `multipart/form-data`
   request with a `resume` file and a `jobDescription` string.
3. `backend/extractText.js` pulls plain text out of PDF, DOCX, or TXT resumes.
4. `backend/geminiClient.js` builds a structured prompt, calls
   `generateContent` on the Gemini API with `responseMimeType: "application/json"`,
   and parses/validates the result before sending it back to the browser.

## Supported resume formats

PDF, DOCX, and TXT. Legacy `.doc` files are rejected with a clear error
message asking for a re-export, since they can't be parsed reliably without
extra native dependencies.

## Notes / next steps

- File size is capped at 8MB (`backend/index.js`, the `multer` limits option).
- The Gemini model is configurable via `GEMINI_MODEL` in `.env` — swap in a
  newer model id any time without touching code.
- There's no persistence layer here (nothing is saved to disk or a database);
  every analysis is stateless. Add a database if you want history/accounts.
- The Gemini API key stays server-side only — it's never sent to the browser.
- If you later split these into two separate deployments (e.g. frontend on a
  CDN, backend on its own host), add `cors` origin restrictions in
  `backend/index.js` (currently wide open with `app.use(cors())`) and point
  the frontend's `fetch("/api/analyze")` call in `script.js` at the backend's
  full URL instead of a relative path.
