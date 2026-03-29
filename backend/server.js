const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const { mergeFiles, suggestFileName } = require("./mergeService");

const app = express();
app.use(cors());
app.use(express.json());

// ─── DIRECTORIES ─────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "uploads");
const OUTPUT_DIR = path.join(__dirname, "outputs");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── POSTGRESQL ───────────────────────────────────────────────────────────────
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "file_merger_db",
  password: "M@H@M00000",
  port: 5432,
});

async function initDB() {
  try {
    // Create database if not exists (run this manually once if needed)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merge_history (
        id SERIAL PRIMARY KEY,
        session_name VARCHAR(255) NOT NULL,
        input_files JSONB NOT NULL,
        output_format VARCHAR(20) NOT NULL,
        output_filename VARCHAR(255) NOT NULL,
        output_path TEXT NOT NULL,
        file_count INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("PostgreSQL connected and table ready");
  } catch (err) {
    console.error("DB init error:", err.message);
    console.log("Make sure PostgreSQL is running and database 'file_merger_db' exists");
    console.log("Run: CREATE DATABASE file_merger_db;");
  }
}
initDB();

// ─── MULTER UPLOAD CONFIG ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const unique = Date.now() + "_" + Math.round(Math.random() * 1e5);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".txt", ".pptx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported: ${ext}`));
    }
  },
});

// ─── HELPER: CLEAN TEMP FILES ─────────────────────────────────────────────────
function cleanFiles(files) {
  if (!files) return;
  files.forEach((f) => {
    try {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    } catch {}
  });
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "File Merger Agent running" });
});

// POST suggest name - uploads files temporarily to read names, then suggests
app.post("/api/suggest-name", upload.array("files", 20), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }
    const outputFormat = req.body.outputFormat || "pdf";
    const names = files.map((f) => path.parse(f.originalname).name);
    const suggestedName = suggestFileName(names, outputFormat);

    // Clean temp uploads
    cleanFiles(files);

    res.json({ suggestedName, fileCount: files.length });
  } catch (err) {
    cleanFiles(req.files);
    res.status(500).json({ error: err.message });
  }
});

// POST merge - main merge endpoint
app.post("/api/merge", upload.array("files", 20), async (req, res) => {
  const uploadedFiles = req.files || [];
  try {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: "No files provided for merging" });
    }

    const outputFormat = (req.body.outputFormat || "pdf").toLowerCase();
    const rawName = req.body.outputName || "merged_output";

    // Sanitize output name (remove special chars)
    const outputName = rawName.replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "_").substring(0, 100) || "merged_output";

    // Build input file metadata for database (no content exposed to frontend)
    const inputFileMeta = uploadedFiles.map((f) => ({
      originalName: f.originalname,
      size: f.size,
      mimetype: f.mimetype,
      extension: path.extname(f.originalname).toLowerCase(),
    }));

    // ── PIPELINE RUNS SILENTLY ON BACKEND ──
    // Step 1: Files already uploaded via multer
    // Step 2: Extract text (internal - not sent to frontend)
    // Step 3: Merge into requested format
    const outputPath = await mergeFiles(uploadedFiles, outputFormat, outputName);

    // Step 4: Save to PostgreSQL database
    const dbResult = await pool.query(
      `INSERT INTO merge_history 
        (session_name, input_files, output_format, output_filename, output_path, file_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        outputName,
        JSON.stringify(inputFileMeta),
        outputFormat,
        `${outputName}.${outputFormat}`,
        outputPath,
        uploadedFiles.length,
      ]
    );

    // Clean uploaded temp files
    cleanFiles(uploadedFiles);

    const historyId = dbResult.rows[0].id;

    res.json({
      success: true,
      historyId,
      downloadUrl: `/api/download/${historyId}`,
      filename: `${outputName}.${outputFormat}`,
      fileCount: uploadedFiles.length,
      format: outputFormat.toUpperCase(),
    });
  } catch (err) {
    cleanFiles(uploadedFiles);
    console.error("Merge error:", err);
    res.status(500).json({ error: err.message || "Merge failed" });
  }
});

// GET download merged file by history ID
app.get("/api/download/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM merge_history WHERE id = $1",
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Record not found" });
    }
    const record = result.rows[0];
    if (!fs.existsSync(record.output_path)) {
      return res.status(404).json({ error: "File no longer exists on disk" });
    }
    res.download(record.output_path, record.output_filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET history list (no file content - just metadata)
app.get("/api/history", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, session_name, output_format, output_filename, file_count, created_at
       FROM merge_history
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE history item and its output file
app.delete("/api/history/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT output_path FROM merge_history WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length) {
      try {
        if (fs.existsSync(result.rows[0].output_path)) {
          fs.unlinkSync(result.rows[0].output_path);
        }
      } catch {}
      await pool.query("DELETE FROM merge_history WHERE id = $1", [req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ERROR HANDLER ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message });
});

// ─── START SERVER ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`File Merger Agent backend running on http://localhost:${PORT}`);
});
