import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createCanvas } from "@napi-rs/canvas";

const fixtureDirectory = resolve(
  import.meta.dirname,
  "../../tests/fixtures/smart-import-coverage",
);
const denseTextPath = resolve(fixtureDirectory, "dense-labelled-questionnaire.txt");
const denseLines = readFileSync(denseTextPath, "utf8")
  .trim()
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const passportLines = [
  "Passport type: Ordinary",
  "Passport number: P12345678",
  "Issue date: 2020-02-01",
  "Valid until: 2030-02-01",
  "Issuing country: Russia",
  "Place of issue: Moscow",
];

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function pdfEscape(value) {
  return value.replace(/[\\()]/g, "\\$&");
}

function createTextPdf(lines) {
  const perPage = 44;
  const pageGroups = Array.from(
    { length: Math.ceil(lines.length / perPage) },
    (_, index) => lines.slice(index * perPage, (index + 1) * perPage),
  );
  const objects = [];
  const pageIds = pageGroups.map((_, index) => 3 + index * 2);
  const fontId = 3 + pageGroups.length * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  pageGroups.forEach((linesForPage, index) => {
    const pageId = pageIds[index];
    const contentsId = pageId + 1;
    const commands = [
      "BT",
      "/F1 10 Tf",
      "50 760 Td",
      ...linesForPage.flatMap((line, lineIndex) => [
        lineIndex ? "0 -16 Td" : "",
        `(${pdfEscape(line)}) Tj`,
      ]),
      "ET",
    ]
      .filter(Boolean)
      .join("\n");
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentsId} 0 R >>`;
    objects[contentsId] =
      `<< /Length ${Buffer.byteLength(commands, "utf8")} >>\nstream\n${commands}\nendstream`;
  });
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

function createRaster(lines, path, heading) {
  const lineHeight = 42;
  const margin = 72;
  const canvas = createCanvas(2200, margin * 2 + 82 + lines.length * lineHeight);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111827";
  context.font = "bold 42px Arial";
  context.fillText(heading, margin, margin);
  context.font = "30px Arial";
  lines.forEach((line, index) => {
    context.fillText(line, margin, margin + 82 + index * lineHeight);
  });
  write(path, canvas.toBuffer("image/png"));
}

function createHandwrittenFixture(path) {
  const canvas = createCanvas(1600, 620);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffdf6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#d7e3f5";
  context.lineWidth = 2;
  for (let y = 100; y < canvas.height; y += 76) {
    context.beginPath();
    context.moveTo(70, y);
    context.lineTo(canvas.width - 70, y);
    context.stroke();
  }
  context.fillStyle = "#1e3a8a";
  context.font = "italic 48px cursive";
  context.fillText("Email: handwritten.demo@example.test", 90, 180);
  context.fillText("Phone: +1 202 555 0103", 90, 290);
  context.fillText("Note: demo only", 90, 400);
  write(path, canvas.toBuffer("image/png"));
}

write(
  resolve(fixtureDirectory, "dense-labelled-questionnaire.pdf"),
  createTextPdf(denseLines),
);
createRaster(
  denseLines,
  resolve(fixtureDirectory, "dense-labelled-questionnaire.png"),
  "Synthetic labelled questionnaire — OCR fixture",
);
write(
  resolve(fixtureDirectory, "passport-style-safe.pdf"),
  createTextPdf(passportLines),
);
createRaster(
  passportLines,
  resolve(fixtureDirectory, "passport-style-safe.png"),
  "Synthetic passport-style document — no real identity",
);
createHandwrittenFixture(resolve(fixtureDirectory, "handwritten-latin-note.png"));
