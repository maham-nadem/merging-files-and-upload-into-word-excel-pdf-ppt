const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const PDFDocument = require("pdfkit");
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require("docx");
const ExcelJS = require("exceljs");
const pdfParse = require("pdf-parse");
const XLSX = require("xlsx");
const PptxGenJS = require("pptxgenjs");

const OUTPUT_DIR = path.join(__dirname, "outputs");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── FILE NAME SUGGESTER ──────────────────────────────────────────────────────
function suggestFileName(names, format) {
  const stopWords = new Set([
    "file", "document", "doc", "sheet", "report", "data", "copy",
    "final", "new", "the", "and", "for", "with", "from", "draft",
    "version", "revised", "updated", "merged", "output", "test",
  ]);

  const allWords = names
    .flatMap((n) => n.toLowerCase().replace(/[_\-\.]+/g, " ").split(/\s+/))
    .filter((w) => w.length > 2 && !stopWords.has(w) && isNaN(w));

  const freq = {};
  allWords.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });

  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word)
    .slice(0, 3);

  if (sorted.length === 0) return `Merged_Files_${Date.now()}.${format}`;

  const base = sorted.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("_");
  return `${base}_Merged.${format}`;
}

// ─── TEXT / DATA EXTRACTOR ────────────────────────────────────────────────────
// Runs silently on backend — never exposed to frontend
async function extractFileContent(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const buf = fs.readFileSync(file.path);
  const title = path.parse(file.originalname).name;

  try {
    if (ext === ".pdf") {
      const data = await pdfParse(buf);
      return { title, content: data.text || "(No extractable text found)", type: "pdf" };
    }

    if (ext === ".docx" || ext === ".doc") {
      const result = await mammoth.extractRawText({ buffer: buf });
      return { title, content: result.value || "(Empty document)", type: "docx" };
    }

    if (ext === ".xlsx" || ext === ".xls") {
      const workbook = XLSX.read(buf, { type: "buffer" });
      let textContent = "";
      const sheetsData = [];
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        textContent += rows.map((row) => row.join("\t")).join("\n") + "\n\n";
        sheetsData.push({ name: sheetName, rows });
      });
      return { title, content: textContent, type: "excel", sheetsData, rawWorkbook: workbook };
    }

    if (ext === ".csv") {
      const workbook = XLSX.read(buf, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      return {
        title,
        content: rows.map((r) => r.join("\t")).join("\n"),
        type: "csv",
        sheetsData: [{ name: title, rows }],
      };
    }

    if (ext === ".pptx") {
      return { title, content: `[PowerPoint: ${file.originalname}]`, type: "pptx" };
    }

    if (ext === ".txt") {
      return { title, content: buf.toString("utf-8"), type: "txt" };
    }

    return { title, content: `[Unsupported: ${file.originalname}]`, type: "unknown" };
  } catch (err) {
    return { title, content: `[Error reading ${file.originalname}: ${err.message}]`, type: "error" };
  }
}

// ─── MERGE TO PDF ─────────────────────────────────────────────────────────────
// Top: one merged title only. Content flows seamlessly. No file names anywhere.
async function mergeToPDF(extractedFiles, outputName) {
  const outputPath = path.join(OUTPUT_DIR, `${outputName}.pdf`);

  const doc = new PDFDocument({
    margin: 55,
    size: "A4",
    bufferPages: true,
    info: {
      Title: outputName.replace(/_/g, " "),
      Author: "File Merger Agent",
      Subject: "Merged Document",
      CreationDate: new Date(),
    },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // ── Single title bar at very top — merged name only ──
  doc.rect(0, 0, doc.page.width, 88).fill("#1a1a2e");

  doc.fillColor("#ffffff")
    .fontSize(24)
    .font("Helvetica-Bold")
    .text(
      outputName.replace(/_/g, " "),
      55, 20,
      { align: "center", width: doc.page.width - 110 }
    );

  doc.fillColor("#aaaacc")
    .fontSize(10)
    .font("Helvetica")
    .text(
      `${extractedFiles.length} files merged  |  ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      55, 58,
      { align: "center", width: doc.page.width - 110 }
    );

  // ── Content: all files flow one after another — no names, no headings ──
  let isFirst = true;

  for (const f of extractedFiles) {
    const content = f.content.trim();
    if (!content) continue;

    if (isFirst) {
      // Start content just below title bar
      doc.y = 108;
      isFirst = false;
    } else {
      // Thin line separator between files — no label, no name
      doc.moveDown(1);
      if (doc.y < doc.page.height - 100) {
        doc.moveTo(55, doc.y)
          .lineTo(doc.page.width - 55, doc.y)
          .strokeColor("#e0e0e0")
          .lineWidth(0.5)
          .stroke();
      }
      doc.moveDown(1);
    }

    // Write content directly — no title, no label
    doc.fillColor("#222222")
      .fontSize(10.5)
      .font("Helvetica")
      .text(content, 55, doc.y, {
        width: doc.page.width - 110,
        lineGap: 3,
        paragraphGap: 6,
        align: "left",
      });
  }

  // ── Page number footer on every page ──
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fillColor("#bbbbbb")
      .fontSize(8)
      .font("Helvetica")
      .text(
        `Page ${i + 1} of ${pages.count}`,
        55,
        doc.page.height - 28,
        { align: "center", width: doc.page.width - 110 }
      );
  }

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return outputPath;
}

// ─── MERGE TO DOCX ────────────────────────────────────────────────────────────
// Top: merged name as title. Content flows directly. No file names anywhere.
async function mergeToDOCX(extractedFiles, outputName) {
  const outputPath = path.join(OUTPUT_DIR, `${outputName}.docx`);
  const children = [];

  // ── Single title — merged name only ──
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: outputName.replace(/_/g, " "),
          bold: true,
          size: 52,
          color: "1a1a2e",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
    })
  );

  // Date subtitle — no file names
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${extractedFiles.length} files merged  |  ${new Date().toLocaleDateString()}`,
          size: 18,
          color: "888888",
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
    })
  );

  // ── All file content flows directly one after another — no file names ──
  extractedFiles.forEach((f, i) => {
    // Thin separator between files (not before the first)
    if (i > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "",
              size: 4,
            }),
          ],
          border: {
            top: { style: "single", size: 4, color: "DDDDDD" },
          },
          spacing: { before: 300, after: 300 },
        })
      );
    }

    // Content lines — no heading, no label, no file name
    const lines = f.content.trim().split("\n");
    lines.forEach((line) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: 22,
              color: "333333",
            }),
          ],
          spacing: { after: 80 },
        })
      );
    });
  });

  const docx = new Document({
    sections: [{ properties: {}, children }],
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "333333" },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(docx);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// ─── MERGE TO EXCEL ───────────────────────────────────────────────────────────
async function mergeToExcel(extractedFiles, outputName) {
  const outputPath = path.join(OUTPUT_DIR, `${outputName}.xlsx`);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "File Merger Agent";
  workbook.created = new Date();

  // ── Summary sheet with merged name at top — no individual file names in header ──
  const summary = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: "FF1a1a2e" } },
  });

  summary.getColumn("A").width = 5;
  summary.getColumn("B").width = 35;
  summary.getColumn("C").width = 15;
  summary.getColumn("D").width = 20;
  summary.getColumn("E").width = 20;

  summary.mergeCells("A1:E1");
  const titleCell = summary.getCell("A1");
  titleCell.value = outputName.replace(/_/g, " ");
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a1a2e" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  summary.getRow(1).height = 40;

  summary.mergeCells("A2:E2");
  const dateCell = summary.getCell("A2");
  dateCell.value = `Generated: ${new Date().toLocaleString()}  |  ${extractedFiles.length} files merged`;
  dateCell.font = { italic: true, size: 11, color: { argb: "FF888888" } };
  dateCell.alignment = { horizontal: "center" };
  summary.getRow(2).height = 22;

  summary.addRow([]);

  const headerRow = summary.addRow(["#", "Source File", "Type", "Characters", "Status"]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4f46e5" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  summary.getRow(4).height = 22;

  extractedFiles.forEach((f, i) => {
    const row = summary.addRow([i + 1, f.title, f.type.toUpperCase(), f.content.length, "Merged"]);
    const bgColor = i % 2 === 0 ? "FFF8F9FA" : "FFFFFFFF";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE0E0E0" } } };
    });
    row.height = 20;
  });

  // ── Merged Data sheet — all content together, no file name headers ──
  const mergedSheet = workbook.addWorksheet("Merged Data", {
    properties: { tabColor: { argb: "FF4f46e5" } },
  });
  mergedSheet.getColumn("A").width = 120;

  extractedFiles.forEach((f, i) => {
    // Just a blank separator row between files — no name
    if (i > 0) {
      mergedSheet.addRow([]);
      const sepRow = mergedSheet.addRow(["─".repeat(80)]);
      sepRow.getCell(1).font = { color: { argb: "FFDDDDDD" }, size: 9 };
      mergedSheet.addRow([]);
    }

    // Content rows — no title row, just data
    const lines = f.content.trim().split("\n");
    lines.forEach((line) => {
      const r = mergedSheet.addRow([line]);
      r.getCell(1).alignment = { wrapText: true };
      r.getCell(1).font = { size: 10, color: { argb: "FF333333" } };
    });
  });

  // ── Individual sheets per file (for Excel/CSV, actual data) ──
  for (const f of extractedFiles) {
    const sheetName = f.title
      .replace(/[:\\/?\*\[\]'"]/g, "")
      .substring(0, 28)
      .trim() || `Sheet_${Date.now()}`;

    if ((f.type === "excel" || f.type === "csv") && f.sheetsData && f.sheetsData.length > 0) {
      f.sheetsData.forEach((sheetData, idx) => {
        const ws = workbook.addWorksheet(
          idx === 0 ? sheetName : `${sheetName}_${sheetData.name}`.substring(0, 31)
        );
        if (sheetData.rows && sheetData.rows.length > 0) {
          const headerR = ws.addRow(sheetData.rows[0]);
          headerR.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a1a2e" } };
          });
          for (let r = 1; r < sheetData.rows.length; r++) {
            const dr = ws.addRow(sheetData.rows[r]);
            const bgColor = r % 2 === 0 ? "FFF0F4FF" : "FFFFFFFF";
            dr.eachCell((cell) => {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
            });
          }
          ws.columns.forEach((col) => {
            col.width = Math.min(Math.max(col.width || 10, 12), 40);
          });
        }
      });
    }
  }

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

// ─── MERGE TO PPTX ────────────────────────────────────────────────────────────
// Title slide with merged name only. Content slides have no file name headers.
async function mergeToPPTX(extractedFiles, outputName) {
  const outputPath = path.join(OUTPUT_DIR, `${outputName}.pptx`);

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "File Merger Agent";
  pptx.title = outputName.replace(/_/g, " ");

  // ── Title slide — merged name only, no file list ──
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: "1a1a2e" };

  titleSlide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 3.2, w: "100%", h: 0.06,
    fill: { color: "4f46e5" },
    line: { color: "4f46e5" },
  });

  titleSlide.addText(outputName.replace(/_/g, " "), {
    x: 0.6, y: 1.3, w: 12.1, h: 1.6,
    fontSize: 42,
    bold: true,
    color: "FFFFFF",
    align: "center",
    fontFace: "Calibri",
  });

  titleSlide.addText(
    `${extractedFiles.length} Files Merged  ·  ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    {
      x: 0.6, y: 3.4, w: 12.1, h: 0.5,
      fontSize: 14,
      color: "8888bb",
      align: "center",
    }
  );

  // ── Content slides — all content flows, no file name on any slide ──
  // Collect all lines from all files together
  const allLines = [];
  extractedFiles.forEach((f, fileIdx) => {
    const lines = f.content
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    lines.forEach((line) => allLines.push(line));

    // Add a blank separator entry between files (not after last)
    if (fileIdx < extractedFiles.length - 1) {
      allLines.push(""); // blank line as separator
    }
  });

  // Split all lines into slides of 12 lines each
  const LINES_PER_SLIDE = 12;
  const chunks = [];
  for (let i = 0; i < allLines.length; i += LINES_PER_SLIDE) {
    chunks.push(allLines.slice(i, i + LINES_PER_SLIDE));
  }
  if (chunks.length === 0) chunks.push(["(No content extracted)"]);

  chunks.forEach((chunk, slideIdx) => {
    const slide = pptx.addSlide();
    slide.background = { color: "F8F9FF" };

    // Thin top accent bar — no file name, just visual
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: "100%", h: 0.08,
      fill: { color: "4f46e5" },
      line: { color: "4f46e5" },
    });

    // Page number — top right only
    slide.addText(`${slideIdx + 1} / ${chunks.length}`, {
      x: 11.5, y: 0.12, w: 1.6, h: 0.3,
      fontSize: 9,
      color: "aaaaaa",
      align: "right",
    });

    // Content — full slide, no header space wasted
    slide.addText(chunk.filter(l => l).join("\n"), {
      x: 0.4, y: 0.5, w: 12.5, h: 6.7,
      fontSize: 12,
      color: "333333",
      valign: "top",
      wrap: true,
      lineSpacingMultiple: 1.5,
    });
  });

  await pptx.writeFile({ fileName: outputPath });
  return outputPath;
}

// ─── MAIN MERGE DISPATCHER ────────────────────────────────────────────────────
async function mergeFiles(files, outputFormat, outputName) {
  const extractedFiles = await Promise.all(files.map(extractFileContent));

  switch (outputFormat.toLowerCase()) {
    case "pdf":  return await mergeToPDF(extractedFiles, outputName);
    case "docx": return await mergeToDOCX(extractedFiles, outputName);
    case "xlsx": return await mergeToExcel(extractedFiles, outputName);
    case "pptx": return await mergeToPPTX(extractedFiles, outputName);
    default: throw new Error(`Unsupported output format: ${outputFormat}`);
  }
}

module.exports = { mergeFiles, suggestFileName };