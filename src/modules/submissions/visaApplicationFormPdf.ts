import type { Applicant, Submission } from "./types";

export function createVisaApplicationFormPdfBlob(
  submission: Submission,
  applicant: Applicant,
): Blob {
  const data = buildVisaFormData(submission, applicant);
  return createPdfBlob([
    renderPage1(data),
    renderPage2(data),
    renderPage3(data),
    renderPage4(data),
  ]);
}

type VisaFormData = {
  address: string;
  addressCity: string;
  birthCountry: string;
  birthDate: string;
  birthPlace: string;
  citizenship: string;
  costCoveredBy: string;
  duration: string;
  email: string;
  employer: string;
  entries: string;
  firstEntryCountry: string;
  firstName: string;
  gender: string;
  hotelAddress: string;
  hotelCity: string;
  hotelCountry: string;
  hotelEmail: string;
  hotelName: string;
  hotelPhone: string;
  issueCountry: string;
  issueDate: string;
  issuePlace: string;
  maritalStatus: string;
  meansOfSupport: string;
  nationalityAtBirth: string;
  occupation: string;
  passportExpiry: string;
  passportNo: string;
  passportType: string;
  phone: string;
  postalCode: string;
  purpose: string;
  residenceCountry: string;
  surname: string;
  surnameAtBirth: string;
  tripFrom: string;
  tripTo: string;
  visaSubType: string;
  visaType: string;
};

type PdfPage = {
  content: string;
};

type DrawState = {
  commands: string[];
  height: number;
};

const pageWidth = 595;
const pageHeight = 842;
const left = 36;
const right = 559;
const fontRegular = "F1";
const fontBold = "F2";

const transliteration: Record<string, string> = {
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Е: "E",
  Ё: "E",
  Ж: "ZH",
  З: "Z",
  И: "I",
  Й: "Y",
  К: "K",
  Л: "L",
  М: "M",
  Н: "N",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  У: "U",
  Ф: "F",
  Х: "KH",
  Ц: "TS",
  Ч: "CH",
  Ш: "SH",
  Щ: "SCH",
  Ъ: "",
  Ы: "Y",
  Ь: "",
  Э: "E",
  Ю: "YU",
  Я: "YA",
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function buildVisaFormData(
  submission: Submission,
  applicant: Applicant,
): VisaFormData {
  const field = fieldReader(applicant);
  const name = applicantNameParts(applicant.fullName);
  const tripFrom = dateForVisaForm(field("arrival-date", submission.tripDateFrom));
  const tripTo = dateForVisaForm(field("departure-date", submission.tripDateTo));
  const passportNo = cleanPassport(
    field("passport-no", field("passport-number", field("passportNo"))),
  );

  return {
    address: field("home-address"),
    addressCity: field("home-city", cityToLatin(submission.city)),
    birthCountry: normalizeCountry(field("birth-country", "Russian Federation")),
    birthDate: dateForVisaForm(field("birth-date")),
    birthPlace: field("birth-place"),
    citizenship: normalizeCountry(field("nationality", "Russian Federation")),
    costCoveredBy: field("cost-covered-by", "Applicant"),
    duration: field("stay-duration") || durationDays(tripFrom, tripTo),
    email: field("email"),
    employer: firstNonEmpty(
      field("employer-name"),
      field("employer-address"),
      field("occupation") || "NO OCCUPATION",
    ),
    entries: field("entry-count", "Multiple Entry"),
    firstEntryCountry: normalizeCountry(field("first-entry-country", "Spain")),
    firstName: field("first-name", name.first),
    gender: field("gender"),
    hotelAddress: field("hotel-address"),
    hotelCity: field("hotel-city", "Barcelona"),
    hotelCountry: normalizeCountry(field("hotel-country", "Spain")),
    hotelEmail: field("hotel-email"),
    hotelName: field("hotel-name", "HOTEL"),
    hotelPhone: digitsOnly(field("hotel-contact")),
    issueCountry: normalizeCountry(field("passport-issue-country", "Russian Federation")),
    issueDate: dateForVisaForm(field("passport-issue-date")),
    issuePlace: field("passport-issue-place"),
    maritalStatus: field("marital-status"),
    meansOfSupport: field("means-of-support", "Cash"),
    nationalityAtBirth: normalizeCountry(
      field("nationality-at-birth", field("birth-country", "Russian Federation")),
    ),
    occupation: field("occupation-specify", field("occupation", "NO OCCUPATION")),
    passportExpiry: dateForVisaForm(field("passport-expiry-date")),
    passportNo,
    passportType: field("passport-type", "Ordinary Passport"),
    phone: digitsOnly(field("contact-number")),
    postalCode: field("postal-code"),
    purpose: field("purpose", field("visa-sub-type", "Tourism")),
    residenceCountry: normalizeCountry(field("home-country", "Russian Federation")),
    surname: field("surname", name.surname),
    surnameAtBirth: field("surname-at-birth", field("surname", name.surname)),
    tripFrom,
    tripTo,
    visaSubType: field("visa-sub-type", "Tourism"),
    visaType: field("visa-type", "C"),
  };
}

function renderPage1(data: VisaFormData): PdfPage {
  const state = newState();
  title(state, "APPLICATION FOR SCHENGEN VISA", "Impreso gratuito / Free form", 34);
  text(state, 42, 72, "Fields 1-3 are completed from the travel document. Generated by VisaFlow export.", 7);
  box(state, 470, 42, 70, 88);
  text(state, 493, 82, "PHOTO", 9, fontBold);
  box(state, 42, 140, 370, 54);
  labelValue(state, 48, 151, "1. Surname(s)", data.surname, 9);
  box(state, 42, 194, 370, 46);
  labelValue(state, 48, 205, "2. Surname at birth", data.surnameAtBirth, 9);
  box(state, 42, 240, 370, 46);
  labelValue(state, 48, 251, "3. First name(s)", data.firstName, 9);
  box(state, 42, 286, 123, 70);
  labelValue(state, 48, 298, "4. Date of birth", data.birthDate, 10);
  box(state, 165, 286, 123, 70);
  labelValue(state, 171, 298, "5. Place of birth", data.birthPlace, 10);
  box(state, 288, 286, 124, 70);
  labelValue(state, 294, 298, "6. Country of birth", data.birthCountry, 10);
  box(state, 42, 356, 370, 58);
  labelValue(state, 48, 368, "7. Current nationality", data.citizenship, 10);
  text(state, 48, 397, `Nationality at birth: ${data.nationalityAtBirth}`, 8);
  box(state, 42, 414, 370, 54);
  text(state, 48, 427, "8. Sex", 7, fontBold);
  checkbox(state, 105, 423, genderMatches(data.gender, "male"), "Male");
  checkbox(state, 180, 423, genderMatches(data.gender, "female"), "Female");
  checkbox(state, 270, 423, !genderMatches(data.gender, "male") && !genderMatches(data.gender, "female"), "Other");
  box(state, 42, 468, 370, 64);
  text(state, 48, 481, "9. Civil status", 7, fontBold);
  checkbox(state, 48, 498, statusMatches(data.maritalStatus, "single"), "Single");
  checkbox(state, 130, 498, statusMatches(data.maritalStatus, "married"), "Married");
  checkbox(state, 220, 498, statusMatches(data.maritalStatus, "divorced"), "Divorced");
  checkbox(state, 315, 498, statusMatches(data.maritalStatus, "widow"), "Widow(er)");
  box(state, 42, 532, 370, 50);
  labelValue(state, 48, 544, "10. Parental authority / legal guardian, if minor", "", 8);
  box(state, 42, 582, 370, 42);
  labelValue(state, 48, 594, "11. National identity number, if applicable", "", 8);
  box(state, 42, 624, 370, 58);
  text(state, 48, 637, "12. Type of travel document", 7, fontBold);
  checkbox(state, 48, 654, /ordinary|обычный/i.test(data.passportType), "Ordinary passport");
  checkbox(state, 188, 654, /service/i.test(data.passportType), "Service passport");
  checkbox(state, 320, 654, false, "Other");
  box(state, 42, 682, 123, 68);
  labelValue(state, 48, 695, "13. Travel document No.", data.passportNo, 10);
  box(state, 165, 682, 123, 68);
  labelValue(state, 171, 695, "14. Date of issue", data.issueDate, 10);
  box(state, 288, 682, 124, 68);
  labelValue(state, 294, 695, "15. Valid until", data.passportExpiry, 10);
  box(state, 42, 750, 370, 48);
  labelValue(state, 48, 762, "16. Issued by country / authority", `${data.issueCountry} ${data.issuePlace}`.trim(), 8);

  box(state, 422, 140, 118, 658);
  text(state, 433, 156, "FOR OFFICIAL USE", 8, fontBold);
  const official = [
    "Date of application:",
    "Application number:",
    "Application lodged at:",
    "Service provider",
    "Documents submitted:",
    "Travel document",
    "Means of subsistence",
    "Invitation",
    "Travel medical insurance",
    "Decision:",
    "Issued / Refused",
    "Number of entries:",
    "Number of days:",
  ];
  official.forEach((line, index) => text(state, 433, 178 + index * 31, line, 7));
  text(state, 42, 817, "Page 1/4", 8);
  return finish(state);
}

function renderPage2(data: VisaFormData): PdfPage {
  const state = newState();
  title(state, "APPLICATION FOR SCHENGEN VISA", "Travel and stay details", 34);
  box(state, 42, 92, 500, 44);
  text(state, 48, 105, "18. Relationship with EU / EEA / Swiss citizen, if applicable", 7, fontBold);
  checkbox(state, 48, 121, false, "Spouse");
  checkbox(state, 130, 121, false, "Child");
  checkbox(state, 205, 121, false, "Other");
  box(state, 42, 136, 330, 84);
  labelValue(state, 48, 150, "19. Home address and email", [data.email, data.address, data.addressCity, data.residenceCountry, data.postalCode].filter(Boolean).join(" / "), 8, 3);
  box(state, 372, 136, 170, 84);
  labelValue(state, 380, 150, "Phone number(s)", data.phone, 10);
  box(state, 42, 220, 500, 54);
  text(state, 48, 233, "20. Residence in a country other than current nationality", 7, fontBold);
  checkbox(state, 48, 251, data.residenceCountry === data.citizenship, "No");
  checkbox(state, 100, 251, data.residenceCountry !== data.citizenship, "Yes");
  box(state, 42, 274, 500, 52);
  labelValue(state, 48, 288, "21. Current occupation", data.occupation, 9);
  box(state, 42, 326, 500, 62);
  labelValue(state, 48, 340, "22. Employer / educational establishment", data.employer, 9, 2);
  box(state, 42, 388, 500, 70);
  text(state, 48, 401, "23. Purpose(s) of the journey", 7, fontBold);
  checkbox(state, 48, 419, purposeMatches(data.purpose, "tour"), "Tourism");
  checkbox(state, 130, 419, purposeMatches(data.purpose, "business"), "Business");
  checkbox(state, 230, 419, purposeMatches(data.purpose, "visit"), "Visit family/friends");
  checkbox(state, 390, 419, purposeMatches(data.purpose, "other"), "Other");
  box(state, 42, 458, 500, 44);
  labelValue(state, 48, 472, "24. Additional information on purpose", data.visaSubType, 8);
  box(state, 42, 502, 250, 54);
  labelValue(state, 48, 516, "25. Main destination", "Spain", 10);
  box(state, 292, 502, 250, 54);
  labelValue(state, 300, 516, "26. First entry country", data.firstEntryCountry, 10);
  box(state, 42, 556, 500, 54);
  text(state, 48, 569, "27. Number of entries requested", 7, fontBold);
  checkbox(state, 48, 587, /single/i.test(data.entries), "Single");
  checkbox(state, 150, 587, /two/i.test(data.entries), "Two");
  checkbox(state, 245, 587, /multiple/i.test(data.entries), "Multiple");
  box(state, 42, 610, 250, 64);
  labelValue(state, 48, 624, "28. Intended arrival date", data.tripFrom, 10);
  box(state, 292, 610, 250, 64);
  labelValue(state, 300, 624, "Intended departure date", data.tripTo, 10);
  box(state, 42, 674, 500, 50);
  text(state, 48, 687, "29. Fingerprints collected previously", 7, fontBold);
  checkbox(state, 48, 704, true, "No / not provided");
  checkbox(state, 176, 704, false, "Yes");
  box(state, 42, 724, 500, 48);
  labelValue(state, 48, 738, "30. Entry permit for final destination, if applicable", "", 8);
  box(state, 42, 772, 500, 48);
  labelValue(state, 48, 786, "31. Inviting person / hotel", `${data.hotelName} ${data.hotelEmail} ${data.hotelPhone}`.trim(), 8);
  text(state, 42, 827, "Page 2/4", 8);
  return finish(state);
}

function renderPage3(data: VisaFormData): PdfPage {
  const state = newState();
  title(state, "APPLICATION FOR SCHENGEN VISA", "Host, company and expenses", 34);
  box(state, 42, 92, 250, 74);
  labelValue(state, 48, 106, "31. Hotel address and email", [data.hotelAddress, data.hotelCity, data.hotelCountry, data.hotelEmail].filter(Boolean).join(" / "), 8, 3);
  box(state, 292, 92, 250, 74);
  labelValue(state, 300, 106, "Hotel phone", data.hotelPhone, 9);
  box(state, 42, 166, 500, 92);
  labelValue(state, 48, 181, "32. Inviting company / organisation", `${data.hotelName}, ${data.hotelAddress}, ${data.hotelCity}, ${data.hotelCountry}`.trim(), 8, 3);
  labelValue(state, 48, 226, "Contact person", `${data.hotelName} ${data.hotelEmail} ${data.hotelPhone}`.trim(), 8);
  box(state, 42, 258, 500, 200);
  text(state, 48, 273, "33. Cost of travelling and living during stay is covered by", 8, fontBold);
  checkbox(state, 60, 300, costMatches(data.costCoveredBy, "applicant"), "By the applicant himself/herself");
  checkbox(state, 310, 300, costMatches(data.costCoveredBy, "sponsor"), "By sponsor / host / company");
  text(state, 60, 332, "Means of support", 8, fontBold);
  checkbox(state, 60, 353, meansMatches(data.meansOfSupport, "cash"), "Cash");
  checkbox(state, 60, 378, meansMatches(data.meansOfSupport, "credit"), "Credit card");
  checkbox(state, 60, 403, /accommodation/i.test(data.meansOfSupport), "Accommodation prepaid/provided");
  checkbox(state, 60, 428, /transport/i.test(data.meansOfSupport), "Transport prepaid");
  box(state, 42, 458, 500, 70);
  labelValue(state, 48, 473, "34. Person completing the form, if different from applicant", "", 8);
  box(state, 42, 528, 500, 64);
  labelValue(state, 48, 542, "Address / email / phone of person completing the form", "", 8);
  const consent = [
    "I am aware that the visa fee is not refunded if the visa is refused.",
    "I am aware that travel medical insurance is required for the first stay and for any later visits.",
    "I agree that the data required in this form, my photograph and, where applicable, fingerprints are collected for the decision on my visa application.",
    "The data may be stored in the Visa Information System for the period required by the applicable Schengen rules.",
  ];
  box(state, 42, 592, 500, 206);
  text(state, 54, 609, "Declarations and consent", 8, fontBold);
  wrappedText(state, 54, 632, consent.join(" "), 478, 8, 12);
  text(state, 42, 827, "Page 3/4", 8);
  return finish(state);
}

function renderPage4(data: VisaFormData): PdfPage {
  const state = newState();
  title(state, "APPLICATION FOR SCHENGEN VISA", "Declarations and signature", 34);
  const statements = [
    "I declare that all particulars supplied by me are correct and complete.",
    "I am aware that any false statements may lead to rejection of my application or annulment of a visa already granted.",
    "I undertake to leave the territory of the Member States before the expiry of the visa, if granted.",
    "I understand that possession of a visa is only one of the prerequisites for entry into the European territory of the Member States.",
    "Generated form data has been taken from the applicant questionnaire and verified passport fields in VisaFlow.",
  ];
  box(state, 42, 92, 500, 430);
  wrappedText(state, 54, 116, statements.join(" "), 475, 10, 16);
  box(state, 42, 540, 250, 90);
  labelValue(state, 54, 557, "Place and date", `${cityToLatin(data.addressCity || "")}, ${new Date().toISOString().slice(0, 10)}`, 10, 2);
  box(state, 292, 540, 250, 90);
  text(state, 304, 557, "Signature", 9, fontBold);
  line(state, 315, 600, 520, 600);
  box(state, 42, 650, 500, 120);
  text(state, 54, 668, "Applicant summary", 9, fontBold);
  const summary = [
    `Applicant: ${data.firstName} ${data.surname}`,
    `Passport: ${data.passportNo}`,
    `Trip: ${data.tripFrom} - ${data.tripTo} (${data.duration} days)`,
    `Destination: Spain / first entry: ${data.firstEntryCountry}`,
    `Accommodation: ${data.hotelName}, ${data.hotelAddress}`,
  ];
  summary.forEach((lineText, index) => text(state, 54, 695 + index * 15, lineText, 9));
  text(state, 42, 827, "Page 4/4", 8);
  return finish(state);
}

function newState(): DrawState {
  return {
    commands: ["q", "1 w", "0 G", "0 0 0 rg"],
    height: pageHeight,
  };
}

function finish(state: DrawState): PdfPage {
  return { content: [...state.commands, "Q"].join("\n") };
}

function title(state: DrawState, titleText: string, subtitle: string, top: number) {
  text(state, left, top, titleText, 15, fontBold);
  text(state, left, top + 19, subtitle, 9);
  line(state, left, top + 30, right, top + 30);
}

function labelValue(
  state: DrawState,
  x: number,
  top: number,
  label: string,
  value: string,
  valueSize = 9,
  maxLines = 1,
) {
  text(state, x, top, label, 7, fontBold);
  wrappedText(state, x, top + 17, value || " ", 230, valueSize, valueSize + 3, maxLines);
}

function checkbox(state: DrawState, x: number, top: number, checked: boolean, label: string) {
  box(state, x, top, 10, 10);
  if (checked) {
    line(state, x + 2, top + 5, x + 4, top + 8);
    line(state, x + 4, top + 8, x + 9, top + 2);
  }
  text(state, x + 15, top + 9, label, 8);
}

function box(state: DrawState, x: number, top: number, width: number, height: number) {
  const y = state.height - top - height;
  state.commands.push(`${n(x)} ${n(y)} ${n(width)} ${n(height)} re S`);
}

function line(state: DrawState, x1: number, top1: number, x2: number, top2: number) {
  const y1 = state.height - top1;
  const y2 = state.height - top2;
  state.commands.push(`${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
}

function text(
  state: DrawState,
  x: number,
  top: number,
  value: string,
  size = 9,
  font = fontRegular,
) {
  const y = state.height - top;
  state.commands.push(
    `BT /${font} ${n(size)} Tf ${n(x)} ${n(y)} Td (${escapePdfText(pdfText(value))}) Tj ET`,
  );
}

function wrappedText(
  state: DrawState,
  x: number,
  top: number,
  value: string,
  width: number,
  size = 9,
  leading = 12,
  maxLines = 9,
) {
  const words = pdfText(value).split(/\s+/).filter(Boolean);
  const maxChars = Math.max(8, Math.floor(width / Math.max(size * 0.48, 4)));
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  lines.slice(0, maxLines).forEach((lineText, index) =>
    text(state, x, top + index * leading, lineText, size),
  );
}

function createPdfBlob(pages: PdfPage[]): Blob {
  const objects: string[] = [];
  const catalogObject = 1;
  const pagesObject = 2;
  const regularFontObject = 3;
  const boldFontObject = 4;
  const firstPageObject = 5;
  const kids: string[] = [];

  objects[catalogObject] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`;
  objects[regularFontObject] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[boldFontObject] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pages.forEach((page, index) => {
    const pageObject = firstPageObject + index * 2;
    const contentObject = pageObject + 1;
    kids.push(`${pageObject} 0 R`);
    objects[pageObject] = `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${regularFontObject} 0 R /F2 ${boldFontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${byteLength(page.content)} >>\nstream\n${page.content}\nendstream`;
  });

  objects[pagesObject] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n%VisaFlow\n";
  const offsets = [0];
  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    const body = objects[objectNumber];
    if (!body) continue;
    offsets[objectNumber] = byteLength(pdf);
    pdf += `${objectNumber} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = byteLength(pdf);
  const size = objects.length;
  pdf += `xref\n0 ${size}\n`;
  pdf += "0000000000 65535 f \n";
  for (let objectNumber = 1; objectNumber < size; objectNumber += 1) {
    const offset = offsets[objectNumber] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${size} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function fieldReader(applicant: Applicant) {
  const values = new Map<string, string>();
  for (const section of applicant.sections) {
    for (const field of section.fields) values.set(field.id, field.value);
  }
  return (id: string, fallback = "") => values.get(id)?.trim() || fallback;
}

function applicantNameParts(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", surname: "" };
  const [first, ...rest] = parts;
  if (looksLikeSurname(first) && rest.length) {
    return { first: rest.join(" "), surname: first };
  }
  return { first, surname: rest.join(" ") || first };
}

function looksLikeSurname(value: string) {
  return /(?:ov|ova|ev|eva|in|ina|sky|skiy|skaya|ко|ов|ова|ев|ева|ин|ина|ский|ская)$/i.test(value.trim());
}

function dateForVisaForm(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const ru = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (ru) return `${ru[1]}-${ru[2]}-${ru[3]}`;
  return trimmed;
}

function durationDays(from: string, to: string): string {
  const start = parseVisaDate(from);
  const end = parseVisaDate(to);
  if (!start || !end || end < start) return "";
  return String(Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function parseVisaDate(value: string): Date | null {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCountry(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(рф|russia|russian federation)$/i.test(trimmed)) return "Russian Federation";
  if (/испания|spain/i.test(trimmed)) return "Spain";
  return trimmed;
}

function cityToLatin(value: string): string {
  if (value === "Москва") return "Moscow";
  if (value === "Санкт-Петербург") return "St Petersburg";
  return value;
}

function cleanPassport(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").replace(/[^\p{L}\p{N}_-]+/gu, "").slice(0, 32);
}

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

function firstNonEmpty(...values: string[]): string {
  return values.find((value) => value.trim())?.trim() ?? "";
}

function genderMatches(value: string, gender: "male" | "female") {
  const normalized = value.toLowerCase();
  if (gender === "male") return /male|муж|m\b/i.test(normalized) && !/female/i.test(normalized);
  return /female|жен|f\b/i.test(normalized);
}

function statusMatches(value: string, status: string) {
  return value.toLowerCase().includes(status.toLowerCase());
}

function purposeMatches(value: string, purpose: string) {
  const normalized = value.toLowerCase();
  if (purpose === "tour") return /tour|тур/i.test(normalized);
  if (purpose === "business") return /business|дел/i.test(normalized);
  if (purpose === "visit") return /visit|family|friends|род/i.test(normalized);
  return Boolean(normalized) && !/tour|business|visit|family|friends|тур|дел|род/i.test(normalized);
}

function costMatches(value: string, type: "applicant" | "sponsor") {
  const normalized = value.toLowerCase();
  if (type === "sponsor") return /sponsor|host|company|спонс/i.test(normalized);
  return !normalized || /applicant|self|заяв|сам/i.test(normalized);
}

function meansMatches(value: string, type: "cash" | "credit") {
  const normalized = value.toLowerCase();
  if (type === "credit") return /credit|card|карт/i.test(normalized);
  return !normalized || /cash|нал/i.test(normalized);
}

function pdfText(value: string): string {
  return value
    .split("")
    .map((character) => transliteration[character] ?? character)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function n(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
