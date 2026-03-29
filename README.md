# File Merger Agent - Complete Setup Guide

## What This Agent Does
- Upload any number of Word, PDF, Excel, CSV, TXT, or PPTX files
- Choose output format: PDF, Word (DOCX), Excel (XLSX), or PowerPoint (PPTX)
- AI suggests a smart file name based on your uploaded file names
- One-click merge - pipeline runs silently on backend
- Download the merged file instantly
- Full history shown in left sidebar (stored in PostgreSQL)

---

## Project Structure

```
file-merger-agent/
├── backend/
│   ├── server.js          ← Express API server
│   ├── mergeService.js    ← File extraction + merging logic
│   ├── init_db.sql        ← PostgreSQL setup (run once)
│   ├── package.json
│   ├── uploads/           ← Temp upload folder (auto-created)
│   └── outputs/           ← Merged output files (auto-created)
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── App.js         ← Main React component
    │   ├── App.css        ← All styling
    │   └── index.js       ← React entry point
    └── package.json
```

---

## Prerequisites

Make sure these are installed:
- Node.js (v18 or later): https://nodejs.org
- PostgreSQL (v14 or later): https://www.postgresql.org/download/

---

## STEP 1 - Setup PostgreSQL Database

Open your terminal and run:

```bash
psql -U postgres -f backend/init_db.sql
```

If that does not work, open psql manually:

```bash
psql -U postgres
```

Then paste these commands:

```sql
CREATE DATABASE file_merger_db;
\c file_merger_db
CREATE TABLE IF NOT EXISTS merge_history (
    id              SERIAL PRIMARY KEY,
    session_name    VARCHAR(255)    NOT NULL,
    input_files     JSONB           NOT NULL,
    output_format   VARCHAR(20)     NOT NULL,
    output_filename VARCHAR(255)    NOT NULL,
    output_path     TEXT            NOT NULL,
    file_count      INTEGER         NOT NULL DEFAULT 1,
    created_at      TIMESTAMP       DEFAULT NOW()
);
```

---

## STEP 2 - Start the Backend

```bash
cd backend
npm install
npm run dev
```

Backend will run at: http://localhost:5000

You will see: "File Merger Agent backend running on http://localhost:5000"

---

## STEP 3 - Start the Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm start
```

Frontend will open at: http://localhost:3000

---

## STEP 4 - Use the Agent

1. Open http://localhost:3000 in your browser
2. Drag & drop or click to upload files (PDF, Word, Excel, CSV, TXT, PPTX)
3. Choose your output format (PDF / Word / Excel / PPT)
4. The agent will automatically suggest a smart file name
5. Click the big "Merge Files" button
6. Download your merged file instantly
7. All merges are saved in History (left sidebar)

---

## PostgreSQL Password

Your password is set as: passWhen

This is configured in backend/server.js:

```javascript
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "file_merger_db",
  password: "passWhen",   // <-- your password
  port: 5432,
});
```

If your password is different, update it in backend/server.js.

---

## Pipeline (Runs Silently on Backend - Never Shown on Frontend)

```
Step 1: Files uploaded via multipart form to backend
Step 2: Text/data extracted from each file internally (JSON format - backend only)
Step 3: All content merged into requested format (PDF/DOCX/XLSX/PPTX)
Step 4: Record saved to PostgreSQL with metadata
Step 5: Frontend receives download link only
```

---

## Supported Input Formats

| Format | Extension |
|--------|-----------|
| PDF    | .pdf      |
| Word   | .docx, .doc |
| Excel  | .xlsx, .xls |
| CSV    | .csv      |
| Text   | .txt      |
| PowerPoint | .pptx |

## Supported Output Formats

| Format | What it produces |
|--------|-----------------|
| PDF    | Styled PDF with cover page and table of contents |
| Word   | Formatted DOCX with headings per file |
| Excel  | Summary sheet + individual sheets per file |
| PPT    | Title slide + content slides per file |

---

## Troubleshooting

**Backend cannot connect to PostgreSQL:**
- Make sure PostgreSQL service is running
- Check password in backend/server.js matches your PostgreSQL password
- Make sure database file_merger_db exists

**Frontend shows CORS error:**
- Make sure backend is running on port 5000
- The frontend proxy in package.json handles this automatically

**File not merging:**
- Check terminal where backend is running for error messages
- Make sure uploads/ folder exists inside backend/
