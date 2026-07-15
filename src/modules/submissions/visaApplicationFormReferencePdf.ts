import { VISA_APPLICATION_FORM_TEMPLATE_BASE64 } from "./visaApplicationFormTemplate";
import {
  assertVisaFormDataRenderable,
  joinVisaFormValues,
  normalizeVisaFormPdfText,
  visaFormCityToLatin,
  visaFormPdfReferenceScale,
  visaFormTextFits,
  type VisaFormSelections,
} from "./visaApplicationFormRenderContract";
import type { VisaFormData } from "./visaApplicationFormPdf";

type ReferencePage = {
  contentObject: number;
  pageObject: number;
  resourceObject: number;
};

type PdfLayer = {
  commands: string[];
};

// The source document starts every page with this matrix and leaves it active
// for subsequent content streams. Coordinates extracted with PDF.js are in
// page space, so overlay positions must be mapped back into the source space.
const referenceScale = visaFormPdfReferenceScale;
const referenceOffsetX = 42.75;
const referenceOffsetY = 771.5;

const pages: readonly ReferencePage[] = [
  { contentObject: 18, pageObject: 5, resourceObject: 20 },
  { contentObject: 23, pageObject: 22, resourceObject: 25 },
  { contentObject: 29, pageObject: 27, resourceObject: 31 },
  { contentObject: 37, pageObject: 33, resourceObject: 39 },
];

const firstOverlayObject = 51;
const fontObject = firstOverlayObject + pages.length;
const firstResourceObject = fontObject + 1;

/**
 * Uses the sanitised local reference as the static form. Only applicant data
 * is appended, so page geometry and bilingual form copy are never re-drawn.
 */
export function createReferenceVisaApplicationFormPdfBlob(
  data: VisaFormData,
  options: { exportDate?: string } = {},
): Blob {
  const selections = assertVisaFormDataRenderable(data);
  const source = decodeTemplate();
  const sourceText = latin1(source);
  const sourceStartXref = sourceText.lastIndexOf("startxref");
  const previousXref = Number(
    sourceText.slice(sourceStartXref).match(/startxref\s+(\d+)/)?.[1],
  );
  if (!Number.isFinite(previousXref)) {
    throw new Error("Visa form template has no readable xref offset.");
  }

  const layers = buildReferenceLayers(
    data,
    selections,
    visaFormExportDate(options.exportDate),
  );
  const objects = new Map<number, string>();
  objects.set(
    fontObject,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>",
  );

  pages.forEach((page, index) => {
    const overlayObject = firstOverlayObject + index;
    const resourceObject = firstResourceObject + index;
    const layer = layers[index];
    if (!layer) throw new Error("Missing PDF overlay for page " + (index + 1) + ".");

    objects.set(overlayObject, streamObject(layer.commands.join("\n")));
    objects.set(
      resourceObject,
      addOverlayFont(readPdfObject(sourceText, page.resourceObject), fontObject),
    );
    objects.set(
      page.pageObject,
      appendOverlayContent(
        readPdfObject(sourceText, page.pageObject),
        page.contentObject,
        overlayObject,
        resourceObject,
      ),
    );
  });

  const orderedObjects = [...objects.entries()].sort(([left], [right]) => left - right);
  const chunks: string[] = ["\n"];
  let offset = source.byteLength + byteLength(chunks[0] ?? "");
  const offsets = new Map<number, number>();

  for (const [objectNumber, body] of orderedObjects) {
    const serialised = String(objectNumber) + " 0 obj\n" + body + "\nendobj\n";
    offsets.set(objectNumber, offset);
    chunks.push(serialised);
    offset += byteLength(serialised);
  }

  const xrefOffset = offset;
  const maxObject = Math.max(...objects.keys()) + 1;
  chunks.push("xref\n");
  for (const [objectNumber] of orderedObjects) {
    const objectOffset = String(offsets.get(objectNumber) ?? 0).padStart(10, "0");
    chunks.push(String(objectNumber) + " 1\n" + objectOffset + " 00000 n \n");
  }
  chunks.push(
    "trailer\n<< /Size " +
      maxObject +
      " /Root 36 0 R /Info 1 0 R /Prev " +
      previousXref +
      " >>\nstartxref\n" +
      xrefOffset +
      "\n%%EOF",
  );

  return new Blob([source, chunks.join("")], { type: "application/pdf" });
}

function buildReferenceLayers(
  data: VisaFormData,
  selections: VisaFormSelections,
  exportDate: string,
): PdfLayer[] {
  const page1 = newLayer();
  const page2 = newLayer();
  const page3 = newLayer();
  const page4 = newLayer();

  // Baselines are extracted from the supplied filled reference, not guessed
  // from a generic Schengen form.
  text(page1, 66.75, 576.75, data.surname, 6.13, 112);
  text(page1, 66.75, 550, data.surnameAtBirth, 6.13, 112);
  text(page1, 66.75, 526.25, data.firstName, 6.13, 112);
  text(page1, 66.75, 495.75, data.birthDate, 6.13, 90);
  text(page1, 196, 502.75, data.birthPlace, 6.13, 128);
  text(page1, 196, 481, data.birthCountry, 6.13, 128);
  text(page1, 328, 494.25, data.citizenship, 6.13, 104);
  text(page1, 328, 470.5, data.nationalityAtBirth, 6.13, 104);
  text(page1, 66.75, 225, data.passportNo, 6.13, 76);
  text(page1, 167.75, 239.25, data.issueDate, 6.13, 78);
  text(page1, 260.5, 246.25, data.passportExpiry, 6.13, 78);
  text(
    page1,
    363.5,
    239.25,
    joinVisaFormValues(data.issueCountry, data.issuePlace),
    6.13,
    104,
  );
  checkbox(page1, 57.37, 423.98, selections.gender === "male");
  checkbox(page1, 111.59, 413.61, selections.gender === "female");
  checkbox(page1, 189.87, 423.98, selections.maritalStatus === "single");
  checkbox(page1, 295.02, 423.98, selections.maritalStatus === "married");
  checkbox(page1, 392.15, 423.98, selections.maritalStatus === "registered");
  checkbox(page1, 315.29, 411.25, selections.maritalStatus === "separated");
  checkbox(page1, 189.87, 398.52, selections.maritalStatus === "divorced");
  checkbox(page1, 275.68, 398.52, selections.maritalStatus === "widow");
  checkbox(page1, 57.37, 296.2, selections.passportType === "ordinary");
  checkbox(page1, 181.38, 296.2, selections.passportType === "diplomatic");
  checkbox(page1, 333.21, 296.2, selections.passportType === "service");
  checkbox(page1, 81.89, 285.83, selections.passportType === "official");
  checkbox(page1, 305.39, 285.83, selections.passportType === "special");
  checkbox(page1, 264.37, 265.08, selections.passportType === "otherDocument");

  text(page2, 59.75, 670.5, data.email, 6.13, 210);
  text(page2, 59.75, 651.75, data.address, 6.13, 210);
  text(
    page2,
    59.75,
    644.75,
    joinVisaFormValues(data.addressCity, data.residenceCountry, data.postalCode),
    6.13,
    210,
  );
  text(page2, 296, 677.75, data.phone, 6.13, 105);
  text(page2, 59.75, 531, data.occupation, 6.13, 132);
  text(page2, 59.75, 507.5, data.employer, 6.13, 352);
  text(page2, 59.75, 469.5, data.visaSubType, 6.13, 352);
  text(page2, 59.75, 425.5, data.mainDestination, 6.13, 222);
  text(page2, 296, 425.5, data.firstEntryCountry, 6.13, 222);
  text(page2, 133.75, 176.5, data.tripFrom, 6.13, 78);
  text(page2, 273.75, 176.5, data.tripTo, 6.13, 78);
  text(page2, 357.25, 176.5, data.duration, 6.13, 78);
  text(
    page2,
    59.75,
    115.25,
    joinVisaFormValues(
      data.hotelName,
      data.hotelAddress,
      data.hotelCity,
      data.hotelCountry,
    ),
    6.13,
    364,
  );
  checkbox(page2, 57.37, 503.2, selections.purpose === "tourism");
  checkbox(page2, 124.8, 503.2, selections.purpose === "business");
  checkbox(page2, 196.47, 503.2, selections.purpose === "visit");
  checkbox(page2, 391.21, 503.2, selections.purpose === "cultural");
  checkbox(page2, 461.94, 503.2, selections.purpose === "sports");
  checkbox(page2, 57.37, 492.83, selections.purpose === "official");
  checkbox(page2, 173.36, 492.83, selections.purpose === "medical");
  checkbox(page2, 263.9, 492.83, selections.purpose === "study");
  checkbox(page2, 57.37, 480.1, selections.purpose === "transit");
  checkbox(page2, 199.3, 480.1, selections.purpose === "other");
  checkbox(page2, 57.37, 361.27, selections.entries === "single");
  checkbox(page2, 127.63, 361.27, selections.entries === "two");
  checkbox(page2, 193.64, 361.27, selections.entries === "multiple");

  text(page3, 59.75, 730, data.hotelAddress, 6.13, 210);
  text(
    page3,
    90,
    730,
    joinVisaFormValues(data.hotelCity, data.hotelCountry, data.hotelEmail),
    6.13,
    170,
  );
  text(page3, 296, 751.25, data.hotelPhone, 6.13, 112);
  text(page3, 59.75, 694.25, data.companyDetails ?? "", 6.13, 460);
  text(page3, 59.75, 655.98, data.companyContact ?? "", 6.13, 210);
  text(page3, 295.96, 663.05, data.companyPhone ?? "", 6.13, 112);
  checkbox(page3, 57.37, 602.22, selections.costCoveredBy === "applicant");
  checkbox(page3, 293.6, 602.22, selections.costCoveredBy === "sponsor");
  checkbox(page3, 57.37, 571.1, selections.meansOfSupport === "cash");
  checkbox(page3, 57.37, 558.84, selections.meansOfSupport === "cheques");
  checkbox(page3, 57.37, 546.58, selections.meansOfSupport === "credit");
  checkbox(page3, 57.37, 534.32, selections.meansOfSupport === "accommodation");
  checkbox(page3, 57.37, 522.06, selections.meansOfSupport === "transport");
  checkbox(page3, 57.37, 509.8, selections.meansOfSupport === "other");
  checkbox(page3, 303.03, 582.89, selections.sponsorInHostFields === "listed");
  checkbox(page3, 303.03, 570.63, selections.sponsorInHostFields === "other");
  checkbox(page3, 293.6, 539.51, selections.sponsorMeans === "cash");
  checkbox(page3, 293.6, 527.25, selections.sponsorMeans === "accommodation");
  checkbox(page3, 293.6, 514.99, selections.sponsorMeans === "allExpenses");
  checkbox(page3, 293.6, 495.66, selections.sponsorMeans === "transport");
  checkbox(page3, 293.6, 483.4, selections.sponsorMeans === "other");

  // A signature is deliberately never manufactured. The final field is only
  // place/date, which is derived from the applicant address and export date.
  text(
    page4,
    90,
    126.5,
    visaFormCityToLatin(data.addressCity) + ", " + exportDate,
    6.13,
    220,
  );

  return [page1, page2, page3, page4];
}

function newLayer(): PdfLayer {
  return { commands: ["q", "0 g"] };
}

function text(
  layer: PdfLayer,
  x: number,
  y: number,
  value: string,
  size: number,
  maxWidth: number,
) {
  const fitted = fitText(value, size, maxWidth);
  if (!fitted) return;
  layer.commands.push(
    "BT /VF " +
      n(size) +
      " Tf 1 0 0 -1 " +
      n(referenceX(x)) +
      " " +
      n(referenceY(y)) +
      " Tm (" +
      escapePdfText(fitted) +
      ") Tj ET",
  );
}

function checkbox(layer: PdfLayer, x: number, y: number, checked: boolean) {
  if (!checked) return;
  const inset = 2.6;
  const size = 6.5;
  layer.commands.push(
    "q 0 g 0.65 w " +
      n(referenceX(x + inset)) +
      " " +
      n(referenceY(y + inset)) +
      " m " +
      n(referenceX(x + inset + size)) +
      " " +
      n(referenceY(y + inset + size)) +
      " l S " +
      n(referenceX(x + inset + size)) +
      " " +
      n(referenceY(y + inset)) +
      " m " +
      n(referenceX(x + inset)) +
      " " +
      n(referenceY(y + inset + size)) +
      " l S Q",
  );
}

function referenceX(value: number) {
  return (value - referenceOffsetX) / referenceScale;
}

function referenceY(value: number) {
  return (referenceOffsetY - value) / referenceScale;
}

function streamObject(content: string) {
  const completed = content + "\nQ";
  return (
    "<< /Length " + byteLength(completed) + " >>\nstream\n" + completed + "\nendstream"
  );
}

function readPdfObject(source: string, objectNumber: number) {
  const marker = new RegExp("(?:^|\\n)" + objectNumber + " 0 obj\\r?\\n");
  const match = marker.exec(source);
  if (!match) {
    throw new Error("Visa form template object " + objectNumber + " is missing.");
  }
  const contentStart = match.index + match[0].length;
  const end = source.indexOf("\nendobj", contentStart);
  if (end < 0) {
    throw new Error("Visa form template object " + objectNumber + " is malformed.");
  }
  return source.slice(contentStart, end);
}

function addOverlayFont(resourceObject: string, overlayFontObject: number) {
  const next = resourceObject.replace(
    /\/Font\s*<<([\s\S]*?)>>/,
    (_match, fonts: string) =>
      "/Font <<" + fonts + " /VF " + overlayFontObject + " 0 R >>",
  );
  if (next === resourceObject) {
    throw new Error("Visa form template font resource cannot be extended.");
  }
  return next;
}

function appendOverlayContent(
  pageObject: string,
  sourceContentObject: number,
  overlayObject: number,
  resourceObject: number,
) {
  const contentExpression = new RegExp(
    "/Contents\\s+" + sourceContentObject + "\\s+0\\s+R",
  );
  const withContents = pageObject.replace(
    contentExpression,
    "/Contents [" + sourceContentObject + " 0 R " + overlayObject + " 0 R]",
  );
  const withResources = withContents.replace(
    /\/Resources\s+\d+\s+0\s+R/,
    "/Resources " + resourceObject + " 0 R",
  );
  if (withContents === pageObject || withResources === withContents) {
    throw new Error("Visa form template page cannot receive an overlay.");
  }
  return withResources;
}

function decodeTemplate() {
  const binary = atob(VISA_APPLICATION_FORM_TEMPLATE_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function latin1(bytes: Uint8Array) {
  return new TextDecoder("iso-8859-1").decode(bytes);
}

function fitText(value: string, size: number, maxWidth: number) {
  const normalized = normalizeVisaFormPdfText(value);
  if (!normalized) return "";
  if (!visaFormTextFits(value, size, maxWidth)) {
    throw new Error("Visa form text overflow was not blocked before rendering.");
  }
  return normalized;
}

function visaFormExportDate(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Visa form export date is invalid.");
  }
  return [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function n(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
