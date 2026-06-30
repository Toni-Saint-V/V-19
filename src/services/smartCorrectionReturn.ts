import { normalizeSubmission, submissionPreflight } from "../lib/workflow";
import type { CorrectionNote, Submission } from "../types/domain";
import { buildTextIntakeReviewDisplay } from "./textIntakeReviewDisplay";
import { reviewTextIntake } from "./textIntakeReviewer";

export interface SmartCorrectionReturnOptions {
  createdBy: string;
  createdAt: string;
  idFactory?: () => string;
  maxNotes?: number;
}

export interface SmartCorrectionReturnPackage {
  notes: CorrectionNote[];
  summary: string;
  source: "text_intake_review" | "agent_preflight_fallback";
  guardrails: string[];
  candidateCount: number;
  addedCount: number;
  skippedExistingCount: number;
  truncatedCount: number;
}

type SmartCorrectionReturnSource = SmartCorrectionReturnPackage["source"];
type ReturnMetadata = Required<
  Pick<SmartCorrectionReturnOptions, "createdAt" | "createdBy">
> & {
  idFactory: () => string;
};

interface ExistingCorrectionIndex {
  keys: ReadonlySet<string>;
  texts: ReadonlySet<string>;
}

const smartReturnGuardrails = [
  "Замечания подготовлены как черновик для ручного возврата оператором.",
  "Сервис не принимает заявку, не отклоняет визу и не заменяет проверку медиа.",
  "Отсутствующие документы, OCR и загрузки не считаются выполненными автоматически.",
];

function openCorrectionKey(note: CorrectionNote): string {
  return [
    note.scope ?? "submission",
    note.applicantId ?? "",
    note.fieldKey ?? "",
    note.mediaType ?? "",
    note.target.trim(),
    correctionTextKey(note.text),
  ].join("|");
}

function correctionTextKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^(исправьте перед повторной передачей:\s*)+/g, "")
    .replace(/селфи\s*(?:n|№)\s*1/g, "селфи 1")
    .replace(/селфи\s*(?:n|№)\s*2/g, "селфи 2")
    .replace(/\s+/g, " ");
}

function isOpenCorrection(note: CorrectionNote): boolean {
  return (note.status ?? "open") === "open";
}

function displayTarget(note: CorrectionNote): string {
  if (note.target === "Case questionnaire") return "Заявка";
  return note.target.replace(/^Case · /, "Заявка · ");
}

function withReturnMetadata(
  note: CorrectionNote,
  options: ReturnMetadata,
): CorrectionNote {
  return {
    ...note,
    id: options.idFactory(),
    target: displayTarget(note),
    status: "open",
    severity: note.severity ?? "blocking",
    createdBy: options.createdBy,
    createdAt: options.createdAt,
  };
}

function fallbackCorrection(text: string, options: ReturnMetadata): CorrectionNote {
  return {
    id: options.idFactory(),
    target: "Ручная проверка",
    scope: "submission",
    severity: "blocking",
    status: "open",
    text,
    createdBy: options.createdBy,
    createdAt: options.createdAt,
  };
}

function fallbackNoteText(blocker: string): string {
  return `Исправьте перед повторной передачей: ${blocker}`;
}

function uniqueCorrectionTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  return texts.filter((text) => {
    const key = correctionTextKey(text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textReviewSummary({
  addedCount,
  skippedExistingCount,
  truncatedCount,
}: Pick<
  SmartCorrectionReturnPackage,
  "addedCount" | "skippedExistingCount" | "truncatedCount"
>): string {
  if (!addedCount) {
    return `Новые замечания не добавлены: ${skippedExistingCount} уже открыто.`;
  }

  const details = [`добавлено ${addedCount}`];
  if (skippedExistingCount) details.push(`уже было открыто ${skippedExistingCount}`);
  if (truncatedCount)
    details.push(`ещё ${truncatedCount} осталось в текстовой проверке`);
  return `Текстовая проверка: ${details.join(", ")}.`;
}

function preflightSummary(addedCount: number, truncatedCount: number): string {
  const details = [`добавлено ${addedCount}`];
  if (truncatedCount) details.push(`ещё ${truncatedCount} осталось в preflight`);
  return `Preflight: ${details.join(", ")}.`;
}

function emptyPreflightSummary(skippedExistingCount: number): string {
  return `Preflight: новые замечания не добавлены: ${skippedExistingCount} уже открыто.`;
}

function packageResult({
  notes,
  source,
  candidateCount,
  skippedExistingCount = 0,
  truncatedCount,
  summary,
}: {
  notes: CorrectionNote[];
  source: SmartCorrectionReturnSource;
  candidateCount: number;
  skippedExistingCount?: number;
  truncatedCount: number;
  summary: string;
}): SmartCorrectionReturnPackage {
  return {
    notes,
    source,
    summary,
    guardrails: smartReturnGuardrails,
    candidateCount,
    addedCount: notes.length,
    skippedExistingCount,
    truncatedCount,
  };
}

function existingCorrectionIndex(notes: CorrectionNote[]): ExistingCorrectionIndex {
  const openNotes = notes.filter(isOpenCorrection);
  return {
    keys: new Set(openNotes.map(openCorrectionKey)),
    texts: new Set(openNotes.map((note) => correctionTextKey(note.text)).filter(Boolean)),
  };
}

function textCorrectionCandidates(
  normalized: Submission,
  metadata: ReturnMetadata,
): CorrectionNote[] {
  const displayReview = buildTextIntakeReviewDisplay(reviewTextIntake(normalized));
  return displayReview.review.correctionCandidates.map((candidate) =>
    withReturnMetadata(candidate, metadata),
  );
}

function isNewCorrection(
  note: CorrectionNote,
  existing: ExistingCorrectionIndex,
): boolean {
  return (
    !existing.keys.has(openCorrectionKey(note)) &&
    !existing.texts.has(correctionTextKey(note.text))
  );
}

function emptyTextCorrectionPackage(
  candidateCount: number,
  skippedExistingCount: number,
): SmartCorrectionReturnPackage {
  return packageResult({
    notes: [],
    source: "text_intake_review",
    candidateCount,
    skippedExistingCount,
    truncatedCount: 0,
    summary: textReviewSummary({
      addedCount: 0,
      skippedExistingCount,
      truncatedCount: 0,
    }),
  });
}

function limitedTextNotes(
  notesToAdd: CorrectionNote[],
  metadata: ReturnMetadata,
  existing: ExistingCorrectionIndex,
  maxNotes: number,
): { notes: CorrectionNote[]; truncatedCount: number } {
  const selectedLimit =
    notesToAdd.length > maxNotes ? Math.max(0, maxNotes - 1) : maxNotes;
  const selectedNotes = notesToAdd.slice(0, selectedLimit);
  const truncatedCount = notesToAdd.length - selectedNotes.length;
  const overflowText = `Есть ещё ${truncatedCount} текстовых замечаний. Проверьте текстовую проверку перед повторной передачей.`;
  const overflowNote =
    truncatedCount > 0 && !existing.texts.has(overflowText)
      ? [fallbackCorrection(overflowText, metadata)]
      : [];

  return { notes: [...selectedNotes, ...overflowNote], truncatedCount };
}

function buildTextCorrectionPackage(
  normalized: Submission,
  metadata: ReturnMetadata,
  existing: ExistingCorrectionIndex,
  maxNotes: number,
): SmartCorrectionReturnPackage | null {
  const candidates = textCorrectionCandidates(normalized, metadata);
  if (!candidates.length) return null;

  const notesToAdd = candidates.filter((note) => isNewCorrection(note, existing));
  const skippedExistingCount = candidates.length - notesToAdd.length;

  if (!notesToAdd.length) {
    return emptyTextCorrectionPackage(candidates.length, skippedExistingCount);
  }

  const { notes, truncatedCount } = limitedTextNotes(
    notesToAdd,
    metadata,
    existing,
    maxNotes,
  );

  return packageResult({
    notes,
    source: "text_intake_review",
    candidateCount: candidates.length,
    skippedExistingCount,
    truncatedCount,
    summary: textReviewSummary({
      addedCount: notes.length,
      skippedExistingCount,
      truncatedCount,
    }),
  });
}

function buildAgentPreflightFallbackPackage(
  normalized: Submission,
  metadata: ReturnMetadata,
  existing: ExistingCorrectionIndex,
  maxNotes: number,
): SmartCorrectionReturnPackage {
  const blockerTexts = submissionPreflight(normalized)
    .blockers.map((blocker) => blocker.trim())
    .filter(Boolean)
    .map(fallbackNoteText);
  const candidateTexts = blockerTexts.length
    ? blockerTexts
    : [
        fallbackNoteText(
          "Оператор вернул заявку на ручное уточнение перед повторной передачей.",
        ),
      ];
  const uniqueCandidateTexts = uniqueCorrectionTexts(candidateTexts);
  const noteTextsToAdd = uniqueCandidateTexts.filter(
    (text) => !existing.texts.has(correctionTextKey(text)),
  );
  const skippedExistingCount = uniqueCandidateTexts.length - noteTextsToAdd.length;

  if (!noteTextsToAdd.length) {
    return packageResult({
      notes: [],
      source: "agent_preflight_fallback",
      candidateCount: uniqueCandidateTexts.length,
      skippedExistingCount,
      truncatedCount: 0,
      summary: emptyPreflightSummary(skippedExistingCount),
    });
  }

  const notes = noteTextsToAdd
    .slice(0, maxNotes)
    .map((text) => fallbackCorrection(text, metadata));
  const truncatedCount = Math.max(0, noteTextsToAdd.length - notes.length);

  return packageResult({
    notes,
    source: "agent_preflight_fallback",
    candidateCount: uniqueCandidateTexts.length,
    skippedExistingCount,
    truncatedCount,
    summary: preflightSummary(notes.length, truncatedCount),
  });
}

export function buildSmartCorrectionReturnPackage(
  submission: Submission,
  options: SmartCorrectionReturnOptions,
): SmartCorrectionReturnPackage {
  const normalized = normalizeSubmission(submission);
  const maxNotes = Math.max(1, Math.floor(options.maxNotes ?? 12));
  const metadata = {
    createdBy: options.createdBy,
    createdAt: options.createdAt,
    idFactory: options.idFactory ?? crypto.randomUUID.bind(crypto),
  };
  const existing = existingCorrectionIndex(normalized.notes);
  const textPackage = buildTextCorrectionPackage(
    normalized,
    metadata,
    existing,
    maxNotes,
  );

  return (
    textPackage ??
    buildAgentPreflightFallbackPackage(normalized, metadata, existing, maxNotes)
  );
}
