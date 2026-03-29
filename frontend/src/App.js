import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import "./App.css";

// Backend API base URL
const API = "http://localhost:5000/api";

// Output format options
const FORMATS = [
  { value: "pdf",  label: "PDF",   icon: "📄", desc: "Best for sharing" },
  { value: "docx", label: "Word",  icon: "📝", desc: "Editable document" },
  { value: "xlsx", label: "Excel", icon: "📊", desc: "Spreadsheet view" },
  { value: "pptx", label: "PPT",   icon: "📑", desc: "Presentation slides" },
];

// File extension to icon mapping
function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const icons = {
    pdf: "📄", docx: "📝", doc: "📝",
    xlsx: "📊", xls: "📊", csv: "📊",
    pptx: "📑", txt: "📃",
  };
  return icons[ext] || "📎";
}

// Format file size
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Time ago helper
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Badge CSS class for format
function badgeClass(fmt) {
  return `history-format-badge badge-${fmt}`;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [files, setFiles] = useState([]);
  const [outputFormat, setOutputFormat] = useState("pdf");
  const [outputName, setOutputName] = useState("");
  const [namePlaceholder, setNamePlaceholder] = useState("Upload files to get a smart name suggestion...");
  const [status, setStatus] = useState(null); // null | { type, title, desc }
  const [downloadInfo, setDownloadInfo] = useState(null); // { url, filename }
  const [history, setHistory] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [loadingName, setLoadingName] = useState(false);
  const [merging, setMerging] = useState(false);

  const fileInputRef = useRef();
  const nameDebounce = useRef(null);

  // Fetch history on load
  useEffect(() => {
    fetchHistory();
  }, []);

  // When files or format change, auto-suggest a name
  useEffect(() => {
    if (files.length === 0) {
      setNamePlaceholder("Upload files to get a smart name suggestion...");
      return;
    }
    clearTimeout(nameDebounce.current);
    nameDebounce.current = setTimeout(() => {
      suggestName();
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, outputFormat]);

  // ── API CALLS ──────────────────────────────────────────────────────────────

  async function fetchHistory() {
    try {
      const res = await axios.get(`${API}/history`);
      setHistory(res.data);
    } catch (err) {
      console.error("History fetch error:", err.message);
    }
  }

  async function suggestName() {
    if (files.length === 0) return;
    setLoadingName(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      formData.append("outputFormat", outputFormat);
      const res = await axios.post(`${API}/suggest-name`, formData);
      setNamePlaceholder(res.data.suggestedName.replace(`.${outputFormat}`, ""));
    } catch {
      setNamePlaceholder("merged_output");
    } finally {
      setLoadingName(false);
    }
  }

  // ── ONE-CLICK MERGE ────────────────────────────────────────────────────────
  async function handleMerge() {
    if (files.length === 0) return;
    if (merging) return;

    setMerging(true);
    setStatus({ type: "loading", title: "Processing your files...", desc: "Extracting, merging and generating your document." });
    setDownloadInfo(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      formData.append("outputFormat", outputFormat);
      formData.append("outputName", outputName.trim() || namePlaceholder || "merged_output");

      const res = await axios.post(`${API}/merge`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000, // 2 minute timeout for large files
      });

      setStatus({
        type: "success",
        title: "Files merged successfully!",
        desc: `${res.data.fileCount} file${res.data.fileCount > 1 ? "s" : ""} merged into ${res.data.format} · Click to download`,
      });

      setDownloadInfo({
        url: `${API}/download/${res.data.historyId}`,
        filename: res.data.filename,
      });

      // Refresh history
      fetchHistory();

      // Clear files after successful merge
      setFiles([]);
      setOutputName("");
      setNamePlaceholder("Upload files to get a smart name suggestion...");
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Something went wrong";
      setStatus({ type: "error", title: "Merge failed", desc: msg });
    } finally {
      setMerging(false);
    }
  }

  // ── FILE HANDLING ──────────────────────────────────────────────────────────
  const ALLOWED_EXTENSIONS = ["pdf", "docx", "doc", "xlsx", "xls", "csv", "txt", "pptx"];

  function addFiles(newFiles) {
    const valid = Array.from(newFiles).filter((f) => {
      const ext = f.name.split(".").pop().toLowerCase();
      return ALLOWED_EXTENSIONS.includes(ext);
    });
    if (valid.length < newFiles.length) {
      alert(`Some files were skipped. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}`);
    }
    setFiles((prev) => {
      // Avoid duplicate file names
      const existingNames = new Set(prev.map((f) => f.name));
      const unique = valid.filter((f) => !existingNames.has(f.name));
      return [...prev, ...unique];
    });
    setStatus(null);
    setDownloadInfo(null);
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // ── DRAG & DROP ────────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── HISTORY ACTIONS ────────────────────────────────────────────────────────
  async function deleteHistory(e, id) {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/history/${id}`);
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      console.error("Delete error:", err.message);
    }
  }

  function downloadFromHistory(item) {
    const url = `${API}/download/${item.id}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = item.output_filename;
    a.click();
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="app-layout">

      {/* ── LEFT SIDEBAR: HISTORY ─────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon">⚡</div>
            <span className="logo-text">File Merger</span>
          </div>
          <div className="logo-sub">Merge · Extract · Download</div>
        </div>

        <div className="sidebar-label">Merge History</div>

        <div className="history-list">
          {history.length === 0 ? (
            <div className="history-empty">
              <div className="history-empty-icon">📂</div>
              No merges yet.
              <br />
              Upload files and click
              <br />
              <strong>Merge Files</strong> to start.
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="history-item"
                onClick={() => downloadFromHistory(item)}
                title={`Download: ${item.output_filename}`}
              >
                <div className={badgeClass(item.output_format)}>
                  {item.output_format.toUpperCase().slice(0, 3)}
                </div>
                <div className="history-info">
                  <div className="history-name">{item.session_name.replace(/_/g, " ")}</div>
                  <div className="history-meta">
                    {item.file_count} file{item.file_count > 1 ? "s" : ""} · {timeAgo(item.created_at)}
                  </div>
                </div>
                <button
                  className="history-delete"
                  onClick={(e) => deleteHistory(e, item.id)}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <main className="main-content">

        {/* Page header */}
        <div className="page-header">
          <h1 className="page-title">
            Merge <span>Any Files</span> Instantly
          </h1>
          <p className="page-subtitle">
            Upload Word, PDF, Excel or any documents — merge them into one file with a single click.
          </p>
        </div>

        {/* ── STEP 1: Upload Zone ─────────────────────────────────────────── */}
        <div className="card" style={{ animationDelay: "0s" }}>
          <div className="card-title">Step 1 — Upload Your Files</div>
          <div
            className={`drop-zone ${dragging ? "dragging" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.pptx"
              style={{ display: "none" }}
              onChange={(e) => addFiles(e.target.files)}
            />
            <span className="drop-icon">📁</span>
            <div className="drop-title">
              {dragging ? "Drop files here!" : "Click or drag & drop your files"}
            </div>
            <div className="drop-subtitle">
              Add as many files as you want — they will all be merged into one
            </div>
            <div className="drop-formats">
              {["PDF", "DOCX", "XLSX", "CSV", "PPTX", "TXT"].map((f) => (
                <span key={f} className="format-chip">{f}</span>
              ))}
            </div>
          </div>

          {/* Selected file list */}
          {files.length > 0 && (
            <div className="file-list">
              {files.map((file, i) => (
                <div key={`${file.name}-${i}`} className="file-item">
                  <span className="file-icon">{getFileIcon(file.name)}</span>
                  <div className="file-details">
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{formatSize(file.size)}</div>
                  </div>
                  <button className="file-remove" onClick={() => removeFile(i)} title="Remove">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── STEP 2: Output Format ───────────────────────────────────────── */}
        <div className="card" style={{ animationDelay: "0.05s" }}>
          <div className="card-title">Step 2 — Choose Output Format</div>
          <div className="format-selector">
            {FORMATS.map((fmt) => (
              <button
                key={fmt.value}
                className={`format-btn ${outputFormat === fmt.value ? "selected" : ""}`}
                onClick={() => setOutputFormat(fmt.value)}
              >
                <span className="format-btn-icon">{fmt.icon}</span>
                <span className="format-btn-label">{fmt.label}</span>
                <span className="format-btn-desc">{fmt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── STEP 3: File Name ───────────────────────────────────────────── */}
        <div className="card" style={{ animationDelay: "0.1s" }}>
          <div className="card-title">Step 3 — Name Your Merged File</div>
          <div className="name-input-wrap">
            <input
              className="name-input"
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder={loadingName ? "Generating smart name..." : namePlaceholder}
            />
          </div>
          <div className="name-hint">
            {files.length > 0 && !loadingName && (
              <>
                <span className="name-ai-badge">✦ AI Suggested</span>
                {" "}— Leave blank to use the suggested name, or type your own.
              </>
            )}
            {files.length === 0 && "Upload files and the name will be suggested automatically."}
            {loadingName && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <div className="spinner spinner-sm" style={{ borderTopColor: "var(--accent)" }}></div>
                Generating smart name from your file names...
              </span>
            )}
          </div>
        </div>

        {/* ── Status Message ──────────────────────────────────────────────── */}
        {status && (
          <div className={`status-card ${status.type}`}>
            <span className="status-icon">
              {status.type === "success" && "✅"}
              {status.type === "error" && "❌"}
              {status.type === "loading" && (
                <div className="progress-dots">
                  <span /><span /><span />
                </div>
              )}
            </span>
            <div className="status-text">
              <div className="status-title">{status.title}</div>
              <div className="status-desc">{status.desc}</div>
            </div>
            {downloadInfo && status.type === "success" && (
              <a
                className="download-btn"
                href={downloadInfo.url}
                download={downloadInfo.filename}
                onClick={(e) => {
                  // Trigger download properly
                  e.preventDefault();
                  const a = document.createElement("a");
                  a.href = downloadInfo.url;
                  a.download = downloadInfo.filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                ⬇ Download
              </a>
            )}
          </div>
        )}

        {/* ── ONE-CLICK MERGE BUTTON ──────────────────────────────────────── */}
        <button
          className={`merge-btn ${merging ? "loading" : ""}`}
          disabled={files.length === 0 || merging}
          onClick={handleMerge}
        >
          {merging ? (
            <>
              <div className="spinner"></div>
              Merging {files.length} file{files.length > 1 ? "s" : ""}...
            </>
          ) : (
            <>
              ⚡ Merge {files.length > 0 ? `${files.length} File${files.length > 1 ? "s" : ""}` : "Files"} →{" "}
              {FORMATS.find((f) => f.value === outputFormat)?.label}
            </>
          )}
        </button>

      </main>
    </div>
  );
}
