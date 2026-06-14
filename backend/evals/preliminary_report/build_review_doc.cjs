/**
 * Build a clinician-review Word document from the held-out case fixtures.
 *
 *   npm install docx        # (once; installs to the nearest node_modules)
 *   node build_review_doc.cjs
 *
 * Output: outputs/Float_Preliminary_Report_Case_Review.docx  (gitignored)
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageBreak,
} = require("docx");

const HERE = __dirname;
const CASES_DIR = path.join(HERE, "cases");
const OUT_DIR = path.join(HERE, "outputs");
const CONTENT_W = 9360; // US Letter, 1" margins

const cases = fs.readdirSync(CASES_DIR)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), "utf8")))
  .filter((c) => c.held_out)
  .sort((a, b) => a.name.localeCompare(b.name));

const TEAL = "0D9488";
const GREY = "64748B";
const LIGHT = "F1F5F9";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" };
const borders = { top: border, bottom: border, left: border, right: border };

function bullets(items, ref) {
  return items.map((t) => new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: [new TextRun(t)],
  }));
}

function label(text) {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text, bold: true, color: TEAL, size: 20 })],
  });
}

function cell(text, w, opts = {}) {
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: opts.head ? { fill: LIGHT, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: !!opts.head, size: 18 })] })],
  });
}

function entriesTable(entries) {
  const cols = [760, 2600, 3000, 3000];
  const head = new TableRow({ tableHeader: true, children: [
    cell("DT", cols[0], { head: true }),
    cell("Situation", cols[1], { head: true }),
    cell("What the parent observed", cols[2], { head: true }),
    cell("How the parent responded", cols[3], { head: true }),
  ]});
  const rows = entries.map((e) => new TableRow({ children: [
    cell(e.fear_thermometer == null ? "—" : String(e.fear_thermometer), cols[0]),
    cell(e.situation || "", cols[1]),
    cell(e.child_behavior_observed || "", cols[2]),
    cell(e.parent_response || "", cols[3]),
  ]}));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cols, rows: [head, ...rows] });
}

function reviewBox() {
  const blank = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 4 } }, spacing: { before: 120 }, children: [new TextRun(" ")] });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders, width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { fill: "FAFBFC", type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 160, left: 160, right: 160 },
      children: [
        new Paragraph({ children: [new TextRun({ text: "ADVISOR REVIEW", bold: true, color: GREY, size: 18 })] }),
        new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "Clinically realistic / plausible?   Approve  /  Approve with edits  /  Reject   (circle one)", size: 20 })] }),
        new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Edits to the monitoring log:", size: 20 })] }),
        blank(), blank(),
        new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Corrections to the expected key elements:", size: 20 })] }),
        blank(), blank(),
        new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Reviewer: ______________________      Date: ______________", size: 20 })] }),
      ],
    })] })],
  });
}

const children = [];

// Cover
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Float — Preliminary Report")] }));
children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Synthetic case review for clinical advisor", color: GREY, size: 24 })] }));
[
  "These are SYNTHETIC (fictional) parent monitoring logs, written to test Float's AI “Analyze with AI” preliminary-report feature. None of them are real patients.",
  "For each case, please: (1) confirm the monitoring log reads as clinically realistic — edit anything that doesn’t; and (2) confirm or correct the draft “expected key elements” — the situations, parental responses, and safety/avoidance behaviours (or rituals) a good report should surface.",
  "Your approved set becomes the answer key we grade the AI against, so the expected elements matter as much as the realism. Mark each case Approve / Approve with edits / Reject in the box at the foot of the case.",
  "The three calibration cases already built into the AI (Patrick, Maya, Kemp) are intentionally excluded here — only these held-out cases measure how well the model generalises.",
].forEach((t) => children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t, size: 22 })] })));

cases.forEach((c, i) => {
  children.push(new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2, children: [new TextRun(`${i + 1}. ${c.name} — ${c.presentation}`)] }));
  if (c.data_condition) children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Data condition: ${c.data_condition}`, italics: true, color: GREY, size: 20 })] }));
  children.push(label("MONITORING LOG"));
  children.push(entriesTable(c.entries));
  const ee = c.expected_elements || {};
  children.push(label("EXPECTED KEY ELEMENTS (draft — please confirm/correct)"));
  if (ee.situations) { children.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "Situations", bold: true, size: 20 })] })); bullets(ee.situations, "b").forEach((p) => children.push(p)); }
  if (ee.parental_responses) { children.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "Parental responses", bold: true, size: 20 })] })); bullets(ee.parental_responses, "b").forEach((p) => children.push(p)); }
  if (ee.safety_behaviors) { children.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: ee.safety_section_label || "Safety & avoidance behaviors", bold: true, size: 20 })] })); bullets(ee.safety_behaviors, "b").forEach((p) => children.push(p)); }
  children.push(new Paragraph({ spacing: { before: 120 }, children: [] }));
  children.push(reviewBox());
});

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, font: "Arial" }, paragraph: { spacing: { before: 120, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: "Arial", color: "1E293B" }, paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children,
  }],
});

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, "Float_Preliminary_Report_Case_Review.docx");
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log("wrote", out, `(${cases.length} cases)`); });
